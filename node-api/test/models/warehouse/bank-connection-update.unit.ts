import * as sinon from 'sinon';
import { expect } from 'chai';
import {
  recordEventMessage,
  BankConnectionUpdateCreate,
} from '../../../src/models/warehouse/bank-connection-update';
import bankConnectionUpdate from '../../../src/models/warehouse/bank-connection-update';
import { recordEvent } from '../../../src/domain/event/index';
const sandbox = sinon.createSandbox();

describe('BankConnectionUpdate', () => {
  describe('message', () => {
    const USER_ID = 1;
    const BANK_CONNECTION_ID = 8256;
    const BCUC_TYPE = 'create';
    const TABLE = 'some-table';
    const EVENT: BankConnectionUpdateCreate = {
      userId: USER_ID,
      bankConnectionId: BANK_CONNECTION_ID,
      type: BCUC_TYPE,
    };

    it('assembles a message', async () => {
      const result = recordEventMessage(TABLE, EVENT);
      expect(result.table).to.eq(TABLE);
      expect(result.data.user_id).to.eq(USER_ID);
      expect(result.data.type).to.eq(BCUC_TYPE);
      expect(result.data.bank_connection_id).to.eq(BANK_CONNECTION_ID);
      expect(result.data.successful).to.eq(null);
      expect(result.data.extra.string).to.eq('{}');
    });

    it('assembles a message with null successful', async () => {
      const result = recordEventMessage(TABLE, EVENT, null);
      expect(result.data.successful).to.eq(null);
      expect(result.data.extra.string).to.eq('{}');
    });

    it('assembles a message with undefined successful', async () => {
      const result = recordEventMessage(TABLE, EVENT, undefined);
      expect(result.data.successful).to.eq(null);
      expect(result.data.extra.string).to.eq('{}');
    });

    it('assembles a message with false successful', async () => {
      const event: BankConnectionUpdateCreate = {
        userId: USER_ID,
        bankConnectionId: 0,
        successful: false,
        type: BCUC_TYPE,
        extra: { foo: 'bar' },
      };
      const result = recordEventMessage(TABLE, event, event.successful, event.extra);
      expect(result.data.successful.boolean).to.eq(false);
    });

    it('assembles a message with extra data', async () => {
      const event: BankConnectionUpdateCreate = {
        userId: USER_ID,
        bankConnectionId: 0,
        successful: true,
        type: BCUC_TYPE,
        extra: { foo: 'bar' },
      };
      const result = recordEventMessage(TABLE, event, event.successful, event.extra);
      expect(result.data.extra.string).to.eq('{"foo":"bar"}');
    });

    it('creates', async () => {
      const stub = sandbox.stub(recordEvent, 'publish');
      const EXPECTATION = sinon.match({
        data: {
          bank_connection_id: 8256,
          created: sinon.match.string,
          extra: { string: '{}' },
          successful: null,
          type: 'create',
          user_id: 1,
          uuid: sinon.match.string,
        },
        table: 'bank_connection_update',
      });

      bankConnectionUpdate.create(EVENT);
      sinon.assert.calledWith(stub, EXPECTATION);
    });
  });
});
