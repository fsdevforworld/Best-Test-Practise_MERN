import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { createLinkItemToken } from '../../src/lib/plaid';
import { User } from '../../src/models';
import { clean, replayHttp } from '../test-helpers';
import factory from '../../test/factories';

describe('Plaid', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('createLinkItemToken', async () => {
    const webhook = 'https://staging.trydave.com/v1/bank/plaid_webhook';

    it(
      'should successfully create a link token',
      replayHttp('lib/plaid/link-token-success.json', async () => {
        const id = 123;
        await factory.create<User>('user', {
          id,
          phoneNumber: '+14155550123',
          firstName: 'Jeffrey',
          lastName: 'Jeff',
          created: moment('2020-01-01T00:00:00Z'),
        });

        const user = await User.findByPk(id);

        const linkToken = await createLinkItemToken({
          user,
          webhook,
        });

        expect(linkToken).to.be.match(/^link-sandbox/);
      }),
    );
  });
});
