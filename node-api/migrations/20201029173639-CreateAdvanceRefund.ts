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
    CREATE TABLE advance_refund (
      id int(11) NOT NULL AUTO_INCREMENT,
      reimbursement_id int(11) NOT NULL UNIQUE,
      advance_id int(11) NOT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT advance_refund_advance_fk FOREIGN KEY (advance_id) REFERENCES advance (id),
      CONSTRAINT advance_refund_reimbursement_fk FOREIGN KEY (reimbursement_id) REFERENCES reimbursement (id)
    );
  `);

  await db.runSql(`
    CREATE TABLE advance_refund_line_item (
      id int(11) NOT NULL AUTO_INCREMENT,
      advance_refund_id int(11) NOT NULL,
      reason enum('fee', 'tip', 'overdraft', 'overpayment') NOT NULL,
      amount decimal(16,2) NOT NULL,
      adjust_outstanding TINYINT(1) NOT NULL DEFAULT '0',
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      CONSTRAINT advance_refund_line_item_advance_fk FOREIGN KEY (advance_refund_id) REFERENCES advance_refund (id)
    );
  `);
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql('DROP TABLE IF EXISTS advance_refund_line_item;');
  await db.runSql('DROP TABLE IF EXISTS advance_refund;');
}

export const _meta = {
  version: 1,
};
