import 'mocha';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import * as ReplicaReader from '../../../../src/helper/read-replica/';
import * as ExpectedHelper from '../../../../src/domain/recurring-transaction/match-expected-transactions';
import { updateExpectedTransactions } from '../../../../src/domain/recurring-transaction/jobs/handlers';
import { BankingDataSyncSource } from '../../../../src/typings';

describe('Update expected transactions job', () => {
  const sandbox = sinon.createSandbox();

  let useReplicaStub: sinon.SinonStub;

  beforeEach(() => {
    useReplicaStub = sandbox.stub(ReplicaReader, 'shouldTaskUseReadReplica').resolves();
  });
  afterEach(() => clean(sandbox));

  it('should run update by bank account id on all accounts associated with a connection', async () => {
    const account1 = await factory.create('bank-account');
    await factory.create('bank-account', {
      bankConnectionId: account1.bankConnectionId,
      userId: account1.userId,
    });

    const stub = sandbox.stub(ExpectedHelper, 'updateByAccountId');

    await updateExpectedTransactions(
      {
        bankConnectionId: account1.bankConnectionId,
        source: BankingDataSyncSource.PlaidUpdater,
      },
      { get: () => {} } as any,
    );

    expect(stub.callCount).to.eq(2);
  });

  it('should return silently if bank connection is not found', async () => {
    const res = await updateExpectedTransactions(
      {
        bankConnectionId: 12341234,
        source: BankingDataSyncSource.PlaidUpdater,
      },
      { get: () => {} } as any,
    );

    expect(res).to.eq(undefined);
  });

  [true, false].forEach(shouldUseReplica => {
    it(`should use replica ${shouldUseReplica}`, async () => {
      const ba = await factory.create('bank-account');

      const stub = sandbox.stub(ExpectedHelper, 'updateByAccountId');
      useReplicaStub.resolves(shouldUseReplica);

      await updateExpectedTransactions(
        {
          bankConnectionId: ba.bankConnectionId,
          source: BankingDataSyncSource.PlaidUpdater,
        },
        { get: () => Date.now() - 700000 } as any,
      );

      const useReplica = stub.firstCall.args[2];
      expect(useReplica).to.equal(shouldUseReplica);
    });

    it('should respect canUseReadReplica param', async () => {
      const ba = await factory.create('bank-account');

      const stub = sandbox.stub(ExpectedHelper, 'updateByAccountId');

      await updateExpectedTransactions(
        {
          bankConnectionId: ba.bankConnectionId,
          source: BankingDataSyncSource.PlaidUpdater,
          canUseReadReplica: false,
        },
        { get: () => Date.now() - 700000 } as any,
      );

      const useReplica = stub.firstCall.args[2];
      expect(useReplica).to.equal(false);

      sinon.assert.notCalled(useReplicaStub);
    });
  });
});
