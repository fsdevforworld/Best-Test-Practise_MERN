import { UserSettingName, UserSetting, User } from '../../src/models';
import * as config from 'config';
import logger from '../../src/lib/logger';
import { SettingName } from '../../src/typings';
import { getGCSFileStream } from '../../src/lib/gcloud-storage';
import * as readline from 'readline';
//import * as fs from 'fs';

async function insertUserSettings() {
  logger.info(`starting ram-327 showing banner`);
  logger.info(`check for name setting name...`);

  const showBannerSettingNameId = 3;
  const settingName = await UserSettingName.findOne({
    where: { id: 3, name: SettingName.ShowBanner },
  });
  if (!settingName) {
    await UserSettingName.create({ id: showBannerSettingNameId, name: SettingName.ShowBanner });
    logger.info(`created settingName.`);
  } else {
    logger.info(`settingName exists.`);
  }

  const fileName = 'scripts/ram-237-banner-users/user-settings.json';

  // 20 min on my local docker running against a file on localfs for 370k
  // const file = await fs.createReadStream('/user_ids.txt');
  // const rl = readline.createInterface({input: file, crlfDelay: Infinity});

  let maxUserIdAlreadySet: number = await UserSetting.max('userId', {
    where: { userSettingNameId: showBannerSettingNameId },
  });
  if (isNaN(maxUserIdAlreadySet)) {
    maxUserIdAlreadySet = 0;
  }
  logger.info(`already inserted up to userId ${maxUserIdAlreadySet}`);

  const bucketName = config.get<string>('googleCloud.projectId');
  const file = await getGCSFileStream(bucketName, fileName);
  const rl = readline.createInterface({ input: file, crlfDelay: Infinity });

  const missedUserIds: number[] = [];
  const userIds: number[] = [];

  let skippedCount = 0;
  logger.info(`streaming ${fileName}`);
  for await (const line of rl) {
    const userId = parseInt(line.trim(), 10);
    if (isNaN(userId)) {
      logger.info(`skipping ${line} because Nan`);
      continue;
    }
    if (userId > maxUserIdAlreadySet) {
      userIds.push(userId);
    } else {
      skippedCount++;
    }
  }
  logger.info(
    `streamed ${fileName} into array of length ${userIds.length}, skipped ${skippedCount} that were already inserted`,
  );

  let count = 0;
  for (const userId of userIds) {
    count++;
    try {
      await UserSetting.create({
        userId,
        userSettingNameId: showBannerSettingNameId,
        value: 'true',
      });
    } catch (err) {
      const userExists = User.findByPk(userId);
      if (userExists) {
        missedUserIds.push(userId);
        logger.error(
          `couldnt insert user setting for userId ${userId} because ${JSON.stringify(err)}`,
        );
      }
    }
    if (count % 1000 === 0) {
      logger.info(`worked on ${count}`);
    }
  }
  logger.error(
    `encountered error adding user setting for following users: ${missedUserIds.join(', ')}`,
  );
  logger.info(`finished ram-237 showing banner successfully inserted ${count}`);
}

insertUserSettings()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Error in script ram-237-user-setting-for-banner', { error: err });
    process.exit(1);
  });
