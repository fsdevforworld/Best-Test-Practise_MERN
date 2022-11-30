import { publishApprovalEvents } from '../../../src/services/advance-approval/data-engine';
import { DataEngineClient } from '@dave-inc/data-engine-client';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';

describe('services/advance-approval/data-engine', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  let clientStub: sinon.SinonStub;
  beforeEach(() => {
    clientStub = sandbox.stub(DataEngineClient.prototype, 'publishEventMessage');
  });

  describe('publishApprovalEvents', () => {
    it('publishes requested and approved events when user is approved', async () => {
      const created = moment().format();
      const approval = {
        id: 21,
        approved: true,
        bankAccountId: 100,
        approvedAmounts: [25, 50, 75],
        created,
      };

      await publishApprovalEvents(1, [approval]);

      expect(clientStub).to.have.callCount(1);
      expect(clientStub).to.have.been.calledWithExactly({
        entity: 'user',
        id: '1',
        source: 'advance-approval',
        events: [
          {
            field: 'request',
            subEntities: { 'bank-account': `100` },
            value: true,
            version: 'v1',
            timestampMs: moment(created).valueOf(),
          },
          {
            field: 'approved',
            subEntities: { 'bank-account': `100` },
            value: 75,
            version: 'v1',
            timestampMs: moment(created).valueOf(),
          },
        ],
      });
    });

    it('publishes requested and rejected events when user is rejected', async () => {
      const created = moment().format();
      const approval = {
        id: 21,
        approved: false,
        bankAccountId: 100,
        approvedAmounts: [] as number[],
        primaryRejectionReason: { type: 'some-rejection-reason' },
        created,
      };

      await publishApprovalEvents(1, [approval]);

      expect(clientStub).to.have.callCount(1);
      expect(clientStub).to.have.been.calledWithExactly({
        entity: 'user',
        id: '1',
        source: 'advance-approval',
        events: [
          {
            field: 'request',
            subEntities: { 'bank-account': `100` },
            value: true,
            version: 'v1',
            timestampMs: moment(created).valueOf(),
          },
          {
            field: 'rejected',
            subEntities: { 'bank-account': `100` },
            value: 'some-rejection-reason',
            version: 'v1',
            timestampMs: moment(created).valueOf(),
          },
        ],
      });
    });
  });
});
