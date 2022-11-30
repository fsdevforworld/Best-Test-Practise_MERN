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
    'ALTER TABLE `reimbursement`\
     DROP FOREIGN KEY `reimbursement_reimburser_id_foreign`\
     ',
  );

  await db.runSql(
    'ALTER TABLE `reimbursement`\
     ADD CONSTRAINT `reimbursement_reimburser_id_fk` FOREIGN KEY (`reimburser_id`) REFERENCES `internal_user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    'ALTER TABLE `reimbursement`\
    DROP FOREIGN KEY `reimbursement_reimburser_id_fk`',
  );

  await db.runSql(
    'ALTER TABLE `reimbursement`\
     ADD CONSTRAINT `reimbursement_reimburser_id_foreign` FOREIGN KEY (`reimburser_id`) REFERENCES `user` (`id`) ON DELETE NO ACTION ON UPDATE NO ACTION;\
     ',
  );
}

export const _meta = {
  version: 1,
};
