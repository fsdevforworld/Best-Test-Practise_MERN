import { QueryTypes } from 'sequelize';
import { sequelize } from '../../src/models';
import logger from '../../src/lib/logger';

const { PAYBACK_DATE = '2020-10-10' } = process.env;

async function unbucket() {
  const query = `DELETE ab FROM ab_testing_event ab
inner join advance a on a.id = ab.event_uuid
WHERE ab.event_name = 'TIVAN_REPAYMENT'
and a.payback_date = '${PAYBACK_DATE}';`;

  await sequelize.query(query, { type: QueryTypes.DELETE });
}

unbucket()
  .then(() => {
    logger.info('Successfully unbucketed Tivan advances', { paybackDate: PAYBACK_DATE });
    process.exit(0);
  })
  .catch(error => {
    logger.error('Error unbucketing Tivan advances', { error });
    process.exit(1);
  });
