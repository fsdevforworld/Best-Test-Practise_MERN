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
  await db.runSql(`
    ALTER TABLE advance
      ADD COLUMN disbursement_bank_transaction_uuid CHAR(36) DEFAULT NULL
        AFTER disbursement_bank_transaction_id,
      ADD INDEX disbursement_bank_transaction_uuid_idx (disbursement_bank_transaction_uuid)
  `);
  await db.runSql(`
    ALTER TABLE payment
      ADD COLUMN bank_transaction_uuid CHAR(36) DEFAULT NULL
        AFTER bank_transaction_id,
      ADD INDEX bank_transaction_uuid_idx (bank_transaction_uuid)
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(`
    ALTER TABLE advance DROP INDEX disbursement_bank_transaction_uuid_idx
  `);
  await db.runSql(`
    ALTER TABLE advance DROP COLUMN disbursement_bank_transaction_uuid
  `);
  await db.runSql(`
    ALTER TABLE advance DROP INDEX bank_transaction_uuid_idx
  `);
  await db.runSql(`
    ALTER TABLE payment DROP COLUMN bank_transaction_uuid
  `);
}

export const _meta = {
  version: 1,
};
