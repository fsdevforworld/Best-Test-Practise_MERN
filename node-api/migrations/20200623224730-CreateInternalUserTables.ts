import { DBItem, DBType } from 'db-migrate';

export let dbm: any;
export let type: DBType;

/**
 * We receive the dbmigrate dependency from dbmigrate initially.
 * This enables us to not have to rely on NODE_PATH.
 */
export function setup(options: any): void {
  dbm = options.dbmigrate;
  type = dbm.dataType;
}

export async function up(db: DBItem) {
  try {
    await db.runSql(
      "CREATE TABLE `internal_user`(\
        `id` int(11) NOT NULL AUTO_INCREMENT,\
        `email` varchar(256) NOT NULL COLLATE utf8mb4_unicode_ci,\
        `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
        `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
        `deleted` datetime NOT NULL DEFAULT '9999-12-31 23:59:59',\
        PRIMARY KEY (`id`),\
        UNIQUE KEY `email_deleted_idx` (`email`, `deleted`)\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    );

    await db.runSql(
      'CREATE TABLE `internal_user_session`(\
        `id` int(11) NOT NULL AUTO_INCREMENT,\
        `internal_user_id` int(11) NOT NULL,\
        `token` varchar(256) NOT NULL COLLATE utf8mb4_unicode_ci,\
        `device_id` varchar(256) NOT NULL COLLATE utf8mb4_unicode_ci,\
        `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
        `revoked` datetime DEFAULT NULL,\
        PRIMARY KEY (`id`),\
        KEY `device_id_idx` (`device_id`),\
        KEY `internal_user_id_fk` (`internal_user_id`),\
        UNIQUE KEY `token_idx` (`token`),\
        CONSTRAINT `internal_user_session_internal_user_id_fk` FOREIGN KEY (`internal_user_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    );

    await db.runSql(
      'CREATE TABLE `internal_role`(\
        `id` int(11) NOT NULL AUTO_INCREMENT,\
        `name` varchar(256) NOT NULL COLLATE utf8mb4_unicode_ci,\
        `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
        `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
        `deleted` datetime DEFAULT NULL,\
        PRIMARY KEY (`id`),\
        UNIQUE KEY `name` (`name`)\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;',
    );

    await db.runSql(
      "CREATE TABLE `internal_role_assignment`(\
        `id` int(11) NOT NULL AUTO_INCREMENT,\
        `internal_user_id` int(11) NOT NULL,\
        `internal_role_id` int(11) NOT NULL,\
        `created` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,\
        `updated` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\
        `deleted` datetime NOT NULL DEFAULT '9999-12-31 23:59:59',\
        PRIMARY KEY (`id`),\
        UNIQUE KEY `user_role_deleted_idx` (`internal_user_id`, `internal_role_id`, `deleted`),\
        KEY `internal_user_id_fk` (`internal_user_id`),\
        KEY `internal_user_role_fk` (`internal_role_id`),\
        CONSTRAINT `internal_role_assignment_internal_user_id_fk` FOREIGN KEY (`internal_user_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION,\
        CONSTRAINT `internal_role_assignment_internal_role_id_fk` FOREIGN KEY (`internal_role_id`) REFERENCES `internal_role` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION\
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
    );
  } catch (ex) {
    await down(db);
    throw ex;
  }
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS `internal_role_assignment`;');
  await db.runSql('DROP TABLE IF EXISTS `internal_role`;');
  await db.runSql('DROP TABLE IF EXISTS `internal_user_session`;');
  await db.runSql('DROP TABLE IF EXISTS `internal_user`;');
}

export const _meta = {
  version: 1,
};
