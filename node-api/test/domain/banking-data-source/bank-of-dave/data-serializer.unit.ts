import { BankOfDaveDataSerializer } from '../../../../src/domain/banking-data-source/bank-of-dave/data-serializer';
import { DaveBankingPubSubTransaction } from '@dave-inc/wire-typings';
import factory from '../../../factories';
import { expect } from 'chai';

describe('BankOfDaveDataSerializer', () => {
  describe('serializeTransactions', () => {
    it('should return a transaction without augmenting the time zone of the transacted date', async () => {
      const testPubSubTran = await factory.build<DaveBankingPubSubTransaction>(
        'dave-banking-pubsub-transaction',
        {
          transactedAt: '2020-12-02T00:00:00Z',
        },
      );
      const result = BankOfDaveDataSerializer.serializePubSubTransactions('accountId', [
        testPubSubTran,
      ]);

      expect(result[0].transactionDate.format('YYYY-MM-DD')).to.equal('2020-12-02');
    });
  });
});
