import * as Bluebird from 'bluebird';
import { isEmpty } from 'lodash';
import { Advance, Payment } from '../models';
import { serializeDate } from '../serialization';
import { AdvanceComplexResponse, PaymentMethodResponse } from '@dave-inc/wire-typings';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../services/loomis-api/helper';

// exported for testing only
export function serializePaymentMethod(
  paymentMethod: PaymentMethod,
  dateFormat: string,
): PaymentMethodResponse {
  const {
    id,
    displayName,
    scheme,
    mask,
    expiration,
    invalid,
    optedIntoDaveRewards,
    empyrCardId,
    zipCode,
  } = paymentMethod || {};

  if (!id) {
    return null;
  }

  return {
    id,
    displayName,
    scheme,
    mask,
    expiration: serializeDate(expiration, dateFormat),
    invalid: serializeDate(invalid, dateFormat),
    optedIntoDaveRewards: !!optedIntoDaveRewards,
    empyrCardId: empyrCardId ?? null,
    zipCode: zipCode ?? null,
  };
}

// exported for testing only
export function mapAndSerializePayments(payments: Payment[], dateFormat: string) {
  return Bluebird.map(payments, async payment => {
    const {
      id,
      userId,
      advanceId,
      bankAccountId,
      bankTransactionId,
      paymentMethodId,
      amount,
      legacyId,
      externalProcessor,
      externalId,
      referenceId,
      status,
      deleted,
      created,
      updated,
    } = payment;

    const loomisResponse = await loomisClient.getPaymentMethod({
      id: paymentMethodId,
      includeSoftDeleted: true,
    });

    const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    return {
      id,
      userId,
      advanceId,
      bankAccountId,
      bankTransactionId,
      paymentMethodId,
      amount,
      legacyId,
      externalProcessor,
      externalId,
      referenceId,
      status,
      paymentMethod: paymentMethod ? serializePaymentMethod(paymentMethod, dateFormat) : null,
      deleted: serializeDate(deleted, dateFormat),
      created: serializeDate(created, dateFormat),
      updated: serializeDate(updated, dateFormat),
    };
  });
}

export async function serializeAdvanceComplexResponse(
  advance: Advance,
  dateFormat: string,
  payments: Payment[] = [],
): Promise<AdvanceComplexResponse> {
  const { user } = advance;
  const advanceExperimentLog =
    advance.advanceExperimentLog || (await advance.getAdvanceExperimentLog());
  let resolvedPayments: Payment[] = payments;

  if (isEmpty(resolvedPayments)) {
    resolvedPayments = advance.payments || [];
  }
  const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
  const serializedPayments = await mapAndSerializePayments(resolvedPayments, dateFormat);

  return {
    ...serializedAdvanceWithTip,
    paybackDate: serializeDate(advance.paybackDate, dateFormat),
    name: user ? `${user.firstName} ${user.lastName}` : undefined,
    closed: advance.outstanding === 0,
    payments: serializedPayments,
    isExperimental: Boolean(advanceExperimentLog?.success),
  };
}
