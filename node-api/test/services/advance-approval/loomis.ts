import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  getBankPaymentMethod,
  GetBankAccountParams,
} from '../../../src/services/advance-approval/loomis';
import { InvalidParametersError } from 'src/lib/error';
import loomisClient from '@dave-inc/loomis-client';
import logger from '../../../src/lib/logger';
import { dogstatsd } from '../../../src/lib/datadog-statsd';

describe('Loomis', () => {
  const sandbox = sinon.createSandbox();

  describe('getBankPaymentMethod', () => {
    afterEach(() => sandbox.restore());

    it('returns corresponding Loomis bank account', async () => {
      const userId = 1;
      const bankAccountId = 1;
      sandbox.stub(loomisClient, 'getPaymentMethods').resolves({
        data: [
          {
            bankAccountId: 1,
            userId: 1,
            universalId: 'BANK:1',
          },
          {
            bankAccountId: 2,
            userId: 1,
            universalId: 'BANK:2',
          },
        ],
      });

      const loomisBankAccount = await getBankPaymentMethod({
        userId,
        bankAccountId,
      });
      expect(loomisBankAccount.bankAccountId).to.equal(bankAccountId);
    });

    it('throws an error if userId or bankAccountId is not defined', async () => {
      const invalidParams: GetBankAccountParams[] = [
        { userId: null, bankAccountId: 1 },
        { userId: 1, bankAccountId: null },
      ];
      for (const param of invalidParams) {
        await expect(getBankPaymentMethod(param)).to.be.rejectedWith(InvalidParametersError);
      }
    });

    it('throws and logs errors from Loomis', async () => {
      const params = { userId: 1, bankAccountId: 2 };
      sandbox.stub(loomisClient, 'getPaymentMethods').resolves({ error: new Error(':sob:') });
      const loggerStub = sandbox.stub(logger, 'error');
      const metricsStub = sandbox.stub(dogstatsd, 'increment');
      await expect(getBankPaymentMethod(params)).to.be.rejected;
      expect(loggerStub).to.be.calledOnce;
      expect(metricsStub).to.be.calledOnce;
    });
  });
});
