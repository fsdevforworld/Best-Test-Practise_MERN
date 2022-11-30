import * as Bluebird from 'bluebird';
import { Advance, Payment } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import { setActiveCollection } from '../../domain/active-collection';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import logger from '../../lib/logger';
import { Op } from 'sequelize';
import { getActiveCollection } from '../active-collection';
import { updateOutstanding } from '../collection/outstanding';

export async function checkReturnedPaymentForMultiAdvances(payment: Payment): Promise<void> {
  try {
    const multiAdvances = await Advance.findAll({
      where: {
        userId: payment.userId,
        disbursementStatus: ExternalTransactionStatus.Completed,
        created: {
          [Op.gt]: payment.created,
        },
        id: {
          [Op.notIn]: [payment.advanceId],
        },
        outstanding: {
          [Op.gt]: 0,
        },
      },
      order: [['created', 'DESC']],
    });

    if (multiAdvances.length < 1) {
      // no multi advance
      return;
    }

    const activeCollection = await getActiveCollection(`${payment.userId}`);
    if (activeCollection) {
      // no need to search for activeCollection
      logger.info(
        `Active collection: ${activeCollection} already exists for userId: ${payment.userId}`,
        {
          userId: payment.userId,
          activeCollection,
        },
      );
      return;
    }

    const eligibleMultiAdvances = await filterOutPaidAdvances(multiAdvances);
    if (!eligibleMultiAdvances.length) {
      // no multi advance after refresh
      return;
    }
    await setActiveCollection(`${payment.userId}`, `${eligibleMultiAdvances[0].id}`);
    dogstatsd.increment('multi-outstanding-advance.returned-payment');
  } catch (error) {
    logger.error('Error checking returned payment for multi-advances', {
      payment_id: payment.id,
      error,
    });
  }
}

async function filterOutPaidAdvances(advances: Advance[]): Promise<Advance[]> {
  const promises = advances.map(advance => updateOutstanding(advance));
  const refreshedAdvances = await Bluebird.all(promises);
  return refreshedAdvances
    .filter(ad => ad.outstanding > 0)
    .sort((advA, advB) => {
      if (advA.created.isBefore(advB.created)) {
        return -1;
      }
      return 1;
    });
}
