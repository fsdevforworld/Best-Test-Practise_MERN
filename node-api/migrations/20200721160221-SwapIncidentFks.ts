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
  await db.runSql('ALTER TABLE `incident`\
     DROP FOREIGN KEY `incident_creator_id_fk`\
     ');

  await db.runSql('ALTER TABLE `incident`\
     DROP FOREIGN KEY `incident_resolver_id_fk`\
     ');

  await db.runSql(
    'ALTER TABLE `incident`\
     ADD CONSTRAINT `incident_creator_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );

  await db.runSql(
    'ALTER TABLE `incident`\
     ADD CONSTRAINT `incident_resolver_id_fk` FOREIGN KEY (`resolver_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('ALTER TABLE `incident`\
    DROP FOREIGN KEY `incident_creator_id_fk`');

  await db.runSql('ALTER TABLE `incident`\
    DROP FOREIGN KEY `incident_resolver_id_fk`');

  await db.runSql(
    'ALTER TABLE `incident`\
     ADD CONSTRAINT `incident_creator_id_fk` FOREIGN KEY (`creator_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );

  await db.runSql(
    'ALTER TABLE `incident`\
     ADD CONSTRAINT `incident_resolver_id_fk` FOREIGN KEY (`resolver_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export const _meta = {
  version: 1,
};
