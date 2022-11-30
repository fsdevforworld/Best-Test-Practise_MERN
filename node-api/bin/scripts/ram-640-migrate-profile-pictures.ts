import * as Bluebird from 'bluebird';
import { QueryTypes } from 'sequelize';
import * as _ from 'lodash';
import { runTaskGracefully, processInBatches } from '../../src/lib/utils';
import { User, sequelize } from '../../src/models';
import logger from '../../src/lib/logger';
import { copyFile } from '../../src/lib/gcloud-storage';
import { URL } from 'url';
import * as Path from 'path';
import * as uuid from 'uuid';

const GCS_HOSTNAME = 'storage.googleapis.com';
const LEGACY_FOLDER_NAME = 'profile-images';
const NEW_FOLDER_NAME = 'user-profile-images';
const BATCH_RUN_LIMIT = 1;

let numberOfProcessedBatches = 0;
let numberOfProcessedUsers = 0;

type GCSFilePath = {
  bucket: string;
  filename: string;
  directory?: string;
};

function getConfig() {
  const {
    CONCURRENCY = '1',
    BATCH_SIZE = '10',
    DRY_RUN = 'true',
    BATCH_RUN = 'true',
  } = process.env;
  return {
    concurrency: parseInt(CONCURRENCY, 10),
    batchSize: parseInt(BATCH_SIZE, 10),
    dryRun: DRY_RUN !== 'false',
    batchRun: BATCH_RUN !== 'false',
  };
}

/*
 * This function expects a self link, not an API URL. The self link has a specific format,
 * which does not include '/storage/<version>/'. The bucket name directly follows the hostname.
 */
export function getGCSInfoFromSelfLink(link: string): GCSFilePath | null {
  let url: URL | null = null;
  try {
    url = new URL(link);
  } catch (e) {
    return null;
  }
  const pathObj = Path.parse(Path.normalize(url.pathname));
  const filename = pathObj.base;
  const ext = pathObj.ext;
  const path = pathObj.dir.split('/').slice(1); // Drop the empty string at the front of the array
  const hostname = url.hostname;
  if (hostname !== GCS_HOSTNAME || filename === '' || ext === '' || path.length < 1) {
    return null;
  }

  const bucket = path[0];
  const directory =
    path.length > 1
      ? _.range(1, path.length)
          .map(i => path[i])
          .join('/')
      : undefined;

  return directory ? { bucket, filename, directory } : { bucket, filename };
}

export function generateFilename(original: string): string {
  const path = Path.parse(original);
  return path.ext !== '' ? `${uuid.v4()}${path.ext}` : uuid.v4();
}

export function generateParentDirectory(path: string | null, parent: string): string | null {
  const dropped = path ? Path.parse(Path.normalize(path)).dir.split('/') : [];
  const filtered = _.dropWhile(dropped, next => next === '');
  const appended = _.concat(filtered, parent).join('/');
  return appended;
}

export function makePath(path: GCSFilePath): string {
  return path.directory ? `${path.directory}/${path.filename}` : path.filename;
}

export function makeURL(path: GCSFilePath): string {
  return `https://${GCS_HOSTNAME}/${path.bucket}/${makePath(path)}`;
}

export class UsersProfileImage {
  public static async copyUserProfileImage(
    src: GCSFilePath,
    dst: GCSFilePath,
  ): Promise<string | null> {
    if (getConfig().dryRun) {
      return makeURL(dst);
    }
    const newFile = await copyFile(makePath(src), makePath(dst), {
      srcBucketName: src.bucket,
      dstBucketName: dst.bucket,
    });
    const [metadata] = await newFile.getMetadata();
    await newFile.makePublic();
    return metadata.selfLink || null;
  }

  public static async updateUserProfileImage(
    userId: number,
    profileImage: string,
  ): Promise<User | null> {
    if (getConfig().dryRun) {
      return null;
    }
    return UsersProfileImage.updateSQL(userId, profileImage);
  }

  public static async updateSQL(id: number, profileImage: string): Promise<User | null> {
    const user = await User.findByPk(id);
    if (user) {
      return user.update({ profileImage });
    } else {
      return null;
    }
  }

  public static async getBatch(
    limit: number,
    _offset: number,
    previous: Array<Partial<User>>,
  ): Promise<Array<Partial<User>>> {
    const highestProcessedId = previous?.length ? previous[previous.length - 1].id : 0;

    return sequelize.query(
      `
      SELECT id, profile_image AS profileImage
      FROM user
      WHERE deleted = '9999-12-31 23:59:59'
      AND id > ?
      AND profile_image LIKE 'https://${GCS_HOSTNAME}%/${LEGACY_FOLDER_NAME}/%'
      ORDER BY id ASC
      LIMIT ?
    `,
      { type: QueryTypes.SELECT, replacements: [highestProcessedId, limit] },
    );
  }

  public static async migrateProfileImage(user: Partial<User>): Promise<Pick<User, 'id'> | null> {
    if (user.profileImage) {
      const src = getGCSInfoFromSelfLink(user.profileImage);
      if (src) {
        const dst: GCSFilePath = {
          bucket: src.bucket,
          directory: generateParentDirectory(src.directory, NEW_FOLDER_NAME),
          filename: generateFilename(src.filename),
        };
        const selfLink = await UsersProfileImage.copyUserProfileImage(src, dst);
        if (selfLink) {
          const dstLink = makeURL(dst);
          logger.info('[RAM-640] - Logging legacy profile picture for user before update', {
            userId: user.id,
            legacyProfileImage: user.profileImage,
            newProfileImage: dstLink,
          });
          return await UsersProfileImage.updateUserProfileImage(user!.id, dstLink);
        }
        logger.error('[RAM-640] - New profile image URL not found', {
          userId: user.id,
        });
        return null;
      }
      logger.error('[RAM-640] - Invalid profile image link', {
        userId: user.id,
        profileImage: user.profileImage,
      });
      return null;
    }
    logger.error('[RAM-640] - User selected without profile image', {
      userId: user.id,
    });
    return null;
  }
}

export async function processBatch(
  users: Array<Partial<User>>,
  _offset: number,
): Promise<number[]> {
  logger.info(
    `[RAM-640] - Fetched ${users.length} users to update in batch #${numberOfProcessedBatches + 1}`,
  );
  const chunkedUsers = _.chunk(users, 5);
  const migrated = await Bluebird.map(
    chunkedUsers,
    async chunkedUserGroup => {
      const results = await chunkedUserGroup.map(
        async user => await UsersProfileImage.migrateProfileImage(user),
      );
      const changed = Promise.all(results).then(values =>
        values.filter(each => each !== null).map(each => each.id),
      );
      const unchanged = changed.then(values =>
        _.xor(
          values,
          chunkedUserGroup.map(each => each.id),
        ),
      );
      logger.info(`[RAM-640] - Updated users with ids: [${_.join(await changed, ',')}]`);
      logger.error(`[RAM-640] - No update for users with ids: [${_.join(await unchanged, ',')}]`);
      return changed;
    },
    { concurrency: getConfig().concurrency },
  );

  numberOfProcessedUsers += users.length;
  numberOfProcessedBatches += 1;

  logger.info(
    `[RAM-640] - Processed a total number of ${numberOfProcessedBatches} batches and updated ${numberOfProcessedUsers} users`,
  );

  if (getConfig().batchRun) {
    if (numberOfProcessedBatches >= BATCH_RUN_LIMIT) {
      logger.info(`[RAM-640] - Batch run exiting at batch limit: ${BATCH_RUN_LIMIT}`);
      process.exit(0);
    }
  }
  return _.flatten(migrated);
}

async function migrateProfileImages() {
  if (getConfig().dryRun) {
    logger.info('[RAM-640] - Starting in Dry Run mode');
  } else {
    logger.info('[RAM-640] - Starting in REAL mode');
  }
  if (getConfig().batchRun) {
    logger.info('[RAM-640] - Starting in Batch Run mode');
  }
  await processInBatches(UsersProfileImage.getBatch, processBatch, getConfig().batchSize);
}

if (require.main === module) {
  runTaskGracefully(() => migrateProfileImages());
}
