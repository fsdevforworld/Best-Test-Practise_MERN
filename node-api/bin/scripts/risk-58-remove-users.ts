import { AdminComment, User } from '../../src/models';

import * as Bluebird from 'bluebird';
import * as config from 'config';
import AccountManagement from '../../src/domain/account-management';
import logger from '../../src/lib/logger';
import { runTaskGracefully } from '../../src/lib/utils';
import { getGCSFile } from '../../src/lib/gcloud-storage';
import { InstanceUpdateOptionsWithMetadata } from 'src/typings/sequelize';

const ADMIN_ID = 11046816; // Jiezhen Yi's internal user id

async function removeUser(id: string): Promise<{ id: string; success: boolean }> {
  try {
    const daveUserId = parseInt(id, 10);
    logger.info('Removing user: ' + id);
    const user = await User.findByPk(daveUserId);
    if (user) {
      const hasOutstandingAdvance = await user.hasOutstandingAdvances();
      if (hasOutstandingAdvance) {
        logger.info(`User ${id} has outstanding balance`);
        const advances = await user.getAdvances();
        for (const advance of advances) {
          if (advance.outstanding > 0) {
            await advance.update({ outstanding: 0, paybackFrozen: true }, {
              metadata: { source: 'admin', adminId: ADMIN_ID },
            } as InstanceUpdateOptionsWithMetadata);
          }
        }
      }
      await AccountManagement.removeUserAccountById({
        userId: daveUserId,
        reason: 'User closed due to under 18',
        options: {
          additionalInfo: 'RISK-58',
        },
      });
      await AdminComment.create({
        userId: daveUserId,
        authorId: ADMIN_ID,
        message: 'User Account Closed due to under 18 age restriction. See RISK-58',
      });
    } else {
      logger.info(`Ignoring user ${id} because it doesn't exist or already removed`);
    }
    return { id, success: true };
  } catch (e) {
    logger.error('Error removing user', { error: e, daveUserId: id });
    return { id, success: false };
  }
}

async function run({
  bucketName = config.get('googleCloud.projectId'),
  fileName = 'scripts/risk-58-under-18-users/users.csv',
}: {
  bucketName?: string;
  fileName?: string;
} = {}) {
  const file = await getGCSFile(bucketName, fileName);
  const data = await file.download();

  const rows = data[0]
    .toString()
    .split('\n')
    .filter(a => a) // Removes last line, essentially.
    .map(a => a);

  if (!rows || rows.length === 0) {
    logger.info('Nothing to delete');
    process.exit(0);
  }

  logger.info(`Removing ${rows.length} users`);

  const results = await Bluebird.map(rows, x => removeUser(x), {
    concurrency: 100,
  });

  const errorList = [];
  for (const result of results) {
    if (!result.success) {
      errorList.push(result.id);
    }
  }

  if (errorList.length) {
    logger.info('The following users were not removed', { errorList });
  } else {
    logger.info('All users were removed');
  }
}

runTaskGracefully(() => run());
