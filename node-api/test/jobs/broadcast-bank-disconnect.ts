import * as sinon from 'sinon';
import { clean, replayHttp } from '../test-helpers';
import factory from '../factories';
import { BankConnection, BankAccount } from '../../src/models';
import { moment } from '@dave-inc/time-lib';
import braze from '../../src/lib/braze';
import { broadcastBankDisconnect } from '../../src/jobs/handlers/broadcast-bank-disconnect';
import { getAdvancePaybackUrl } from '../../src/jobs/handlers/broadcast-bank-disconnect';
import { expect } from 'chai';
import amplitude from '../../src/lib/amplitude';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';

const FILE_PATH = '../fixtures/jobs/broadcast-bank-disconnect';

describe('Job: broadcast-bank-disconnect', () => {
  const sandbox = sinon.createSandbox();
  const occurredAt = moment('2018-11-01');

  afterEach(() => sandbox.restore());

  afterEach(() => clean());

  it('should not send any events if the connection is not default', async () => {
    const institution = await factory.create('institution');
    const bankConnection: BankConnection = await factory.create('bank-connection', {
      institutionId: institution.id,
    });
    const user = await bankConnection.getUser();
    await user.update({ defaultBankAccountId: 1 });

    const amplitudeSpy = sandbox.spy(amplitude, 'track');
    const brazeSpy = sandbox.spy(braze, 'track');

    const payload = {
      institutionId: 1,
      userId: user.id,
      bankConnectionId: bankConnection.id,
      time: occurredAt.valueOf() as number,
    };
    await broadcastBankDisconnect(payload);

    sinon.assert.notCalled(amplitudeSpy);
    sinon.assert.notCalled(brazeSpy);
  });

  it('should send all events if the connection is default', async () => {
    const institution = await factory.create('institution');
    const bankConnection: BankConnection = await factory.create('bank-connection', {
      institutionId: institution.id,
    });
    const bankAccount = await factory.create('checking-account', {
      bankConnectionId: bankConnection.id,
      userId: bankConnection.userId,
    });
    const user = await bankConnection.getUser();
    await user.update({ defaultBankAccountId: bankAccount.id });

    const amplitudeSpy = sandbox.stub(amplitude, 'track').resolves();
    const brazeSpy = sandbox.stub(braze, 'track').resolves();

    const payload = {
      institutionId: 1,
      userId: user.id,
      bankConnectionId: bankConnection.id,
      time: occurredAt.valueOf(),
    };

    await broadcastBankDisconnect(payload);

    sinon.assert.calledOnce(amplitudeSpy);
    sinon.assert.calledOnce(brazeSpy);
  });

  it(
    'sends an event to Braze',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const [institution, user] = await Promise.all([
        factory.create('institution', {
          id: 1,
          displayName: 'Bank of Steven',
        }),
        factory.create('user', { id: 3 }),
      ]);

      const bankConnection = await factory.create('bank-connection', {
        id: 2,
        institutionId: institution.id,
        hasValidCredentials: false,
        userId: user.id,
      });

      const spy = sandbox.spy(braze, 'track');

      const payload = {
        institutionId: 1,
        userId: user.id,
        bankConnectionId: bankConnection.id,
        time: occurredAt.valueOf(),
      };

      await broadcastBankDisconnect(payload);

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body).to.deep.equal({
        message: 'success',
        events_processed: 1,
      });
    }),
  );

  it(
    'sends an event to Braze with paybackUrl',
    replayHttp(`${FILE_PATH}/paybackUrl-success.json`, async () => {
      const [institution, user] = await Promise.all([
        factory.create('institution', {
          id: 1,
          displayName: 'Bank of Steven',
        }),
        factory.create('user', { id: 3 }),
      ]);

      const bankConnection = await factory.create('bank-connection', {
        institutionId: institution.id,
        hasValidCredentials: false,
        userId: user.id,
      });
      const bankAccount = await factory.create('bank-account', {
        lastFour: '1111',
        bankConnectionId: bankConnection.id,
        userId: user.id,
        subtype: 'CHECKING',
      });
      await factory.create('advance', {
        id: 100,
        bankAccountId: bankAccount.id,
        disbursementStatus: ExternalTransactionStatus.Pending,
        outstanding: 25,
      });

      const spy = sandbox.spy(braze, 'track');

      const payload = {
        institutionId: 1,
        userId: user.id,
        bankConnectionId: bankConnection.id,
        time: occurredAt.valueOf(),
      };

      await broadcastBankDisconnect(payload);

      sinon.assert.calledOnce(spy);

      const response = await spy.returnValues[0];

      expect(response.body).to.deep.equal({
        message: 'success',
        events_processed: 1,
      });
    }),
  );

  it(
    'sends an event to Amplitude',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const [institution, user] = await Promise.all([
        factory.create('institution', {
          id: 1,
          displayName: 'Bank of Steven',
        }),
        factory.create('user', { id: 3 }),
      ]);

      const bankConnection = await factory.create('bank-connection', {
        id: 2,
        institutionId: institution.id,
        hasValidCredentials: false,
        userId: user.id,
      });

      const spy = sandbox.spy(amplitude, 'track');

      const payload = {
        institutionId: 1,
        userId: user.id,
        bankConnectionId: bankConnection.id,
        time: occurredAt.valueOf(),
      };

      await broadcastBankDisconnect(payload);

      sinon.assert.calledOnce(spy);
    }),
  );

  it(
    'handles deleted bank connections',
    replayHttp(`${FILE_PATH}/success.json`, async () => {
      const [institution, user] = await Promise.all([
        factory.create('institution', {
          id: 1,
          displayName: 'Bank of Steven',
        }),
        factory.create('user', { id: 3 }),
      ]);

      const bankConnection = await factory.create('bank-connection', {
        id: 2,
        institutionId: institution.id,
        hasValidCredentials: false,
        userId: user.id,
      });

      await bankConnection.destroy();

      const spy = sandbox.spy(amplitude, 'track');

      const payload = {
        institutionId: 1,
        userId: user.id,
        bankConnectionId: bankConnection.id,
        time: occurredAt.valueOf(),
      };

      await broadcastBankDisconnect(payload);

      sinon.assert.calledOnce(spy);
    }),
  );

  describe('getAdvancePaybackUrl', () => {
    it('should return a url if advance exists with oustanding amount', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      await factory.create('advance', {
        bankAccountId: bankAccount.id,
        disbursementStatus: ExternalTransactionStatus.Pending,
        outstanding: 25,
      });

      const paybackUrl = await getAdvancePaybackUrl(bankConnection.id);

      expect(paybackUrl).to.be.not.null;
    });

    it('should return null if advance exists without oustanding amount', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();

      await factory.create('advance', {
        bankAccountId: bankAccount.id,
        disbursementStatus: ExternalTransactionStatus.Pending,
        outstanding: 0,
      });

      const paybackUrl = await getAdvancePaybackUrl(bankConnection.id);

      expect(paybackUrl).to.be.null;
    });

    it('should return null if advance doesnt exist', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');
      const bankConnection = await bankAccount.getBankConnection();
      const paybackUrl = await getAdvancePaybackUrl(bankConnection.id);

      expect(paybackUrl).to.be.null;
    });
  });
});
