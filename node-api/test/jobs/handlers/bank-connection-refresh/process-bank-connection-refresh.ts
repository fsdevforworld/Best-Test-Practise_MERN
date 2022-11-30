import { clean } from '../../../test-helpers';
import factory from '../../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import * as Jobs from '../../../../src/jobs/data';
import { processBankConnectionRefresh } from '../../../../src/jobs/handlers';
import { BankConnectionRefresh } from '../../../../src/models';
import logger from '../../../../src/lib/logger';
import plaidClient from '../../../../src/lib/plaid';
import * as BankingDataSync from '../../../../src/domain/banking-data-sync';

const sandbox = sinon.createSandbox();

describe('Process bank connection refresh job', () => {
  let getPlaidItemStub: sinon.SinonStub;
  let createCompleteBankConnectionRefreshStub: sinon.SinonStub;
  let loggerWarningStub: sinon.SinonStub;
  let dataSyncStub: sinon.SinonStub;

  let bankConnectionRefresh: BankConnectionRefresh;
  let bankConnectionRefreshId: number;

  before(() => clean());
  afterEach(() => clean(sandbox));

  beforeEach(async () => {
    getPlaidItemStub = sandbox.stub(plaidClient, 'getItem');
    createCompleteBankConnectionRefreshStub = sandbox
      .stub(Jobs, 'createCompleteBankConnectionRefresh')
      .resolves();
    loggerWarningStub = sandbox.stub(logger, 'warn');

    bankConnectionRefresh = await factory.create('bank-connection-refresh', {
      status: 'RECEIVED',
      requestedAt: moment().subtract(10, 'minutes'),
    });
    bankConnectionRefreshId = bankConnectionRefresh.id;
  });

  describe('Successful Plaid item retrieval -- new webhook', () => {
    beforeEach(() => {
      getPlaidItemStub.resolves({
        status: {
          last_webhook: { sent_at: moment().format() },
        },
      });
    });

    it('Updates status to PROCESSING and updates processingAt', async () => {
      expect(bankConnectionRefresh.processingAt).to.be.undefined;

      await processBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.status).to.equal('PROCESSING');
      expect(bankConnectionRefresh.processingAt).to.not.be.undefined;
    });

    it('Enqueues complete job', async () => {
      await processBankConnectionRefresh({ bankConnectionRefreshId });

      expect(
        createCompleteBankConnectionRefreshStub.calledOnceWithExactly({ bankConnectionRefreshId }),
      ).to.be.true;
    });
  });

  describe('Successful Plaid item retrieval -- no new webhook', () => {
    const oldWebhookTime = moment().subtract(2, 'days');
    beforeEach(() => {
      getPlaidItemStub.resolves({
        status: {
          last_webhook: { sent_at: oldWebhookTime.format() },
        },
      });
    });

    it('Updates status to COMPLETE and updates completedAt', async () => {
      expect(bankConnectionRefresh.completedAt).to.be.undefined;

      await processBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.status).to.equal('COMPLETED');
      expect(bankConnectionRefresh.completedAt).to.not.be.undefined;
    });

    it('Does not enqueue complete job', async () => {
      await processBankConnectionRefresh({ bankConnectionRefreshId });

      expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
    });
  });

  describe('Plaid error', () => {
    describe('Recognized PlaidError -- INTERNAL_SERVER_ERROR', () => {
      beforeEach(() => {
        getPlaidItemStub.rejects({
          error_type: 'API_ERROR',
          error_code: 'INTERNAL_SERVER_ERROR',
        });
      });

      it('Requests plaid call 3 times before updating error', async () => {
        await processBankConnectionRefresh({ bankConnectionRefreshId });

        await bankConnectionRefresh.reload();

        expect(bankConnectionRefresh.status).to.eq('ERROR');
        expect(bankConnectionRefresh.errorAt).to.not.be.undefined;
        expect(bankConnectionRefresh.errorCode).to.eq('INTERNAL_SERVER_ERROR');

        expect(getPlaidItemStub.calledThrice).to.be.true;
      });

      it('Does not enqueue process job', () => {
        expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
      });
    });

    describe('Recognized PlaidError -- non INTERNAL_SERVER_ERROR', () => {
      beforeEach(() => {
        getPlaidItemStub.rejects({
          error_type: 'ITEM_ERROR',
          error_code: 'INVALID_CREDENTIALS',
        });
      });

      it('Does not repeat plaid call before updating error', async () => {
        await processBankConnectionRefresh({ bankConnectionRefreshId });

        await bankConnectionRefresh.reload();

        expect(bankConnectionRefresh.status).to.eq('ERROR');
        expect(bankConnectionRefresh.errorAt).to.not.be.undefined;
        expect(bankConnectionRefresh.errorCode).to.eq('INVALID_CREDENTIALS');

        expect(getPlaidItemStub.calledOnce).to.be.true;
      });

      it('Does not enqueue process job', () => {
        expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
      });
    });

    describe('Plaid error -- disconnect', () => {
      beforeEach(() => {
        getPlaidItemStub.rejects({ error_code: 'INVALID_CREDENTIALS' });
        dataSyncStub = sandbox.stub(BankingDataSync, 'handleDisconnect');
      });

      it('Updates status to ERROR and calls handleDisconnect', async () => {
        await processBankConnectionRefresh({ bankConnectionRefreshId });

        expect(dataSyncStub).to.be.calledOnce;
      });
    });

    describe('Unrecognized PlaidError', () => {
      beforeEach(() => {
        getPlaidItemStub.rejects({ something: 'sinister' });
      });

      it('Updates status to ERROR and sets errorAt and errorCode', async () => {
        await processBankConnectionRefresh({ bankConnectionRefreshId });

        await bankConnectionRefresh.reload();

        expect(bankConnectionRefresh.status).to.eq('ERROR');
        expect(bankConnectionRefresh.errorAt).to.not.be.undefined;
        expect(bankConnectionRefresh.errorCode).to.eq('PLAID_GET_ITEM_UNKNOWN_ERROR');

        expect(getPlaidItemStub.calledOnce).to.be.true;
      });

      it('Does not enqueue process job', () => {
        expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
      });
    });
  });

  it('Updates to COMPLETED and logs a warning if Plaid response does not include last_webhook', async () => {
    getPlaidItemStub.resolves({
      status: {},
    });

    await processBankConnectionRefresh({ bankConnectionRefreshId });

    await bankConnectionRefresh.reload();

    expect(bankConnectionRefresh.status).to.eq('COMPLETED');
    expect(bankConnectionRefresh.completedAt).to.not.be.undefined;

    expect(
      loggerWarningStub.calledWithExactly(
        'Last webhook not found while processing bank connection refresh',
        {
          bankConnectionRefreshId,
        },
      ),
    ).to.be.true;
  });

  it('Returns early and logs warning if status is not RECEIVED', async () => {
    const completedRefresh = await factory.create('bank-connection-refresh', {
      status: 'CREATED',
    });

    await processBankConnectionRefresh({ bankConnectionRefreshId: completedRefresh.id });

    expect(
      loggerWarningStub.calledWithExactly(
        'Bank connection refresh process step attempted for a refresh with status other than RECEIVED',
        {
          bankConnectionRefreshId: completedRefresh.id,
          status: 'CREATED',
        },
      ),
    ).to.be.true;

    expect(getPlaidItemStub.notCalled).to.be.true;
  });
});
