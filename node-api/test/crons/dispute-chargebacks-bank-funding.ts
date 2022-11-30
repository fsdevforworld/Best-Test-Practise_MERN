import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore: Rewire doesn't seem to import correctly with DefinitelyTyped type definitions
import * as sinon from 'sinon';
import * as Sftp from 'ssh2-sftp-client';
import SftpClient from '../../src/lib/sftp-client';
import { clean } from '../test-helpers';
import {
  BankingInternalApiClient,
  run as disputeChargebacks,
} from '../../src/crons/dispute-chargebacks';
import factory from '../factories';
import { expect } from 'chai';
import * as PDF from 'pdfkit';
import { formatCurrency } from '../../src/lib/utils';

describe('DisputeChargebackCardFunding', () => {
  describe('bank funding chargebacks', () => {
    const sandbox = sinon.createSandbox();
    const fakeChargebacksFileData = fs.readFileSync(
      path.join(__dirname, 'dispute-chargebacks') + '/fake-chargebacks-bank-funding.test',
      'utf8',
    );
    const fakeFiles = [
      {
        name: '1000_400001_20190625_chargebacks_v2-4.csv',
      },
      {
        name: '4002_20190625_chargebacks_v2-4.csv',
      },
    ];
    beforeEach(() => {
      clean(sandbox);
      sandbox.stub(SftpClient.prototype, 'connect').resolves();
      sandbox.stub(Sftp.prototype, 'mkdir').resolves();
      sandbox.stub(Sftp.prototype, 'list').returns(fakeFiles);
      sandbox.stub(Sftp.prototype, 'get').returns(fakeChargebacksFileData);
      sandbox.stub(Sftp.prototype, 'put').resolves();
    });
    afterEach(() => clean(sandbox));
    it('should generate a bank funding chargeback pdf', async () => {
      const now = new Date('2020-01-15').valueOf();
      const clock = sandbox.useFakeTimers({ now });
      const user = await factory.create('user', {
        firstName: 'Dave',
        lastName: 'DaBear',
        email: 'daveDaBear@dave.com',
        addressLine1: '1265 S Cochran Ave',
        city: 'Los Angeles',
        state: 'CA',
        zipCode: '90019',
      });
      const mockTabapayReferenceId = 'x100000000000000000000';
      const mockCardFundingResponse = {
        data: {
          cardFunding: {
            id: 'abcde',
            bankAccountId: 'account-id',
            paymentProcessorReferenceId: mockTabapayReferenceId,
            daveUserId: user.id,
            type: 'APPLE_PAY',
            loadAmount: 100,
            feeAmount: 1,
            initiatedAt: new Date(),
            fundedAt: new Date(),
          },
        },
      };
      const mockCardFundingHistory = {
        data: {
          cardFundings: [
            {
              ...mockCardFundingResponse.data.cardFunding,
            },
            {
              id: 'aaaaaaa-1',
              bankAccountId: 'account-id',
              paymentProcessorReferenceId: 'tabapay-reference-id-1',
              daveUserId: user.id,
              type: 'DEBIT_CARD',
              loadAmount: 10,
              feeAmount: 0.1,
              initiatedAt: new Date(2020, 6, 2),
              fundedAt: new Date(),
            },
            {
              id: 'aaaaaaa-2',
              bankAccountId: 'account-id',
              paymentProcessorReferenceId: 'tabapay-reference-id-2',
              daveUserId: user.id,
              type: 'APPLE_PAY',
              loadAmount: 200,
              feeAmount: 2,
              lastFour: '1111',
              initiatedAt: new Date(2020, 4, 3),
              fundedAt: new Date(),
            },
          ],
        },
      };
      sandbox.stub(PDF.prototype, 'lineGap');
      sandbox.stub(PDF.prototype, 'text');

      sandbox
        .stub(BankingInternalApiClient, 'getByPaymentProcessorTransactionId')
        .resolves(mockCardFundingResponse);
      sandbox
        .stub(BankingInternalApiClient, 'getBankAccountCardFundings')
        .resolves(mockCardFundingHistory);
      try {
        await disputeChargebacks();
      } finally {
        clock.restore();
      }
      expect(BankingInternalApiClient.getByPaymentProcessorTransactionId).to.have.callCount(2);
      expect(BankingInternalApiClient.getByPaymentProcessorTransactionId).to.have.calledWith(
        mockTabapayReferenceId,
      );

      expect(PDF.prototype.text).to.have.calledWith(
        `Dave.com offers an online bank account issued by Evolve Bank & Trust.  A consumer can use another issuer’s debit card to add funds to their Dave.com managed Evolve bank account.`,
      );

      const expectedCardFunding = mockCardFundingHistory.data.cardFundings[0];
      const expectedTotalAmount = expectedCardFunding.feeAmount + expectedCardFunding.loadAmount;

      expect(PDF.prototype.text).to.have.calledWith(
        `The external deposit funding the customer is disputing was requested from us on ${expectedCardFunding.initiatedAt}.\n`,
      );

      expect(PDF.prototype.text).to.have.calledWith(
        `A fee of ${formatCurrency(
          expectedCardFunding.feeAmount,
          2,
        )} was authorized by the customer and included in the total.`,
      );

      expect(PDF.prototype.text).to.have.calledWith(
        `The external payment method was debited ${formatCurrency(expectedTotalAmount, 2)}.`,
      );

      expect(PDF.prototype.text).to.have.calledWith(
        `${formatCurrency(
          expectedCardFunding.loadAmount,
          2,
        )} was deposited in their Dave Spending account.`,
      );
      expect(PDF.prototype.text).to.have.calledWith('Card Funding Details:');
      expect(PDF.prototype.text).to.have.calledWith('Card Last Four: 1111');

      expect(PDF.prototype.text).to.have.calledWith(`${expectedCardFunding.initiatedAt}`);
      expect(PDF.prototype.text).to.have.calledWith(
        `Total amount: ${formatCurrency(expectedTotalAmount, 2)}`,
      );
      expect(PDF.prototype.text).to.have.calledWith(
        `Load amount: ${formatCurrency(expectedCardFunding.loadAmount, 2)}`,
      );
      expect(PDF.prototype.text).to.have.calledWith(
        `Fees: ${formatCurrency(expectedCardFunding.feeAmount, 2)}`,
      );
      expect(PDF.prototype.text).to.have.calledWith(`Funding Type: ${expectedCardFunding.type}`);

      expect(PDF.prototype.text).to.have.calledWith('Card Funding History:');
      expect(PDF.prototype.text).to.have.calledWith(
        `Dave Spending account funded at ${expectedCardFunding.fundedAt}`,
      );

      expect(PDF.prototype.text).to.have.calledWith(
        `Card Last Four: ${mockCardFundingHistory.data.cardFundings[2].lastFour}`,
      );

      expect(Sftp.prototype.put).to.have.callCount(2);
    });
  });
});
