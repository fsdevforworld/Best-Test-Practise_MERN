import { clean } from '../../../test-helpers';
import factory from '../../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Jobs from '../../../../src/jobs/data';
import { initiateBankConnectionRefresh } from '../../../../src/jobs/handlers';
import { BankConnectionRefresh } from '../../../../src/models';
import logger from '../../../../src/lib/logger';
import plaidClient from '../../../../src/lib/plaid';
import * as BankingDataSync from '../../../../src/domain/banking-data-sync';

const sandbox = sinon.createSandbox();

describe('Initiate bank connection refresh job', () => {
  let refreshTransactionsStub: sinon.SinonStub;
  let createProcessBankConnectionRefreshStub: sinon.SinonStub;
  let loggerWarningStub: sinon.SinonStub;
  let dataSyncStub: sinon.SinonStub;

  let bankConnectionRefresh: BankConnectionRefresh;
  let bankConnectionRefreshId: number;

  before(() => clean());
  afterEach(() => clean(sandbox));

  beforeEach(async () => {
    refreshTransactionsStub = sandbox.stub(plaidClient, 'refreshTransactions');
    createProcessBankConnectionRefreshStub = sandbox
      .stub(Jobs, 'createProcessBankConnectionRefresh')
      .resolves();
    loggerWarningStub = sandbox.stub(logger, 'warn');

    bankConnectionRefresh = await factory.create('bank-connection-refresh');
    bankConnectionRefreshId = bankConnectionRefresh.id;
  });

  describe('Successful Plaid refresh request', () => {
    beforeEach(() => {
      refreshTransactionsStub.resolves({ request_id: '12345' });
    });

    it('Updates status to RECEIVED and updates receivedAt', async () => {
      expect(bankConnectionRefresh.receivedAt).to.be.undefined;

      await initiateBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.status).to.equal('RECEIVED');
      expect(bankConnectionRefresh.receivedAt).to.not.be.undefined;
    });

    it('Sets requestedAt', async () => {
      expect(bankConnectionRefresh.requestedAt).to.be.undefined;

      await initiateBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.requestedAt).to.not.be.undefined;
    });

    it('Enqueues process job', async () => {
      await initiateBankConnectionRefresh({ bankConnectionRefreshId });

      expect(
        createProcessBankConnectionRefreshStub.calledOnceWithExactly({ bankConnectionRefreshId }),
      ).to.be.true;
    });
  });

  describe('Plaid error', () => {
    beforeEach(() => {
      refreshTransactionsStub.rejects({ error_code: 'INVALID_FIELD' });
    });

    it('Updates status to ERROR and sets errorAt and errorCode', async () => {
      await initiateBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.status).to.eq('ERROR');
      expect(bankConnectionRefresh.errorAt).to.not.be.undefined;
      expect(bankConnectionRefresh.errorCode).to.eq('INVALID_FIELD');
    });

    it('Does not enqueue process job', () => {
      expect(createProcessBankConnectionRefreshStub.notCalled).to.be.true;
    });
  });

  describe('Plaid error -- disconnect', () => {
    beforeEach(() => {
      refreshTransactionsStub.rejects({ error_code: 'INVALID_CREDENTIALS' });
      dataSyncStub = sandbox.stub(BankingDataSync, 'handleDisconnect');
    });

    it('Updates status to ERROR and calls handleDisconnect', async () => {
      await initiateBankConnectionRefresh({ bankConnectionRefreshId });

      expect(dataSyncStub).to.be.calledOnce;
    });
  });

  describe('BANK_OF_DAVE connection', () => {
    let bodRefresh: BankConnectionRefresh;

    beforeEach(async () => {
      const bodConnection = await factory.create('bank-of-dave-bank-connection');
      bodRefresh = await factory.create('bank-connection-refresh', {
        bankConnectionId: bodConnection.id,
      });
    });

    it('Updates status to error and logs warning', async () => {
      await initiateBankConnectionRefresh({ bankConnectionRefreshId: bodRefresh.id });

      await bodRefresh.reload();

      expect(bodRefresh.status).to.eq('ERROR');
      expect(bodRefresh.errorAt).to.not.be.undefined;
      expect(bodRefresh.errorCode).to.eq('NON_PLAID_DATA_SOURCE');

      expect(
        loggerWarningStub.calledWithExactly(
          'Attempted dashboard refresh on non-plaid bank connection',
          {
            bankConnectionRefreshId: bodRefresh.id,
          },
        ),
      ).to.be.true;
    });

    it('Does not enqueue process job', () => {
      expect(createProcessBankConnectionRefreshStub.notCalled).to.be.true;
    });
  });

  it('Returns early and logs warning if status is not CREATED', async () => {
    const processingRefresh = await factory.create('bank-connection-refresh', {
      status: 'PROCESSING',
    });

    await initiateBankConnectionRefresh({ bankConnectionRefreshId: processingRefresh.id });

    expect(
      loggerWarningStub.calledWithExactly(
        'Bank connection refresh initiation step attempted for a refresh with status other than CREATED',
        {
          bankConnectionRefreshId: processingRefresh.id,
          status: 'PROCESSING',
        },
      ),
    ).to.be.true;

    expect(refreshTransactionsStub.notCalled).to.be.true;
  });
});
