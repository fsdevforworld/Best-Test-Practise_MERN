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
  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     DROP FOREIGN KEY `fraud_rule_created_by_user_id_fk`\
     ',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     DROP FOREIGN KEY `fraud_rule_updated_by_user_id_fk`\
     ',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     ADD CONSTRAINT `fraud_rule_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     ADD CONSTRAINT `fraud_rule_updated_by_user_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    'ALTER TABLE `fraud_rule`\
    DROP FOREIGN KEY `fraud_rule_created_by_user_id_fk`',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
    DROP FOREIGN KEY `fraud_rule_updated_by_user_id_fk`',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     ADD CONSTRAINT `fraud_rule_created_by_user_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );

  await db.runSql(
    'ALTER TABLE `fraud_rule`\
     ADD CONSTRAINT `fraud_rule_updated_by_user_id_fk` FOREIGN KEY (`updated_by_user_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export const _meta = {
  version: 1,
};
