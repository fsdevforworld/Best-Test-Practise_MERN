import { clean } from '../../../test-helpers';
import factory from '../../../factories';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Jobs from '../../../../src/jobs/data';
import { completeBankConnectionRefresh } from '../../../../src/jobs/handlers';
import { BankConnection, BankConnectionRefresh } from '../../../../src/models';
import logger from '../../../../src/lib/logger';
import { moment } from '@dave-inc/time-lib';

const sandbox = sinon.createSandbox();

describe('Complete bank connection refresh job', () => {
  let createCompleteBankConnectionRefreshStub: sinon.SinonStub;
  let loggerWarningStub: sinon.SinonStub;

  before(() => clean());
  afterEach(async () => clean(sandbox));

  let bankConnection: BankConnection;
  let bankConnectionRefresh: BankConnectionRefresh;
  let bankConnectionRefreshId: number;

  beforeEach(async () => {
    createCompleteBankConnectionRefreshStub = sandbox
      .stub(Jobs, 'createCompleteBankConnectionRefresh')
      .resolves();
    loggerWarningStub = sandbox.stub(logger, 'warn');

    bankConnection = await factory.create('bank-connection', {
      lastPull: moment().subtract(2, 'days'),
    });
  });

  describe('Last pull after bank connection requestedAt', () => {
    beforeEach(async () => {
      bankConnectionRefresh = await factory.create('bank-connection-refresh', {
        bankConnectionId: bankConnection.id,
        status: 'PROCESSING',
        requestedAt: moment().subtract(3, 'days'),
      });
      bankConnectionRefreshId = bankConnectionRefresh.id;
    });

    it('Updates status to COMPLETED and updates completedAt and does not enqueue job', async () => {
      expect(bankConnectionRefresh.completedAt).to.be.undefined;

      await completeBankConnectionRefresh({ bankConnectionRefreshId });

      await bankConnectionRefresh.reload();

      expect(bankConnectionRefresh.status).to.equal('COMPLETED');
      expect(bankConnectionRefresh.completedAt).to.not.be.undefined;

      expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
    });
  });

  describe('Last pull before bank connection requestedAt', () => {
    beforeEach(async () => {
      bankConnectionRefresh = await factory.create('bank-connection-refresh', {
        bankConnectionId: bankConnection.id,
        status: 'PROCESSING',
        requestedAt: moment(),
        processingAt: moment(),
      });
      bankConnectionRefreshId = bankConnectionRefresh.id;
    });

    it('Enqueues job again', async () => {
      const now = moment();

      await completeBankConnectionRefresh({ bankConnectionRefreshId });

      expect(createCompleteBankConnectionRefreshStub.calledWith({ bankConnectionRefreshId })).to.be
        .true;

      expect(
        now.isSameOrBefore(
          moment(createCompleteBankConnectionRefreshStub.getCall(0).args[1].startTime).subtract(
            10,
            'seconds',
          ),
        ),
      ).to.be.true;
    });
  });

  it('Returns early, updates status to ERROR, and logs warning if status is not PROCESSING', async () => {
    const receivedRefresh = await factory.create('bank-connection-refresh', {
      status: 'RECEIVED',
    });

    await completeBankConnectionRefresh({ bankConnectionRefreshId: receivedRefresh.id });

    await receivedRefresh.reload();

    expect(
      loggerWarningStub.calledWithExactly(
        'Bank connection refresh complete step attempted for a refresh with status other than PROCESSING',
        {
          bankConnectionRefreshId: receivedRefresh.id,
          status: 'RECEIVED',
        },
      ),
    ).to.be.true;

    expect(receivedRefresh.status).to.equal('ERROR');
    expect(receivedRefresh.errorAt).to.not.be.undefined;
    expect(receivedRefresh.errorCode).to.equal('INVALID_STATUS_DURING_COMPLETE');

    expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
  });

  it('Updates status to ERROR and does not enqueue retry when processedAt is more than 3 minutes ago', async () => {
    const oldRefresh = await factory.create('bank-connection-refresh', {
      status: 'PROCESSING',
      requestedAt: moment().subtract(4, 'minutes'),
      processingAt: moment().subtract(4, 'minutes'),
    });

    await completeBankConnectionRefresh({ bankConnectionRefreshId: oldRefresh.id });

    await oldRefresh.reload();

    expect(oldRefresh.status).to.equal('ERROR');
    expect(oldRefresh.errorAt).to.not.be.undefined;
    expect(oldRefresh.errorCode).to.equal('WEBHOOK_PROCESSING_TIMEOUT');

    expect(createCompleteBankConnectionRefreshStub.notCalled).to.be.true;
  });
});
