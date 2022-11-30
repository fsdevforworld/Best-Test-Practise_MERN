import { AVSLog, BankAccount, PaymentMethod } from '../../models';
import { generateRandomHexString, getCardScheme, titleCase } from '../../lib/utils';
import { Moment } from '@dave-inc/time-lib';
import { addCardToTabapay } from './add-card-to-tabapay';
import { paymentMethodUpdateEvent } from '../event';
import logger from '../../lib/logger';

export async function addCard({
  bankAccount,
  encryptedCard,
  keyId,
  mask,
  bin,
  expirationDate,
  referenceId = generateRandomHexString(15),
  zipCode,
  optedIntoDaveRewards = false,
  availability = 'immediate',
  avsLogId,
}: {
  encryptedCard: string;
  keyId: string;
  bankAccount: BankAccount;
  mask: string;
  bin: string;
  expirationDate: Moment;
  referenceId?: string;
  zipCode?: string;
  optedIntoDaveRewards?: boolean;
  availability?: string;
  avsLogId?: number;
}): Promise<PaymentMethod> {
  const user = bankAccount.user || (await bankAccount.getUser());
  const scheme = getCardScheme(bin);
  const displayName = titleCase(`${scheme}: ${mask}`);

  const tabapayId = await addCardToTabapay({
    referenceId,
    encryptedCard,
    keyId,
    user,
  });

  const paymentMethod = {
    availability: availability.toLowerCase(),
    userId: user.id,
    bankAccountId: bankAccount.id,
    mask,
    displayName,
    expiration: expirationDate.format('YYYY-MM-DD'),
    scheme,
    tabapayId,
    zipCode,
    optedIntoDaveRewards,
    bin,
  };

  const result = await PaymentMethod.create(paymentMethod);
  if (avsLogId) {
    await AVSLog.update({ paymentMethodId: result.id }, { where: { id: avsLogId } });
  }
  try {
    await paymentMethodUpdateEvent.publish({
      operation: 'create',
      paymentMethod: {
        legacyId: result.id,
        invalid: null,
        invalidReasonCode: null,
        ...paymentMethod,
      },
    });
  } catch (error) {
    logger.warn('Failed to publish payment method update', {
      error,
      legacyId: result.id,
      paymentMethod,
    });
  }

  return result;
}
