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
  return db.runSql(
    `INSERT into subscription_billing_promotion (description, code, months) VALUES
      ("Candidate Promo", "CANDIDATE_2020_Q4", "3");
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql(`DELETE FROM subscription_billing_promotion WHERE code = "CANDIDATE_2020_Q4";`);
}

export const _meta = {
  version: 1,
};
