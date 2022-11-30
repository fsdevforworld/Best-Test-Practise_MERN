import { Response } from 'express';
import { InvalidParametersError } from '../../../../lib/error';
import {
  IDashboardApiRequest,
  IDashboardModification,
  IDashboardV2Response,
} from '../../../../typings';
import { getParams } from '../../../../lib/utils';
import {
  DashboardActionLog,
  SubscriptionBilling,
  DashboardSubscriptionBillingModification,
  sequelize,
} from '../../../../models';
import { createSubscriptionBillingUpsertData } from '../../../../domain/subscription-billing';
import * as Bluebird from 'bluebird';
import { Transaction } from 'sequelize/types';
import { moment } from '@dave-inc/time-lib';
import { serializeMany, subscriptionSerializers } from '../../serializers';
import { ActionCode, ActionLogPayload, validateActionLog } from '../../domain/action-log';

async function giveFreeMonths(
  req: IDashboardApiRequest<
    {
      userId: number;
      count: number;
    } & ActionLogPayload
  >,
  res: IDashboardV2Response<subscriptionSerializers.ISubscriptionBillingResource[]>,
): Promise<Response> {
  const internalUserId = req.internalUser.id;

  const { userId, count, dashboardActionReasonId, zendeskTicketUrl, note } = getParams(
    req.body,
    ['userId', 'count', 'dashboardActionReasonId', 'zendeskTicketUrl'],
    ['note'],
  );

  if (count <= 0) {
    throw new InvalidParametersError('Count must be greater than 0');
  }

  await validateActionLog(dashboardActionReasonId, ActionCode.GiveFreeMonths, note);

  let billings: SubscriptionBilling[];

  /**
   * Possible race condition - another process creates a future subscription billing while this transaction is taking place.
   * In this event, the transaction will roll back and should be attempted again.
   */
  await sequelize.transaction(async transaction => {
    const latestSubscriptionBilling = await SubscriptionBilling.findOne({
      where: { userId },
      order: [['start', 'DESC']],
      transaction,
    });
    const currentBillingCycle = moment().format('YYYY-MM');

    let latestBillingCycle = currentBillingCycle;
    if (latestSubscriptionBilling?.billingCycle > currentBillingCycle) {
      latestBillingCycle = latestSubscriptionBilling.billingCycle;
    }

    const freeMonths = Array.from({ length: count }, (_, i) =>
      createSubscriptionBillingUpsertData(userId, moment(latestBillingCycle).add(i + 1, 'months')),
    );

    billings = await SubscriptionBilling.bulkCreate(freeMonths, { transaction });

    await Bluebird.map(billings, billing =>
      logFreeMonth(
        billing,
        { dashboardActionReasonId, internalUserId, zendeskTicketUrl, note },
        transaction,
      ),
    );
  });

  const serializedBillings = await serializeMany(
    billings,
    subscriptionSerializers.serializeSubscriptionBilling,
  );

  const response = {
    data: serializedBillings,
  };

  return res.send(response);
}

async function logFreeMonth(
  subscriptionBilling: SubscriptionBilling,
  actionLogParams: {
    dashboardActionReasonId: number;
    internalUserId: number;
    zendeskTicketUrl: string;
    note?: string;
  },
  transaction: Transaction,
) {
  const dashboardActionLog = await DashboardActionLog.create(actionLogParams, { transaction });
  const modification: IDashboardModification = {
    amount: {
      previousValue: null,
      currentValue: 0,
    },
    billingCycle: {
      previousValue: null,
      currentValue: subscriptionBilling.billingCycle,
    },
  };
  await DashboardSubscriptionBillingModification.create(
    {
      subscriptionBillingId: subscriptionBilling.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification,
    },
    { transaction },
  );
}

export default giveFreeMonths;
