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
  const [currentTable] = await db.runSql(`
      SELECT AUTO_INCREMENT
      FROM INFORMATION_SCHEMA.TABLES
      WHERE
      TABLE_NAME  = 'advance_rule_log'
  `);

  const newAutoIncrement = currentTable.AUTO_INCREMENT + 3000000;

  await db.runSql(`
    CREATE TABLE advance_rule_log_2 (
      id bigint(11) NOT NULL AUTO_INCREMENT,
      advance_approval_id int(11) DEFAULT NULL,
      success tinyint(1) DEFAULT NULL,
      node_name varchar(255) DEFAULT NULL,
      rule_name varchar(255) DEFAULT NULL,
      data json DEFAULT NULL,
      error varchar(255) DEFAULT NULL,
      created datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY advance_rule_log_approval_id_fk (advance_approval_id),
      KEY advance_rule_log_node_name_idx (node_name),
      KEY advance_rule_log_rule_name_idx (rule_name),
      KEY advance_rule_log_error_idx (error),
      CONSTRAINT advance_rule_log_2_approval_id_fk FOREIGN KEY (advance_approval_id) REFERENCES advance_approval (id)
    ) ENGINE=InnoDB AUTO_INCREMENT=${newAutoIncrement} DEFAULT CHARSET=utf8mb4;
  `);
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('DROP TABLE IF EXISTS advance_rule_log_2');
}

export const _meta = {
  version: 1,
};
