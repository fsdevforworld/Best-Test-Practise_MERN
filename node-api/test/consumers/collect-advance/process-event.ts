import { BankingDataSource } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';

import { Advance, BankAccount, PaymentMethod } from '../../../src/models';

import RefreshBalanceAndCollectTask from '../../../src/domain/collection/refresh-balance-and-collect';

import { processAdvanceCollectionEvent } from '../../../src/consumers/collect-advance/process-event';

import { BankDataSourceRefreshError, CUSTOM_ERROR_CODES } from '../../../src/lib/error';

import { clean } from '../../test-helpers';

describe('Collect Advance Consumer', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(() => clean());

  afterEach(() => clean(sandbox));

  describe('processAdvanceCollectionEvent', () => {
    [
      {
        testCase: 'should ack advance collection event when successfully collected',
        taskResult: {
          status: 'success',
        },
        expectedPubSubEventOperation: 'ack',
      },
      {
        testCase: 'should nack advance collection event when hitting plaid balance rate limit',
        taskResult: {
          error: new BankDataSourceRefreshError('rate limit sux', {
            customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
            source: BankingDataSource.Plaid,
          }),
          status: 'failure',
        },
        expectedPubSubEventOperation: 'nack',
      },
      {
        testCase: 'should ack advance collection event when hitting mx balance rate limit',
        taskResult: {
          error: new BankDataSourceRefreshError('rate limit sux', {
            customCode: CUSTOM_ERROR_CODES.BANK_BALANCE_ACCESS_LIMIT,
            source: BankingDataSource.Mx,
          }),
          status: 'failure',
        },
        expectedPubSubEventOperation: 'ack',
      },
    ].forEach(({ testCase, taskResult, expectedPubSubEventOperation }) => {
      it(testCase, async () => {
        const advanceId = 123;
        const advance = { id: advanceId };

        sandbox
          .stub(Advance, 'findByPk')
          .withArgs(advanceId, {
            include: [
              { model: BankAccount, paranoid: false },
              { model: PaymentMethod, paranoid: false },
            ],
          })
          .returns(advance);

        const event = {
          ack: sandbox.stub(),
          nack: sandbox.stub(),
        } as any;

        sandbox.stub(RefreshBalanceAndCollectTask.prototype, 'run').returns(taskResult);

        await processAdvanceCollectionEvent(event, { advanceId });

        sinon.assert.calledOnce(event[expectedPubSubEventOperation]);
      });
    });
  });
});
