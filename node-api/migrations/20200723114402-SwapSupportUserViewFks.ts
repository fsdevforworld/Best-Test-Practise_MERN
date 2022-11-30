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
  await db.runSql(`ALTER TABLE support_user_view DROP FOREIGN KEY support_user_view_viewer_id_fk;`);

  await db.runSql(
    `ALTER TABLE support_user_view
    ADD CONSTRAINT support_user_view_viewer_id_fk FOREIGN KEY (viewer_id) REFERENCES internal_user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `,
  );
}

export async function down(db: DBItem): Promise<void> {
  await db.runSql(
    `ALTER TABLE support_user_view
    DROP FOREIGN KEY support_user_view_viewer_id_fk;
    `,
  );

  await db.runSql(
    `ALTER TABLE support_user_view
    ADD CONSTRAINT support_user_view_viewer_id_fk FOREIGN KEY (viewer_id) REFERENCES user (id) ON DELETE NO ACTION ON UPDATE NO ACTION;
    `,
  );
}

export const _meta = {
  version: 1,
};
