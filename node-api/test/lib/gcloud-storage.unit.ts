import { expect } from 'chai';
import { saveCSVToGCloud } from '../../src/lib/gcloud-storage';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';

describe('GCloud Storage', () => {
  it('returns a writable stream for google cloud', async () => {
    const processor = ExternalTransactionProcessor.Tabapay;
    const fileName = 'transactions_123';
    const result = saveCSVToGCloud(processor, fileName);
    expect(result.pipe).to.exist;
  });
});
