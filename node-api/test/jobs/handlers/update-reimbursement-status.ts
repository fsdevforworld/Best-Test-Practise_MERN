import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Loomis from '@dave-inc/loomis-client';
import {
  PaymentProviderTransactionStatus,
  PaymentGateway,
  PaymentProcessor,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { ReimbursementExternalProcessor } from '../../../src/models/reimbursement';
import { updateReimbursementStatus } from '../../../src/jobs/handlers';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import logger from '../../../src/lib/logger';
import { clean } from '../../test-helpers';
import factory from '../../factories';

describe('Job: update-reimbursement-status', () => {
  const sandbox = sinon.createSandbox();
  let dogstatsdStub: sinon.SinonStub;
  let loggerStub: sinon.SinonStub;

  before(() => clean());

  beforeEach(() => {
    dogstatsdStub = sandbox.stub(dogstatsd, 'increment');
    loggerStub = sandbox.stub(logger, 'error');
  });

  afterEach(() => clean(sandbox));

  describe('Update transaction success', () => {
    it('should update a reimbursement transaction created through Bank of Dave', async () => {
      const externalId = 'abcd-123-ghj-999';
      const referenceId = 'hhh777jjj999l';

      const reimbursement = await factory.create('reimbursement', {
        externalId,
        externalProcessor: ReimbursementExternalProcessor.BankOfDave,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const bankOfDaveStub = sandbox.stub().resolves({
        externalId,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.BankOfDave)
        .returns({ fetchTransaction: bankOfDaveStub });

      await updateReimbursementStatus({ reimbursementId: reimbursement.id });
      await reimbursement.reload();

      sandbox.assert.calledWith(bankOfDaveStub, {
        type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
        externalId,
        processor: PaymentProcessor.BankOfDave,
        referenceId,
        daveUserId: reimbursement.userId,
      });
      expect(reimbursement.status).to.equal(PaymentProviderTransactionStatus.Completed);
      expect(dogstatsdStub.getCall(1).args[0]).to.equal('update_reimbursement_status.job_succeded');
    });

    it('should update a reimbursement transaction created through Synapse', async () => {
      const externalId = 'abcd-123-ghj-999';
      const referenceId = 'hhh777jjj999l';

      const reimbursement = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: ReimbursementExternalProcessor.Synapsepay,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const synapseStub = sandbox.stub().resolves({
        externalId,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Synapsepay)
        .returns({ fetchTransaction: synapseStub });

      await updateReimbursementStatus({ reimbursementId: reimbursement.id });
      await reimbursement.reload();

      sandbox.assert.calledWith(synapseStub, {
        type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
        externalId: null,
        processor: PaymentProcessor.Synapsepay,
        referenceId,
        daveUserId: reimbursement.userId,
      });
      expect(reimbursement.status).to.equal(PaymentProviderTransactionStatus.Completed);
      expect(reimbursement.externalId).to.equal(externalId);
      expect(dogstatsdStub.getCall(1).args[0]).to.equal('update_reimbursement_status.job_succeded');
    });

    it('should update a reimbursement transaction created through Tabapay', async () => {
      const externalId = 'abcd-123-ghj-999';
      const referenceId = 'hhh777jjj999l';

      const reimbursement = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: ReimbursementExternalProcessor.Tabapay,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const tabapayStub = sandbox.stub().resolves({
        externalId,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      await updateReimbursementStatus({ reimbursementId: reimbursement.id });
      await reimbursement.reload();

      sandbox.assert.calledWith(tabapayStub, {
        type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
        externalId: null,
        processor: PaymentProcessor.Tabapay,
        referenceId,
        daveUserId: reimbursement.userId,
      });
      expect(reimbursement.status).to.equal(PaymentProviderTransactionStatus.Completed);
      expect(reimbursement.externalId).to.equal(externalId);
      expect(dogstatsdStub.getCall(1).args[0]).to.equal('update_reimbursement_status.job_succeded');
    });

    it.skip('should update a reimbursement transaction created through Tabapay ACH', async () => {
      const externalId = 'abcd-123-ghj-999';
      const referenceId = 'hhh777jjj999l';

      const reimbursement = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: ReimbursementExternalProcessor.TabapayACH,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const tabapayStub = sandbox.stub().resolves({
        externalId,
        status: PaymentProviderTransactionStatus.Completed,
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.TabapayACH)
        .returns({ fetchTransaction: tabapayStub });

      await updateReimbursementStatus({ reimbursementId: reimbursement.id });
      await reimbursement.reload();

      sandbox.assert.calledWith(tabapayStub, {
        type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
        externalId: null,
        processor: PaymentProcessor.TabapayACH,
        referenceId,
        daveUserId: reimbursement.userId,
      });
      expect(reimbursement.status).to.equal(PaymentProviderTransactionStatus.Completed);
      expect(reimbursement.externalId).to.equal(externalId);
      expect(dogstatsdStub.getCall(1).args[0]).to.equal('update_reimbursement_status.job_succeded');
    });
  });

  describe('Update transaction failure', () => {
    it('should throw and log the error if the reimbursement transaction is not found', async () => {
      await updateReimbursementStatus({ reimbursementId: 999999999 });

      expect(loggerStub.getCall(0).args[1]).to.include({
        name: 'NotFoundError',
        message: 'Reimbursement transaction does not exist',
      });
      expect(dogstatsdStub.getCall(1).args[0]).to.equal(
        'update_reimbursement_status.transaction_not_found',
      );
      expect(dogstatsdStub.getCall(2).args[0]).to.equal('update_reimbursement_status.job_failed');
    });

    it('should throw and log the error if the reimbursement transaction is missing the external and reference Ids', async () => {
      const { id } = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: ReimbursementExternalProcessor.Tabapay,
        referenceId: null,
        status: PaymentProviderTransactionStatus.Pending,
      });

      await updateReimbursementStatus({ reimbursementId: id });

      expect(loggerStub.getCall(0).args[1]).to.include({
        name: 'InvalidParametersError',
        message: 'Missing necessary reference data, cannot update',
      });
      expect(dogstatsdStub.getCall(1).args[0]).to.equal(
        'update_reimbursement_status.missing_external_reference_ids',
      );
      expect(dogstatsdStub.getCall(2).args[0]).to.equal('update_reimbursement_status.job_failed');
    });

    it('should throw and log the error if the reimbursement transaction is missing the external processor', async () => {
      const referenceId = 'hhh777jjj999l';

      const { id } = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: null,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });

      await updateReimbursementStatus({ reimbursementId: id });

      expect(loggerStub.getCall(0).args[1]).to.include({
        name: 'InvalidParametersError',
        message: 'Missing necessary reference data, cannot update',
      });
      expect(dogstatsdStub.getCall(1).args[0]).to.equal(
        'update_reimbursement_status.missing_external_reference_ids',
      );
      expect(dogstatsdStub.getCall(2).args[0]).to.equal('update_reimbursement_status.job_failed');
    });

    it('should throw and log the error if the reimbursement transaction uses an unsupported payment processor', async () => {
      const { id } = await factory.create('reimbursement', {
        externalId: null,
        externalProcessor: ReimbursementExternalProcessor.Blastpay,
        referenceId: 'hhh777jjj999l',
        status: PaymentProviderTransactionStatus.Pending,
      });

      await updateReimbursementStatus({ reimbursementId: id });

      expect(loggerStub.getCall(0).args[1]).to.include({
        name: 'InvalidParametersError',
        message: 'Unsupported external processor: BLASTPAY',
      });
      expect(dogstatsdStub.getCall(1).args[0]).to.equal(
        'update_reimbursement_status.unsupported_processor',
      );
      expect(dogstatsdStub.getCall(2).args[0]).to.equal('update_reimbursement_status.job_failed');
    });

    it('should throw and log the error if the request to Loomis fails', async () => {
      const externalId = 'abcd-123-ghj-999';
      const referenceId = 'hhh777jjj999l';

      const reimbursement = await factory.create('reimbursement', {
        externalId,
        externalProcessor: ReimbursementExternalProcessor.Tabapay,
        referenceId,
        status: PaymentProviderTransactionStatus.Pending,
      });
      const tabapayStub = sandbox.stub().rejects({
        body: {
          type: 'Error',
          message: 'Failed fetching transaction',
        },
      });
      sandbox
        .stub(Loomis, 'getPaymentGateway')
        .withArgs(PaymentGateway.Tabapay)
        .returns({ fetchTransaction: tabapayStub });

      await updateReimbursementStatus({ reimbursementId: reimbursement.id });

      sandbox.assert.calledWith(tabapayStub, {
        type: PaymentProviderTransactionType.AdvanceDisbursement, // Used for reimbursements
        externalId,
        processor: PaymentProcessor.Tabapay,
        referenceId,
        daveUserId: reimbursement.userId,
      });

      expect(loggerStub.getCall(1).args[1].body).to.include({
        type: 'Error',
        message: 'Failed fetching transaction',
      });
      expect(dogstatsdStub.getCall(1).args[0]).to.equal('update_reimbursement_status.job_failed');
    });
  });
});
