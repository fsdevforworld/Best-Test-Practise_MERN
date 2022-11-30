import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';

const upSql = `INSERT into institution
  (id, display_name, plaid_institution_id, primary_color, username_label, password_label, balance_includes_pending)
  VALUES
  (1, 'Chase', 'ins_3', '#0000FF', 'Username', 'Password', false),
  (2, 'Wells', 'wells', '#FF0000', 'Username', 'Password', false),
  (3, 'Simple', 'simple', '#00FF00', 'Username', 'Password', true),
  (4, 'Bank of Dave', 'bank_of_dave', '#00FF00', 'Username', 'Password', true);
  `;

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

export default { up, upSql, tableName: 'institution' };
