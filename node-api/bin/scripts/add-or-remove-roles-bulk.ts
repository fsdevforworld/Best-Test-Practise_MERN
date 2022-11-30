/* tslint:disable:no-console */
import * as yargs from 'yargs';
import * as readline from 'readline';
import { QueryTypes } from 'sequelize';
import { UserRole } from '@dave-inc/wire-typings';
import { sequelize } from '../../src/models';

import { getGCSFileStream } from '../../src/lib/gcloud-storage';
import { runTaskGracefully } from '../../src/lib/utils';

const UPDATE_BATCH_SIZE = 100;

/**
 add-roles-bulk.ts <roleName> -f fileName --bucket bucketName

 Bulk add roles to a list of users from Google Cloud Storage

 roleName   [string] [choices: <values from UserRole enumeration>]

 Options:
 -f, --fileName                                             [string] [required]
 --bucketName, --bucket                                     [string] [required]
 --help                  Show help                                    [boolean]
 --remove
 */
async function run() {
  const args = yargs(process.argv.slice(2))
    .version(false)
    .usage(
      '$0 <roleName>',
      'Bulk add or remove a role for a list of users from Google Cloud Storage',
      argv =>
        argv.positional('roleName', {
          demandOption: true,
          type: 'string',
          choices: Object.values(UserRole),
        }),
    )
    .options({
      fileName: {
        alias: 'f',
        type: 'string',
        demandOption: true,
      },
      bucketName: {
        alias: 'bucket',
        type: 'string',
        demandOption: true,
      },
      remove: {
        type: 'boolean',
        description: 'Remove role instead of adding',
        default: false,
      },
    })
    .help().argv;

  const file = await getGCSFileStream(args.bucketName, args.fileName);
  const rl = readline.createInterface({ input: file, crlfDelay: Infinity });

  const roleName = args.roleName as UserRole;

  let updateFunc = insertUserRoles;
  if (args.remove) {
    updateFunc = deleteUserRoles;
  }

  let userIds: number[] = [];
  let usersUpdated = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const userId = parseInt(trimmed, 10);
    if (userId) {
      userIds.push(userId);
    } else {
      console.warn('Invalid user ID', line);
    }

    if (userIds.length >= UPDATE_BATCH_SIZE) {
      usersUpdated += await updateFunc(roleName, userIds);
      userIds = [];
    }
  }

  if (userIds.length) {
    usersUpdated += await updateFunc(roleName, userIds);
  }

  console.log(
    `Role ${roleName} ${args.remove ? 'removed from' : 'added to'} ${usersUpdated} users`,
  );
}

async function insertUserRoles(role: UserRole, userIds: number[]) {
  // insert roles for any user in the list that doesn't have that role yet
  const [, count] = await sequelize.query(
    `
        INSERT INTO user_role (user_id, role_id)
        SELECT u.id AS user_id, (select id from role where name = ?) as role_id
        FROM user u
                 LEFT JOIN user_role ur ON ur.user_id = u.id
                    AND ur.deleted is null
                    AND ur.role_id = (select id from role where name = ?)
        WHERE ur.id IS NULL
          AND u.id IN (?);
        `,
    {
      type: QueryTypes.INSERT,
      replacements: [role, role, userIds],
    },
  );

  return count;
}

async function deleteUserRoles(role: UserRole, userIds: number[]) {
  // soft-delete roles for any users that have them active
  const [, count] = await sequelize.query(
    `
        UPDATE user_role ur
        JOIN role r on r.id = ur.role_id
        SET ur.deleted = NOW()
        WHERE r.name = ? and ur.user_id in (?) and ur.deleted is null
        `,
    {
      type: QueryTypes.UPDATE,
      replacements: [role, userIds],
    },
  );

  return count;
}

if (require.main === module) {
  runTaskGracefully(run, 10);
}
