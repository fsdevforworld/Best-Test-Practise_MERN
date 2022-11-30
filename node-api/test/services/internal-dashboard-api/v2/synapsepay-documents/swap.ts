import * as sinon from 'sinon';
import * as request from 'supertest';
import { clean, replayHttp, mockIpForSynapsepay, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  setupSynapsePayUser,
  updateSynapsepayUser,
} from '../../../../domain/synapsepay/test-utils';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import { refreshDocument } from '../../../../../src/domain/synapsepay';

describe('POST /v2/synapsepay-documents/swap', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => mockIpForSynapsepay(sandbox));

  afterEach(() => clean(sandbox));

  it(
    'successfully swaps users',
    replayHttp('/dashboard/v2/synapsepay-documents/swap/success.json', async () => {
      const birthdate = moment('2000-01-01').format('YYYY-MM-DD');

      const user1 = await setupSynapsePayUser({
        userId: 3030,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103101',
        birthdate,
      });

      const user2 = await setupSynapsePayUser({
        userId: 3031,
        firstName: 'Swap',
        lastName: 'Me',
        phoneNumber: '+13103103102',
        birthdate,
      });

      await updateSynapsepayUser(user2, {
        permission: 'CLOSED',
        permission_code: 'DUPLICATE_ACCOUNT',
        documents: [],
      });

      const req = request(app)
        .post(`/v2/synapsepay-documents/swap`)
        .send({
          synapsepayUserIdToClose: user1.synapsepayId,
          synapsepayUserIdToOpen: user2.synapsepayId,
        })
        .expect(204);

      await withInternalUser(req);

      const [user1Doc] = await user1.getSynapsepayDocuments();
      const [user2Doc] = await user2.getSynapsepayDocuments();

      await refreshDocument(user1Doc);
      await refreshDocument(user2Doc);

      await user1Doc.reload();
      await user2Doc.reload();

      expect(user1Doc.permission).to.equal('CLOSED');
      expect(user2Doc.permission).to.not.equal('CLOSED');
    }),
  );
});
