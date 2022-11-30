import { max } from 'lodash';
import { FindOptions, Op } from 'sequelize';
import loomisClient from '@dave-inc/loomis-client';
import { moment } from '@dave-inc/time-lib';
import { concurrentForEach, processInBatches } from '../lib/utils';
import { AdvanceCollectionTrigger } from '../typings';
import { Advance, BankAccount, BankConnection, PaymentMethod } from '../models';
import { Cron, DaveCron } from './cron';
import * as CollectionDomain from '../domain/collection';
import logger from '../lib/logger';
import { inspect } from 'util';
import { parseLoomisGetPaymentMethod } from '../services/loomis-api/helper';

export function run() {
  return processInBatches(getAdvances, processBatch);
}

function processBatch(batch: Advance[]) {
  return concurrentForEach(batch, 25, async advance => {
    try {
      await collectAdvance(advance);
    } catch (ex) {
      logger.error('Collect advance blind error', { ex });
    }
  });
}

export function getAdvances(
  limit: number,
  offset: number,
  previousBatch?: Advance[] | null,
): PromiseLike<Advance[]> {
  const where: any = {
    paybackFrozen: false,
    paybackDate: { [Op.lte]: moment().subtract(14, 'days') },
  };
  // we can't use offset since the result of the query would change as we collect so instead we use
  // the max id as the marker
  if (previousBatch) {
    where.id = { [Op.gt]: max(previousBatch.map(a => a.id)) };
  }

  const findOptions: FindOptions = {
    where,
    include: [
      {
        model: PaymentMethod,
        where: {
          invalid: null,
        },
      },
      {
        model: BankAccount,
        required: true,
        include: [
          {
            model: BankConnection,
            where: {
              hasValidCredentials: false,
            },
          },
        ],
      },
    ],
    order: [['id', 'asc']],
    limit,
  };
  logger.info(`Searching for advances: ${inspect(findOptions, { depth: 5 })}`);
  return Advance.scope('pastDue').findAll(findOptions);
}

async function collectAdvance(advance: Advance) {
  const loomisResponse = await loomisClient.getPaymentMethod({ id: advance.paymentMethod.id });
  const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

  return CollectionDomain.collectAdvance(
    advance,
    advance.outstanding,
    CollectionDomain.createDebitCardAdvanceCharge(paymentMethod, advance),
    AdvanceCollectionTrigger.BLIND_COLLECTION,
  );
}

export const CollectAdvanceBlindWithdrawal: Cron = {
  name: DaveCron.CollectAdvanceBlindWithdrawal,
  process: run,
  schedule: '0 17 * * 5',
};
