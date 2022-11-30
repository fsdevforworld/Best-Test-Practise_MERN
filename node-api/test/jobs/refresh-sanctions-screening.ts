import { expect } from 'chai';
import * as sinon from 'sinon';
import { clean, replayHttp } from '../test-helpers';
import factory from '../factories';
import { refreshSanctionsScreening } from '../../src/jobs/handlers/refresh-sanctions-screening';
import { DehydratedBaseDocument, DehydratedUser, User as SynapsepayUser } from 'synapsepay';
import * as SynapsePayHelper from '../../src/domain/synapsepay/user';
import { Alert } from '../../src/models';
import twilio from '../../src/lib/twilio';

describe('Job: refresh-sanctions-screening', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  beforeEach(() => {
    sandbox.stub(twilio, 'send').resolves();
  });

  afterEach(() => clean(sandbox));

  it(
    `updates the sanctionsScreeningMatch field for the user's synapse documents`,
    replayHttp('jobs/refresh-sanctions-screening/success.json', async () => {
      const user = await factory.create('user', { synapsepayId: '5c64c26b7f9c202542e9adf7' });
      const synapseDocument = await factory.create('synapsepay-document', {
        userId: user.id,
        synapsepayDocId: 'ff50d88929b6e95650fc7028fd36237f392c3cdbabe26e4c06d9b86a1c40ff2b',
        sanctionsScreeningMatch: true,
      });

      await refreshSanctionsScreening({ userId: user.id });

      await synapseDocument.reload();

      expect(synapseDocument.sanctionsScreeningMatch).to.equal(false);
    }),
  );

  it('alerts the user when they need to upload their license', async () => {
    const mockDocument = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
      id: 'test-doc-1',
      screening_results: {
        fbi_cyber: 'NO_MATCH',
        aucl: 'MATCH',
      },
    });

    const mockDehydratedUser = await factory.build<DehydratedUser>('dehydrated-synapsepay-user', {
      _id: 'test-user-1',
      documents: [mockDocument],
    });

    const user = await factory.create('user', { synapsepayId: 'test-user-1' });
    const mockSynapsepayUser: SynapsepayUser = {
      json: mockDehydratedUser,
      oauth_key: 'foo',
      updateAsync(): any {},
    };

    await factory.create('synapsepay-document', {
      userId: user.id,
      synapsepayDocId: 'test-doc-1',
      sanctionsScreeningMatch: false,
      licenseStatus: null,
    });

    sandbox.stub(SynapsePayHelper, 'fetchSynapsePayUser').resolves(mockSynapsepayUser);

    await refreshSanctionsScreening({ userId: user.id });

    const alertCount = await Alert.count({
      where: {
        userId: user.id,
        type: 'SMS',
        subtype: 'UPLOAD_LICENSE',
      },
    });

    expect(alertCount).to.equal(1);
  });
});
