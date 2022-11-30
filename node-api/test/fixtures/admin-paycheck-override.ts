import { sequelize } from '../../src/models';
import * as Bluebird from 'bluebird';
import { MINIMUM_APPROVAL_PAYCHECK_AMOUNT } from '../../src/services/advance-approval/advance-approval-engine';

function up(): Bluebird<any> {
  return sequelize.query(upSql);
}

const upSql = `INSERT into admin_paycheck_override
  (id, creator_id, user_id, bank_account_id, amount, pay_date)
  VALUES
  (3, 3, 3, 2, ${MINIMUM_APPROVAL_PAYCHECK_AMOUNT + 50}, CURRENT_DATE + INTERVAL 5 DAY),
  (200, 200, 200, 201, ${MINIMUM_APPROVAL_PAYCHECK_AMOUNT + 50}, CURRENT_DATE + INTERVAL 5 DAY),
  (700, 700, 700, 700, ${MINIMUM_APPROVAL_PAYCHECK_AMOUNT + 50}, CURRENT_DATE + INTERVAL 5 DAY);
`;

const tableName = 'admin_paycheck_override';

export default { up, tableName, upSql };
