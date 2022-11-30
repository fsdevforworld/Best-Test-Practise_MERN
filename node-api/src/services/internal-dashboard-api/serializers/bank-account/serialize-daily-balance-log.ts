import { BalanceLogNormalized } from '@dave-inc/heath-client';
import serialize from '../serialize';

import { IApiResourceObject } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';

interface IDailyBalanceLogResource extends IApiResourceObject {
  type: 'daily-balance-log';
  attributes: {
    available: number;
    current: number;
    date: string;
  };
}

const serializer: serialize<
  BalanceLogNormalized,
  IDailyBalanceLogResource
> = async function serializeDailyBalanceLogs(balanceLog, relationships) {
  return {
    id: `${balanceLog.date}-${balanceLog.bankAccountId}`,
    type: 'daily-balance-log',
    attributes: {
      available: balanceLog.available,
      current: balanceLog.current,
      date: balanceLog.date,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IDailyBalanceLogResource };
export default serializer;
