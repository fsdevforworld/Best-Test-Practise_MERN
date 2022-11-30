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
    `create table password_history (
      id bigint(64) not null auto_increment,
      user_id int(11) not null,
      password varchar(64) not null,
      created datetime not null default current_timestamp,
      updated datetime default current_timestamp on update current_timestamp,
      deleted datetime default null,
      PRIMARY KEY (id),
        CONSTRAINT password_history_user_id_fk
        FOREIGN KEY (user_id) REFERENCES user (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,
  );
}

export async function down(db: DBItem): Promise<void> {
  return db.runSql('drop table password_history');
}

export const _meta = {
  version: 1,
};
