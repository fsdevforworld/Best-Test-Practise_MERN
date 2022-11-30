import * as config from 'config';
import { once } from 'lodash';
import { TivanClient, createClient } from '@dave-inc/tivan-client';

function createTivanClient(): TivanClient {
  const host = config.get<string>('tivan.host');
  return createClient(host);
}

export const getTivanClient = once(createTivanClient);

export {
  AdvanceRequest,
  IAdvance,
  IAdvanceBase,
  IAdvanceWithPayment,
  PaymentStatus as TivanPaymentStatus,
  Process as TivanProcess,
  Result as TivanResult,
  TaskPaymentResult,
  TaskInterleaved,
  createGatherAdvanceTask,
} from '@dave-inc/tivan-client';
