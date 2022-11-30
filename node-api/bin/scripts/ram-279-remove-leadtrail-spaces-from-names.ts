import logger from '../../src/lib/logger';
import { sequelize, User } from '../../src/models';

async function removeLeadingTrailingSpaces() {
  logger.info(`starting ram-279 removing leading trailing spaces`);
  const missedUsers: User[] = [];
  const users: User[] = await sequelize.query(
    `select id, first_name, last_name
  from user
  where
    first_name regexp '^[[.space.][.newline.][.tab.][.vertical-tab.][.form-feed.][.carriage-return.]]' = 1
    or first_name regexp '[[.space.][.newline.][.tab.][.vertical-tab.][.form-feed.][.carriage-return.]]$' = 1
    OR last_name regexp '^[[.space.][.newline.][.tab.][.vertical-tab.][.form-feed.][.carriage-return.]]' = 1
    or last_name regexp '[[.space.][.newline.][.tab.][.vertical-tab.][.form-feed.][.carriage-return.]]$' = 1
  `,
    { mapToModel: true, model: sequelize.models.User },
  );

  // there are ~36k rows in prod replica
  // yes, we do have some users with tabs and newlines in their names :)
  logger.info(`found ${users.length} users to trim`);
  let count = 0;
  for await (const user of users) {
    count++;
    try {
      await User.update(
        { firstName: user.firstName.trim(), lastName: user.lastName.trim() },
        { where: { id: user.id } },
      );
    } catch (err) {
      missedUsers.push(user);
      logger.error(
        `couldnt trim names for userId ${JSON.stringify(user)} because ${JSON.stringify(err)}`,
      );
    }
    if (count % 1000 === 0) {
      logger.info(`trimmed ${count}`);
    }
  }
  if (missedUsers.length > 0) {
    logger.error(
      `encountered error trimming names for following users: ${JSON.stringify(missedUsers)}`,
    );
  }
  logger.info(`finished ram-279 trimming user names ${count}`);
}

removeLeadingTrailingSpaces()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Error in script ram-279 trimming users names', { error: err });
    process.exit(1);
  });
