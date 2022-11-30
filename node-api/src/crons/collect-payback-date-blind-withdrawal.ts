import { Op } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { concurrentForEach } from '../lib/utils';
import { AdvanceCollectionTrigger } from '../typings';
import { Advance, BankAccount, BankConnection, PaymentMethod } from '../models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import loomisClient from '@dave-inc/loomis-client';
import { Cron, DaveCron } from './cron';
import * as CollectionDomain from '../domain/collection';
import logger from '../lib/logger';
import { parseLoomisGetPaymentMethod } from '../services/loomis-api/helper';
import { IOptions } from '@dave-inc/google-cloud-tasks-helpers';
import { createAdvanceRepaymentTask } from '../domain/repayment/tasks';
import { createTivanExperiment, shouldCollectWithTivan } from '../domain/repayment/experiment';

export async function run() {
  const advances = await getAdvances();
  return processBatch(advances);
}

function processBatch(batch: Advance[]) {
  return concurrentForEach(batch, 25, async advance => {
    try {
      await collectAdvance(advance);
    } catch (ex) {
      logger.error('Collect payback date blind error', { ex });
    }
  });
}

export function getAdvances(): PromiseLike<Advance[]> {
  return Advance.findAll({
    where: {
      paybackFrozen: false,
      paybackDate: moment(),
      outstanding: { [Op.gt]: 0 },
      disbursementStatus: ExternalTransactionStatus.Completed,
      amount: { [Op.gt]: 20 },
    },
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
  });
}

async function collectAdvance(advance: Advance) {
  const loomisResponse = await loomisClient.getPaymentMethod({ id: advance.paymentMethodId });
  const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

  const source = AdvanceCollectionTrigger.BLIND_PAYDAY_DATE_COLLECTION;
  if (await shouldCollectWithTivan(advance, source, createTivanExperiment(source), source)) {
    const tivanOptions: IOptions = {};
    await createAdvanceRepaymentTask(advance, source, tivanOptions);
  } else {
    // old code to eventually throw away
    return CollectionDomain.collectAdvance(
      advance,
      advance.outstanding,
      CollectionDomain.createDebitCardAdvanceCharge(paymentMethod, advance),
      source,
    );
  }
}

export const CollectPaybackDateBlindWithdrawal: Cron = {
  name: DaveCron.CollectPaybackDateBlindWithdrawal,
  process: run,
  schedule: '30 12 * * *',
};
