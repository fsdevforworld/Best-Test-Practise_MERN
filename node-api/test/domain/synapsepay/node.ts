import * as sinon from 'sinon';
import * as synapse from 'synapsepay';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import { getFingerprint } from '../../../src/domain/synapsepay';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import { upsertSynapsePayUser } from '../../../src/domain/synapsepay/user';
import plaidClient from '../../../src/lib/plaid';
import { insertRandomExpenseTransactions } from '../../../bin/dev-seed/utils';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import Constants from '../../../src/domain/synapsepay/constants';
import authenticationClient from '../../../src/domain/synapsepay/authentication-client';
import NodeResponseFixtures from '../../fixtures/synapse-pay/GET-node';
import { SynapsePayError } from '../../../src/lib/error';
import redisClient from '../../../src/lib/redis';
import { BankAccount, User } from '../../../src/models';
import { expect } from 'chai';
import factory from '../../factories';
import { clean, replayHttp } from '../../test-helpers';
import { helpers } from '../../../src/domain/synapsepay/external-model-definitions';
import { PaymentProviderTransactionType } from '../../../src/typings';
import * as config from 'config';

describe('SynapsePay', () => {
  const {
    disbursingUserId: daveSynapseUserId,
    disbursingNodeId,
    disbursingUserFingerprint: daveSynapseUserFingerprint,
  } = config.get('synapsepay');

  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('disburse', () => {
    afterEach(async () => {
      await redisClient.delAsync(Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY);
    });

    it(
      'sets the referenceId as the supp_id',
      replayHttp('domain/synapsepay/disburse.json', async () => {
        sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');

        const bankAccount = await factory.create('bank-account', {
          synapseNodeId: '5c64c6397b08ab8e4fe6850f',
        });

        const referenceId = 'my-test-ref-3';
        const { _id: id } = await SynapsepayNodeLib.disburse(
          bankAccount.synapseNodeId,
          referenceId,
          25,
        );

        const synapseUser = await synapse.Users.getAsync(authenticationClient, {
          _id: daveSynapseUserId,
          fingerprint: daveSynapseUserFingerprint,
          ip_address: helpers.getUserIP(),
        });

        const synapseNode = await synapse.Nodes.getAsync(synapseUser, { _id: disbursingNodeId });

        const transaction = await synapse.Transactions.getAsync(synapseNode, { _id: id });

        expect(transaction.json.extra.supp_id).to.equal(referenceId);
      }),
    );

    it(
      'caches the disbursing synapse user',
      replayHttp('domain/synapsepay/disburse.json', async () => {
        sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');

        const bankAccount = await factory.create('bank-account', {
          synapseNodeId: '5c64c6397b08ab8e4fe6850f',
        });

        const referenceId = 'my-test-ref-3';

        const redisSetSpy = sandbox.stub(redisClient, 'setAsync');

        await SynapsepayNodeLib.disburse(bankAccount.synapseNodeId, referenceId, 25);

        expect(redisSetSpy.callCount).to.equal(1);
      }),
    );

    it(
      'caches only the synapse user fields needed for calling the synapse api',
      replayHttp('domain/synapsepay/disburse.json', async () => {
        sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');

        const bankAccount = await factory.create('bank-account', {
          synapseNodeId: '5c64c6397b08ab8e4fe6850f',
        });

        const referenceId = 'my-test-ref-3';

        await SynapsepayNodeLib.disburse(bankAccount.synapseNodeId, referenceId, 25);

        const redisValue = JSON.parse(
          await redisClient.getAsync(Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY),
        );
        expect(redisValue.oauth_key).to.equal('oauth_re0AKML205841sbUSyQuEcnjFhtHOP3fToYWxRwG'); // from previous test nock
        expect(redisValue).to.haveOwnProperty('client');
        expect(redisValue).to.haveOwnProperty('oauth_key');
        expect(redisValue).to.haveOwnProperty('fingerprint');
        expect(redisValue).to.haveOwnProperty('json');
      }),
    );

    it(
      'reads the synapse dave user value from the cache if it exists',
      replayHttp('domain/synapsepay/disburse.json', async () => {
        sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');

        const bankAccount = await factory.create('bank-account', {
          synapseNodeId: '5c64c6397b08ab8e4fe6850f',
        });

        const referenceId = 'my-test-ref-3';

        const daveSynapseUser = {
          client: {
            baseUrl: 'https://uat-api.synapsefi.com/v3.1',
            client_id: config.get('synapsepay.clientId'),
            client_secret: config.get('synapsepay.clientSecret'),
            isProduction: false,
          },
          fingerprint: config.get('synapsepay.disbursingUserFingerprint'),
          ip_address: '192.168.0.124',
          json: {
            _links: {
              self: {
                href: `https://uat-api.synapsefi.com/v3.1/users/${config.get(
                  'synapsepay.disbursingUserId',
                )}`,
              },
            },
          },
          oauth_key: 'oauth_randomstring',
        };

        await redisClient.setAsync(
          Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY,
          JSON.stringify(daveSynapseUser),
        );

        const redisSetSpy = sandbox.stub(redisClient, 'setAsync');

        const result = await SynapsepayNodeLib.disburse(bankAccount.synapseNodeId, referenceId, 25);

        expect(redisSetSpy.callCount).to.equal(0);
        expect(result).to.haveOwnProperty('amount');
        expect(result).to.haveOwnProperty('from');
        expect(result).to.haveOwnProperty('recent_status');
        expect(result).to.haveOwnProperty('to');
      }),
    );

    it(
      'handles expired tokens',
      replayHttp('domain/synapsepay/disburse-after-expired-oauth.json', async () => {
        sandbox.stub(helpers, 'getUserIP').returns('192.168.0.124');

        const bankAccount = await factory.create<BankAccount>('bank-account', {
          accountNumberAes256: '1111111111111111|053000196',
          synapseNodeId: '5d95456e8d1b7d88a9b76731',
        });

        const referenceId = 'my-test-ref-3';

        const oldCachedSynapseUser = {
          client: {
            baseUrl: 'https://uat-api.synapsefi.com/v3.1',
            client_id: config.get('synapsepay.clientId'),
            client_secret: config.get('synapsepay.clientSecret'),
            isProduction: false,
          },
          fingerprint: config.get('synapsepay.disbursingUserFingerprint'),
          ip_address: '192.168.0.124',
          json: {
            _links: {
              self: {
                href: `https://uat-api.synapsefi.com/v3.1/users/${config.get(
                  'synapsepay.disbursingUserId',
                )}`,
              },
            },
          },
          oauth_key: 'oauth_invalid_or_expired_key',
        };

        await redisClient.setAsync(
          Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY,
          JSON.stringify(oldCachedSynapseUser),
        );

        const user: User = await bankAccount.getUser();
        await user.update({ synapsepayId: '5d95456c321f4870de913a8f' });

        await SynapsepayNodeLib.disburse(bankAccount.synapseNodeId, referenceId, 25);

        const newCachedSynapseUser = JSON.parse(
          await redisClient.getAsync(Constants.SYNAPSEPAY_DISBURSING_USER_CACHE_KEY),
        );

        expect(newCachedSynapseUser.oauth_key).to.not.equal(oldCachedSynapseUser.oauth_key);
      }),
    );
  });

  describe('.charge', () => {
    it('throws an error if the Node is locked', async () => {
      const user = { synapsepayId: 'bar' } as User;
      const bankAccount = { synapseNodeId: 'baz' } as BankAccount;

      sandbox.stub(synapse.Users, 'getAsync').resolves({});
      sandbox.stub(synapse.Nodes, 'getAsync').resolves(NodeResponseFixtures.locked);

      await expect(SynapsepayNodeLib.charge(user, bankAccount, 1, '')).to.be.rejectedWith(
        SynapsePayError,
        'Node is locked',
      );
    });

    context('success', () => {
      let user: User;
      let bankAccount: BankAccount;
      let synapseNode: synapse.Node;

      async function setupSynapse() {
        const ipAddress = '192.168.0.124';
        sandbox.stub(helpers, 'getUserIP').returns(ipAddress);

        user = await factory.create('user', { id: 20 });
        bankAccount = await factory.create('checking-account', { id: 2, userId: user.id });
        const fingerprint = await getFingerprint(user);
        const synapsePayUser = await synapse.Users.createAsync(
          authenticationClient,
          fingerprint,
          ipAddress,
          {
            logins: [
              {
                email: 'john.tester@dave.com',
                password: 'test1234',
              },
            ],
            phone_numbers: ['901.111.1111'],
            legal_names: ['John Tester'],
          },
        );

        [synapseNode] = await synapse.Nodes.createAsync(synapsePayUser, {
          type: 'ACH-US',
          info: {
            nickname: 'Node Library Checking Account',
            name_on_account: 'Node Library',
            account_num: '72347235423',
            routing_num: '051000017',
            type: 'PERSONAL',
            class: 'CHECKING',
          },
          extra: {
            supp_id: bankAccount.id,
          },
        });

        await synapseNode.updateAsync({ micro: [0.1, 0.1] });

        await Promise.all([
          bankAccount.update({ synapseNodeId: synapseNode.json._id }),
          user.update({ synapsepayId: synapsePayUser.json._id }),
        ]);
      }

      it(
        'allows for next day transactions',
        replayHttp('domain/synapsepay/next-day.json', async () => {
          await setupSynapse();

          const { id } = await SynapsepayNodeLib.charge(user, bankAccount, 10, 'Test', {
            isSameDay: false,
          });

          const transaction = await synapse.Transactions.getAsync(synapseNode, { _id: id });

          expect(transaction.json.extra.same_day).to.equal(false);
          expect(transaction.json.fees[0].fee).to.equal(-0.05);
        }),
      );

      it(
        'sets the referenceId as the supp_id',
        replayHttp('domain/synapsepay/charge.json', async () => {
          await setupSynapse();
          const referenceId = 'test-ref-5';
          const { id } = await SynapsepayNodeLib.charge(user, bankAccount, 10, referenceId);

          const transaction = await synapse.Transactions.getAsync(synapseNode, { _id: id });

          expect(transaction.json.extra.supp_id).to.equal(referenceId);
        }),
      );

      it(
        'uses a different node for subscription collections',
        replayHttp('domain/synapsepay/charge-subscription.json', async () => {
          await setupSynapse();
          const referenceId = 'test-ref-5';
          const synapseSpy = sandbox.spy(synapse.Transactions, 'createAsync');
          await SynapsepayNodeLib.charge(user, bankAccount, 10, referenceId, {
            transactionType: PaymentProviderTransactionType.SubscriptionPayment,
          });

          expect(synapseSpy).have.callCount(1);
          const synapsePayload: any = synapseSpy.getCall(0).args[1];
          expect(synapsePayload?.to?.type).to.equal(
            Constants.SYNAPSEPAY_SUBSCRIPTION_RECEIVING_NODE_TYPE,
          );
          expect(synapsePayload?.to?.id).to.equal(
            Constants.SYNAPSEPAY_SUBSCRIPTION_RECEIVING_NODE_ID,
          );
          expect(Constants.SYNAPSEPAY_RECEIVING_NODE_ID).to.not.equal(
            Constants.SYNAPSEPAY_SUBSCRIPTION_RECEIVING_NODE_ID,
          );
        }),
      );
    });
  });

  describe('createSynapsePayNode', () => {
    before(async () => {
      stubBankTransactionClient(sandbox);
    });

    it('should throw a SynapsePayError when failing to create a node', async () => {
      const user = await factory.create(
        'user',
        {
          firstName: 'Oreo',
          lastName: 'McFlurry',
          phoneNumber: '+19493308005',
          synapsepayId: null,
        },
        { hasSession: true },
      );

      const bankAccount: BankAccount = await factory.create('checking-account', {
        accountNumber: null,
        accountNumberAes256: null,
        userId: user.id,
        synapseNodeId: null,
      });

      await insertRandomExpenseTransactions(user.id, bankAccount.id);
      await insertRandomExpenseTransactions(user.id, bankAccount.id);
      await insertRandomExpenseTransactions(user.id, bankAccount.id);

      const plaidGetAuthResponse = {
        accounts: [
          {
            account_id: bankAccount.externalId,
            mask: '7861',
            name: 'Plaid Account',
            balances: {
              current: 100,
              available: 200,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: {
          ach: [
            {
              account_id: bankAccount.externalId,
              routing: '322271628',
              account: '892211054',
            },
          ],
        },
      };

      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      sandbox.stub(SynapsepayModels.users, 'createAsync').resolves({
        json: {
          _id: '605d3b5084f2d037dcd2c91e',
          _links: {
            self: {
              href: 'https://uat-api.synapsefi.com/v3.1/users/605d3b5084f2d037dcd2c91e',
            },
          },
          account_closure_date: null,
          client: { id: 'some-random-id', name: 'Dave Sandbox KYC 2.0' },
          documents: [
            {
              entity_scope: 'Not Known',
              entity_type: 'NOT_KNOWN',
              id: '587beaf67346c0933b19eaf4340e9cfc77ca3ae1b5c96d7a82d79cb19316a378',
              id_score: 0.9,
              is_active: true,
              name: 'Oreo McFlurry',
              permission_scope: 'UNVERIFIED',
              physical_docs: [],
              required_edd_docs: [],
              social_docs: [Array],
              virtual_docs: [],
              watchlists: 'PENDING',
            },
          ],
          emails: [],
          extra: {
            cip_tag: 1,
            date_joined: 1616722765491,
            extra_security: false,
            is_business: false,
            is_trusted: false,
            last_updated: 1616722765491,
            public_note: null,
            supp_id: 1,
          },
          flag: 'NOT-FLAGGED',
          flag_code: null,
          is_hidden: false,
          legal_names: ['Oreo McFlurry'],
          logins: [{ email: '+19493308005', scope: 'READ_AND_WRITE' }],
          permission: 'UNVERIFIED',
          permission_code: null,
          phone_numbers: ['+19493308005'],
          photos: [],
          refresh_token: 'refresh_Qzwqo0ybGRarm5ifSHeJK34DTWVxYOUh2p76Nt1v',
          watchlists: 'PENDING',
        },
      });

      await upsertSynapsePayUser(user, '127.0.0.1', {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      sandbox.stub(synapse.Users, 'getAsync').resolves();
      sandbox.stub(synapse.Nodes, 'createAsync').rejects();

      await expect(SynapsepayNodeLib.createSynapsePayNode(user, bankAccount)).to.be.rejectedWith(
        SynapsePayError,
        'Failed to create SynapsePay node',
      );
    });
  });
});
