import * as config from 'config';
import loomisClient, { PaymentProviderTransactionType } from '@dave-inc/loomis-client';

import braze from '../../lib/braze';
import sendgrid from '../../lib/sendgrid';
import { formatCurrency } from '../../lib/utils';
import * as analyticsClient from '../../services/analytics/client';

import { Advance, User } from '../../models';

import { create, sendSMS } from './direct-alert';
import logger from '../../lib/logger';

export async function sendAdvancePaymentFailed(payment: { id: number; userId: number }) {
  const user = await User.findByPk(payment.userId);
  if (!user) {
    logger.error('Failed to send advance payment failed alert', {
      userId: payment.userId,
    });
    return;
  }
  const message =
    "Something went wrong with your payment. I'll continue to try and collect, but you can do it yourself here: dave.com/m/payment";
  await sendSMS(payment.userId, 'ADVANCE_PAYMENT_FAILED', payment.id, 'payment', message, null);
  const substitutions = {};
  const template = 'd-d7a2e81b800a4624b33c43e8d3461d8a';
  await create(
    'EMAIL',
    'ADVANCE_PAYMENT_FAILED',
    'Advance Payment Failed',
    payment.userId,
    payment.id,
    'payment',
  );

  if (user.email) {
    await sendgrid.send(undefined, template, substitutions, user.email);
  }
}

/*
 * Send an Email notifying that the user can pay back their advance in the app and that Dave will continue to try and collect the funds
 */
export async function sendUnableToCollect(
  advanceId: number,
  userId: number,
  email: string,
  firstName: string,
) {
  const template = '1a74d47c-25d6-413a-a642-b81891e685d6';
  const substitutions = { FIRSTNAME: firstName };
  const subject = 'Something went wrong with your payment';

  await sendgrid.send(subject, template, substitutions, email, {}, 'no-reply@dave.com', [
    'collections',
  ]);

  return create('EMAIL', 'UNABLE_TO_COLLECT', subject, userId, advanceId, 'advance');
}

// Send email which contains link to pay back form
export async function sendAdvancePaymentForm(advance: Advance) {
  const campaignId: string = config.get('braze.paybackAdvanceFormCampaign');
  await create(
    'EMAIL',
    'SEND_ADVANCE_PAYMENT_FORM',
    'Send Advance Payment Form',
    advance.userId,
    advance.id,
    'advance',
  );

  // Update the user's values before sending the payment form
  await braze.track({
    attributes: [
      {
        advance_payback_url: advance.getWebPaybackUrl(),
        externalId: advance.userId.toString(),
      },
    ],
  });

  return await braze.triggerCampaign({
    campaign_id: campaignId,
    recipients: [
      {
        externalUserId: advance.userId.toString(),
      },
    ],
  });
}

/*
 * Send a notification that a payment was made
 * Rules:
 * - Only once per payment
 */
export async function sendPayment(paymentId: number) {
  const paymentResult = await loomisClient.getTransactionDetails(
    PaymentProviderTransactionType.AdvancePayment,
    { legacyPaymentId: paymentId },
  );
  if ('error' in paymentResult) {
    logger.error(`Failed to retrieve payment ${paymentId}`, paymentResult.error);
    return;
  }
  const payment = paymentResult.data;
  await analyticsClient.track({
    userId: String(payment.userId),
    event: 'advance payment received',
    properties: {
      amount: formatCurrency(payment.amountInCents / 100, 2),
    },
  });
}
