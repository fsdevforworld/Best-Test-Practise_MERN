import { BankingDataSource } from '@dave-inc/wire-typings';
import { moment } from '@dave-inc/time-lib';
import { Advance } from '../../src/models';
import factory from '../factories';

export default async function setUpRefreshBalanceAndCollectData({
  bankingDataSource: bankingDataSource = BankingDataSource.Plaid,
  amount: amount = 75,
  fee: fee = 5,
  paybackDate: paybackDate = moment(),
  tipPercent: tipPercent = 0,
  delivery: delivery = 'express',
  zipCode = 90005,
} = {}): Promise<Advance> {
  const tip = amount * (tipPercent / 100);
  const { id: userId } = await factory.create('user', { zipCode });
  const { id: bankConnectionId } = await factory.create('bank-connection', {
    bankingDataSource,
    userId,
  });
  const bankAccount = await factory.create('checking-account', { userId, bankConnectionId });
  const { id: paymentMethodId } = await factory.create('payment-method', {
    userId,
    bankAccountId: bankAccount.id,
  });
  bankAccount.defaultPaymentMethodId = paymentMethodId;
  await bankAccount.save();
  const advance = await factory.create('advance', {
    userId,
    bankAccountId: bankAccount.id,
    paymentMethodId,
    amount,
    fee,
    paybackDate: paybackDate.startOf('day'),
    delivery,
    outstanding: amount + fee + tip,
    disbursementStatus: 'COMPLETED',
  });
  await factory.create('advance-tip', { advanceId: advance.id, amount: tip, percent: tipPercent });

  return advance;
}
