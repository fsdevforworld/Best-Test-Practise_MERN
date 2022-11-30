import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';

import app from '../../../src/services/loomis-api';
import * as DebitCardFunding from '../../../src/lib/tabapay';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { ExternalMobilePayment } from '../../../src/typings';
import { clean } from '../../test-helpers';
import {
  PaymentMethodType,
  TabapayAccountOwnerParam,
  TabapayApplePayParam,
} from '@dave-inc/loomis-client';
import { CUSTOM_ERROR_CODES, PaymentProcessorError } from '../../../src/lib/error';
import factory from '../../factories';

describe('Loomis API', () => {
  const sandbox = sinon.createSandbox();
  const mockOwner: TabapayAccountOwnerParam = {
    name: {
      first: 'Dave',
      last: 'DaBear',
    },
    address: {
      line1: '1265 S Cochran Ave',
      city: 'Los Angeles',
      state: 'CA',
      zipcode: '90019',
    },
    phone: {
      number: '5555555555',
    },
  };

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('Failure POST /payment/mobile', () => {
    it('should return Invalid Parameters Error for invalid funding type', async () => {
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({ amount: 100, fundingType: 'INVALID_PAY', owner: {}, payload: {} })
        .expect(400);
      expect(body.type).to.equal('invalid_parameters');
      expect(body.message).to.contain('Funding type not supported');
    });
    it('should return Invalid Parameters Error for amount not great than zero', async () => {
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({ amount: 0, fundingType: PaymentMethodType.APPLE_PAY, owner: {}, payload: {} })
        .expect(400);
      expect(body.type).to.equal('invalid_parameters');
      expect(body.message).to.contain('Amount must be greater than 0');
    });
    it('should return Not Found Error if tabapay id is not found', async () => {
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({ amount: 100, fundingType: PaymentMethodType.DEBIT_CARD, owner: {}, payload: {} })
        .expect(404);
      expect(body.type).to.equal('not_found');
      expect(body.message).to.contain('Missing provided payment method');
    });
    it('should return Invalid Parameters Error if tabapay id is not found', async () => {
      const paymentMethod = await factory.create('payment-method', {
        tabapayId: 'tabapay-1234',
      });
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({
          amount: 100,
          fundingType: PaymentMethodType.DEBIT_CARD,
          owner: {},
          payload: {
            lastFour: '0001',
            paymentMethodId: paymentMethod.id,
          },
        })
        .expect(400);
      expect(body.type).to.equal('invalid_parameters');
      expect(body.message).to.contain('Invalid payment method');
    });
  });

  describe('Failed POST /payment/mobile due to AVS check', () => {
    it('Fails the request if AVS fails', async () => {
      const paymentMethod = await factory.create('payment-method', {
        tabapayId: 'tabapay-12345',
      });
      const debitCardFundingMockRequest = {
        referenceId: 'abcdefgh1234567',
        amount: 100,
        fundingType: PaymentMethodType.DEBIT_CARD,
        feeIncluded: true,
        daveUserId: paymentMethod.userId,
        payload: { paymentMethodId: paymentMethod.id },
      };
      sandbox.stub(DebitCardFunding, 'queryCard').resolves({
        SC: 200,
        AVS: {
          networkRC: '05',
          codeAVS: 'N',
        },
      });

      await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(debitCardFundingMockRequest)
        .expect(400);
    });
  });

  describe('POST /payment/mobile -- token check', () => {
    beforeEach(() => {
      const mockExternalPaymentResponse = {
        transactionId: 'abcde',
        status: ExternalTransactionStatus.Completed,
        isAVSMatch: true,
      };
      sandbox
        .stub(DebitCardFunding, 'createMobileTransaction')
        .resolves(mockExternalPaymentResponse);

      const mockAVSResponse = {
        SC: 200,
        AVS: {
          networkRC: '00',
          codeAVS: 'Y',
        },
      };
      sandbox.stub(DebitCardFunding, 'queryCard').resolves(mockAVSResponse);
    });
    it('should return 400 if a different user re-uses an ApplePay account', async () => {
      interface IApplePayRequest {
        feeIncluded?: boolean;
        referenceId: string;
        amount: number;
        fundingType: PaymentMethodType;
        payload: { mobilePay: Partial<TabapayApplePayParam> };
        owner?: TabapayAccountOwnerParam;
        daveUserId: number;
      }

      const mobilePayID = await factory.create('mobile-pay-id');

      const mockRequest: IApplePayRequest = {
        referenceId: 'abcdefgh1234567',
        amount: 100,
        fundingType: PaymentMethodType.APPLE_PAY,
        owner: mockOwner,

        // Device-specific account number of the card that funds this transaction.
        // https://developer.apple.com/library/archive/documentation/PassKit/Reference/PaymentTokenJSON/PaymentTokenJSON.html#//apple_ref/doc/uid/TP40014929
        payload: { mobilePay: { accountNumber: '1234' } },

        feeIncluded: true,
        daveUserId: mobilePayID.userId,
      };

      await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);

      const otherUser = await factory.create('user');

      const response = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({ ...mockRequest, daveUserId: otherUser.id })
        .expect(400);

      expect(response.body.type).to.equal('invalid_verification');
      expect(response.body.message).to.match(/Failed mobile-pay duplicate card check/);
    });

    it('should return 200 if the same user re-uses an ApplePay account', async () => {
      interface IApplePayRequest {
        feeIncluded?: boolean;
        referenceId: string;
        amount: number;
        fundingType: PaymentMethodType;
        payload: { mobilePay: Partial<TabapayApplePayParam> };
        owner?: TabapayAccountOwnerParam;
        daveUserId: number;
      }

      const mobilePayID = await factory.create('mobile-pay-id');

      const mockRequest: IApplePayRequest = {
        referenceId: 'abcdefgh1234567',
        amount: 100,
        fundingType: PaymentMethodType.APPLE_PAY,
        owner: mockOwner,

        // Device-specific account number of the card that funds this transaction.
        // https://developer.apple.com/library/archive/documentation/PassKit/Reference/PaymentTokenJSON/PaymentTokenJSON.html#//apple_ref/doc/uid/TP40014929
        payload: { mobilePay: { accountNumber: '1234' } },

        feeIncluded: true,
        daveUserId: mobilePayID.userId,
      };

      await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);

      await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send({ ...mockRequest, referenceId: 'xabcdefgh123456' })
        .expect(200);
    });
  });

  describe('Success POST /payment/mobile', () => {
    let mockExternalPaymentResponse: ExternalMobilePayment;
    const mockRequest = {
      referenceId: 'abcdefgh1234567',
      amount: 100,
      fundingType: PaymentMethodType.APPLE_PAY,
      owner: mockOwner,
      payload: {},
      feeIncluded: true,
    };
    const mockAVSResponse = {
      SC: 200,
      AVS: {
        networkRC: '00',
        codeAVS: 'Y',
      },
    };
    let avsMock: sinon.SinonStub;

    beforeEach(() => {
      mockExternalPaymentResponse = {
        transactionId: 'abcde',
        status: ExternalTransactionStatus.Completed,
        isAVSMatch: true,
      };
      avsMock = sandbox.stub(DebitCardFunding, 'queryCard').resolves(mockAVSResponse);
    });
    it('should create a complete Debit Card Funding payment', async () => {
      const paymentMethod = await factory.create('payment-method', {
        tabapayId: 'tabapay-1234',
      });
      const debitCardFundingMockRequest = {
        referenceId: 'abcdefgh1234567',
        amount: 100,
        fundingType: PaymentMethodType.DEBIT_CARD,
        feeIncluded: true,
        daveUserId: paymentMethod.userId,
        payload: { paymentMethodId: paymentMethod.id },
      };
      const tabapayStub = sandbox
        .stub(DebitCardFunding, 'createMobileTransaction')
        .resolves(mockExternalPaymentResponse);
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(debitCardFundingMockRequest)
        .expect(200);
      expect(body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(body.isAVSMatch).to.equal(true);
      const tabapayArgs = tabapayStub.firstCall.args;
      expect(tabapayArgs[0].amount).to.equal(debitCardFundingMockRequest.amount);
      expect(tabapayArgs[0].feeIncluded).to.equal(true);
      expect(tabapayArgs[0].sourceAccountID).to.equal(paymentMethod.tabapayId);
      sinon.assert.calledOnce(avsMock);
    });

    it('should create a complete Apple Pay payment', async () => {
      const tabapayStub = sandbox
        .stub(DebitCardFunding, 'createMobileTransaction')
        .resolves(mockExternalPaymentResponse);

      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);

      expect(body.status).to.equal(ExternalTransactionStatus.Completed);
      expect(body.isAVSMatch).to.equal(true);
      const tabapayArgs = tabapayStub.firstCall.args;
      expect(tabapayArgs[0].amount).to.equal(mockRequest.amount);
      expect(tabapayArgs[0].feeIncluded).to.equal(true);
      sinon.assert.calledOnce(avsMock);
    });
    it('should return a pending status on Apple Pay payment', async () => {
      mockExternalPaymentResponse.status = ExternalTransactionStatus.Pending;
      const createStub = sandbox
        .stub(DebitCardFunding, 'createMobileTransaction')
        .resolves(mockExternalPaymentResponse);
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);
      expect(body.status).to.equal(ExternalTransactionStatus.Pending);
      expect(createStub.firstCall.args[0].amount).to.equal(mockRequest.amount);
      sinon.assert.calledOnce(avsMock);
    });
    it('should return cancel status on failed mobile transaction creation', async () => {
      const tabapayErrorMessage = 'SomeError';
      sandbox
        .stub(DebitCardFunding, 'createMobileTransaction')
        .throws(new Error(tabapayErrorMessage));
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);
      expect(body.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(body.referenceId.length).to.equal(15);
      expect(body.error).to.equal(tabapayErrorMessage);
      sinon.assert.calledOnce(avsMock);
    });
    it('should return cancel status on declined transaction', async () => {
      const expectedError = new PaymentProcessorError('Card entry declined...', 'AA', {
        customCode: CUSTOM_ERROR_CODES.BANK_DENIED_CARD,
      });
      sandbox.stub(DebitCardFunding, 'createMobileTransaction').throws(expectedError);
      const { body } = await request(app)
        .post('/services/loomis_api/payment/mobile')
        .send(mockRequest)
        .expect(200);
      expect(body.status).to.equal(ExternalTransactionStatus.Canceled);
      expect(body.referenceId.length).to.equal(15);
      expect(body.errorCode).to.equal(expectedError.customCode);
      expect(body.error).to.equal(expectedError.message);
    });
  });
});
