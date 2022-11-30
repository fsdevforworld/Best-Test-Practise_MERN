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
  await db.runSql('DROP TABLE IF EXISTS `internal_user_session`;');
}

export async function down(db: DBItem): Promise<void> {
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
}

export const _meta = {
  version: 1,
};
