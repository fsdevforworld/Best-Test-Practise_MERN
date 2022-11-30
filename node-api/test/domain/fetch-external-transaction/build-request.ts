import factory from '../../factories';
import { buildFetchRequest } from '../../../src/domain/fetch-external-transaction';
import { PaymentProcessor, PaymentProviderTransactionType } from '../../../src/typings';
import { expect } from 'chai';
import { clean } from '../../test-helpers';

describe('buildFetchRequest', () => {
  const synapsepayId = 'pelican-123';
  beforeEach(() => clean());

  it('should build a synapse fetch request', async () => {
    const user = await factory.create('user', { synapsepayId });
    const bankAccount = await factory.create('bank-account', { userId: user.id });
    const advance = await factory.create('advance', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    });

    const payment = await factory.create('payment', {
      externalId: 'bacon',
      referenceId: 'cheese',
      userId: user.id,
      advanceId: advance.id,
    });

    const request = await buildFetchRequest(
      payment,
      PaymentProcessor.Synapsepay,
      PaymentProviderTransactionType.AdvancePayment,
    );

    expect(request).to.deep.eq({
      ownerId: user.synapsepayId,
      sourceId: bankAccount.synapseNodeId,
      secret: user.id.toString(),
      externalId: payment.externalId,
      referenceId: payment.referenceId,
      type: PaymentProviderTransactionType.AdvancePayment,
      processor: PaymentProcessor.Synapsepay,
      daveUserId: user.id,
    });
  });

  it('should build a synapse fetch request with no bank account', async () => {
    const user = await factory.create('user', { synapsepayId });
    const bankAccount = await factory.create('bank-account', { userId: user.id });
    const advance = await factory.create('advance', {
      userId: user.id,
      bankAccountId: bankAccount.id,
    });
    const payment = await factory.create('payment', {
      externalId: 'bacon',
      referenceId: 'cheese',
      userId: user.id,
      advanceId: advance.id,
    });

    await advance.update({ bankAccountId: null });

    const request = await buildFetchRequest(
      payment,
      PaymentProcessor.Synapsepay,
      PaymentProviderTransactionType.AdvancePayment,
    );

    expect(request).to.deep.eq({
      externalId: payment.externalId,
      referenceId: payment.referenceId,
      type: PaymentProviderTransactionType.AdvancePayment,
      processor: PaymentProcessor.Synapsepay,
      sourceId: undefined,
      daveUserId: user.id,
    });
  });

  it('should build a bank of dave fetch request', async () => {
    const externalId = 'pelican6-5000';
    const user = await factory.create('user', { synapsepayId });
    const bankAccount = await factory.create('bank-account', { userId: user.id });
    const advance = await factory.create('advance', {
      userId: user.id,
      bankAccountId: bankAccount.id,
      externalId,
    });
    const payment = await factory.create('payment', {
      externalId: 'bacon',
      referenceId: 'cheese',
      userId: user.id,
      advanceId: advance.id,
    });

    const request = await buildFetchRequest(
      payment,
      PaymentProcessor.BankOfDave,
      PaymentProviderTransactionType.AdvanceDisbursement,
    );

    const connection = await bankAccount.getBankConnection();

    expect(request).to.deep.eq({
      ownerId: connection.externalId,
      sourceId: bankAccount.externalId,
      externalId: payment.externalId,
      referenceId: payment.referenceId,
      type: PaymentProviderTransactionType.AdvanceDisbursement,
      processor: PaymentProcessor.BankOfDave,
      correspondingId: advance.externalId,
      daveUserId: user.id,
    });
  });
});
