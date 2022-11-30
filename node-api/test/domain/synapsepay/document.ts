import { expect } from 'chai';
import * as sinon from 'sinon';
import { NonFunctionKeys } from 'utility-types';
import { BaseDocumentUpdate, DehydratedUser, UpdateUserPayload } from 'synapsepay';
import factory from '../../factories';
import { clean, up } from '../../test-helpers';
import { insertRandomExpenseTransactions } from '../../../bin/dev-seed/utils';
import SynapsepayDocumentLib, {
  handleSynapsePayDocumentUpdate,
} from '../../../src/domain/synapsepay/document';
import SynapsepayNodeLib from '../../../src/domain/synapsepay/node';
import { updateSynapseNodeId } from '../../../src/domain/synapsepay/nodeupdate';
import {
  deleteSynapsePayUser,
  fetchSynapsePayUser,
  upsertSynapsePayUser,
} from '../../../src/domain/synapsepay/user';
import { verifyUserIdentity } from '../../../src/helper/user';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import { BaseApiError, NotSupportedError } from '../../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import plaidClient from '../../../src/lib/plaid';
import { BankAccount, FraudAlert, SynapsepayDocument, User } from '../../../src/models';
import {
  FraudAlertReason,
  SynapsepayDocumentLicenseStatus,
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
} from '../../../src/typings';
import { snakeCase } from 'change-case';
import { BankingDataSource } from '@dave-inc/wire-typings';
import stubBankTransactionClient from '../../test-helpers/stub-bank-transaction-client';
import * as SynapsepayModels from '../../../src/domain/synapsepay/external-model-definitions';
import AccountManagement, {
  BatchAccountActionsError,
} from '../../../src/domain/account-management';

describe('SynapsePay client tests', () => {
  const sandbox = sinon.createSandbox();

  const TEST_REMOTE = process.env.TEST_REMOTE === 'true';

  if (TEST_REMOTE) {
    before(async () => {
      await clean();
      stubBankTransactionClient(sandbox);
      await up();
    });

    afterEach(() => clean(sandbox));

    it('created synapsepay user and node successfully using just the first/last name and email', async () => {
      let user = await factory.create(
        'user',
        { firstName: 'Noemail', lastName: 'Test', synapsepayId: null },
        { hasSession: true },
      );
      let bankAccount: BankAccount = await factory.create('checking-account', {
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
            mask: '1234',
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
              routing: '322271627',
              account: '892211053',
            },
          ],
        },
      };
      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      await upsertSynapsePayUser(user, '127.0.0.1', {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      expect(synapseNodeId.length).to.equal(24);
      bankAccount = await BankAccount.findByPk(bankAccount.id);
      expect(bankAccount.accountNumberAes256).to.not.equal(null);

      const synapsePayUser = await fetchSynapsePayUser(user);
      expect(synapsePayUser.json.permission).to.be.equal('SEND-AND-RECEIVE');
      const synapseNode = await SynapsepayNodeLib.getSynapsePayNode(user, bankAccount);
      expect(synapseNode.json.allowed).to.be.equal('CREDIT-AND-DEBIT');
      user = await User.findByPk(user.id);
      await verifyUserIdentity(user, {
        isAdmin: false,
        auditLog: false,
      });
    }).timeout(30000);

    it('should create a synapsepay user and delete it successfully', async () => {
      const user = await factory.create('user', {
        firstName: 'Noemail',
        lastName: 'Test',
        synapsepayId: null,
      });

      await upsertSynapsePayUser(user, '127.0.0.1', {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      const synapsePayUser = await fetchSynapsePayUser(user);
      expect(synapsePayUser.json.permission).to.be.equal('UNVERIFIED');
      expect(user.synapsepayId).to.not.equal(null);
      // const synapsepayId = user.synapsepayId;

      await deleteSynapsePayUser(user);
      expect(user.synapsepayId).to.equal(null);

      // WARNING: This last bit of the test works in theory, but
      // SynapsePay doesn't return consistent results when called
      // immediately. Ideally, this test would run.

      // const dummyUser = User.build({ id: user.id, synapsepayId });
      // const synapsePayUser2 = await SynapsepayNodeLib.fetchSynapsePayUser(dummyUser);
      // expect(synapsePayUser2.json.permission).to.be.equal(DELETE_USER_PERMISSION);
    }).timeout(30000);

    it('should quietly do nothing when deleting a non-existant synapsepay id', async () => {
      const user = User.build({ synapsepayId: null });
      return deleteSynapsePayUser(user).should.eventually.be.fulfilled;
    });

    it('should quietly do nothing when deleting a bogus synapsepay id', async () => {
      const user = User.build({ synapsepayId: "I'm a bogus synapsepay id" });
      return deleteSynapsePayUser(user).should.eventually.be.fulfilled;
    }).timeout(30000);

    it('created synapsepay node successfully', async () => {
      sandbox.stub(plaidClient, 'getAuth').resolves({
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1111',
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
              account_id: 'external_account_410',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      });

      const userId = 1;
      const bankAccountId = 410;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';
      const bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      // get the user again so that we have synapsepay id
      user = await User.findByPk(userId);
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      expect(synapseNodeId.length).to.equal(24);
    }).timeout(30000);

    it('created synapsepay node successfully using getAuth', async () => {
      const plaidGetAuthResponse = {
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1234',
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
              account_id: 'external_account_410',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      };
      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      const userId = 1;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      // this bank account is missing account/routing
      const bankAccountId = 410;
      let bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      expect(synapseNodeId.length).to.equal(24);

      bankAccount = await BankAccount.findByPk(bankAccountId);
      expect(bankAccount.accountNumberAes256).to.not.equal(null);
    }).timeout(30000);

    it('error creating synapsepay node with getAuth error', async () => {
      // here getAuth doesn't return bank account/routing.
      const plaidGetAuthResponse: any = {
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1234',
            name: 'Plaid Account',
            balances: {
              current: 100,
              available: 200,
            },
            type: 'depository',
            subtype: 'checking',
          },
        ],
        numbers: { ach: [] },
      };
      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      const userId = 1;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      // this bank account is missing account/routing
      const bankAccountId = 410;
      const bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount).catch(err => {
        expect(err).to.be.an.instanceOf(BaseApiError);
        expect(err.message).to.match(/The bank account you added isn't working./);
      });
    }).timeout(30000);

    it('error creating synapsepay node with getAuth invalid account/routing', async () => {
      // here the externalId of the getAuth doesn't match the bank account.
      const plaidGetAuthResponse = {
        accounts: [
          {
            account_id: 'external_account',
            mask: '1234',
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
              account_id: 'external_account',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      };
      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      const userId = 1;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      // this bank account is missing account/routing
      const bankAccountId = 410;
      const bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount).catch(err => {
        expect(err).to.be.an.instanceOf(BaseApiError);
        expect(err.message).to.match(/The bank account you added isn't working./);
      });
    }).timeout(30000);

    it('error creating synapsepay node without bank transaction', async () => {
      const plaidGetAuthResponse = {
        accounts: [
          {
            account_id: 'external_account_1800',
            mask: '1234',
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
              account_id: 'external_account_1800',
              routing: '056008850',
              account: '12345678901234',
            },
          ],
        },
      };
      sandbox.stub(plaidClient, 'getAuth').resolves(plaidGetAuthResponse);

      const userId = 1;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      // This bank account doesn't have any transactions
      const bankAccountId = 1800;
      const bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount).catch(err => {
        expect(err).to.be.an.instanceOf(NotSupportedError);
        expect(err.message).to.match(/The bank account you added doesn't have enough transactions/);
      });
    }).timeout(30000);

    it('created synapsepay advance payment', async () => {
      sandbox.stub(plaidClient, 'getAuth').resolves({
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1111',
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
              account_id: 'external_account_410',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      });
      const userId = 1;
      const bankAccountId = 410;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      let bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      bankAccount = await BankAccount.findByPk(bankAccountId);

      const amount = 25;
      const advance = { id: 1 };
      const referenceId = `${userId}-${advance.id}-${moment().unix()}`;
      const ret = await SynapsepayNodeLib.disburse(bankAccount.synapseNodeId, referenceId, amount);
      expect(ret._id).to.be.a('string');
      expect(ret.recent_status.status).to.equal('-1');
    }).timeout(30000);

    it('created synapsepay advance payback', async () => {
      sandbox.stub(plaidClient, 'getAuth').resolves({
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1111',
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
              account_id: 'external_account_410',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      });
      const userId = 1;
      const bankAccountId = 410;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      let bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user.toJSON() };
      delete fields.id;
      fields.birthdate = user.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      bankAccount = await BankAccount.findByPk(bankAccountId);

      const amount = 25;
      const ret = await SynapsepayNodeLib.charge(user, bankAccount, amount, `Advance ID: 1`);
      expect(ret.id).to.be.a('string');
      expect(ret.status).to.equal('PENDING');
    }).timeout(30000);

    it('deleted synapsepay node successfully', async () => {
      sandbox.stub(plaidClient, 'getAuth').resolves({
        accounts: [
          {
            account_id: 'external_account_410',
            mask: '1111',
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
              account_id: 'external_account_410',
              routing: '056008849',
              account: '12345678901234',
            },
          ],
        },
      });
      const userId = 1;
      const bankAccountId = 410;
      let user = await User.findByPk(userId);
      user.ssn = '606111111';

      let bankAccount = await BankAccount.findByPk(bankAccountId);

      const fields: any = { ...user };
      fields.birthdate = fields.birthdate.format('YYYY-MM-DD');
      await upsertSynapsePayUser(user, '127.0.0.1', fields);

      user = await User.findByPk(userId);
      const synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId });
      bankAccount = await BankAccount.findByPk(bankAccountId);

      await SynapsepayNodeLib.deleteSynapsePayNode(user, bankAccount);
      await bankAccount.update({ synapseNodeId: null });

      bankAccount = await BankAccount.findByPk(bankAccountId);
      expect(bankAccount.synapseNodeId).to.equal(null);
    }).timeout(30000);
  }

  describe('updateSynapsePayDocument', () => {
    before(() => clean());

    afterEach(() => clean(sandbox));

    it('should return null if no doc exists', async () => {
      const user = await factory.create('user');
      await expect(SynapsepayDocumentLib.updateSynapsePayDocument(user.id, user)).to.be.fulfilled;
    });

    it('should set updated if does exist', async () => {
      const update: any = {
        documents: [],
        permission: 'UNVERIFIED',
      };
      const user = await factory.create('user');
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        updated: moment().subtract(10, 'days'),
      });
      await SynapsepayDocumentLib.updateSynapsePayDocument(user.id, update);
      await doc.reload();
      expect(doc.updated.toDate()).to.be.gte(
        moment()
          .subtract(2, 'second')
          .toDate(),
      );
    });

    it('should be a 409 (not a 500!) if synapse fails in a delete', async () => {
      const user = await factory.create('user', {
        firstName: 'Noemail',
        lastName: 'Test',
        phoneNumber: '+19493308004',
        synapsepayId: null,
      });

      sandbox.stub(SynapsepayModels.users, 'createAsync').resolves({
        json: {
          _id: '605bf168f8db935f997b55f7',
          _links: {
            self: {
              href: 'https://uat-api.synapsefi.com/v3.1/users/605bf6ea84f2d02d6c5dd610',
            },
          },
          account_closure_date: null,
          client: { id: 'some-random-id', name: 'Dave Sandbox KYC 2.0' },
          documents: [
            {
              entity_scope: 'Not Known',
              entity_type: 'NOT_KNOWN',
              id: 'd178ef62e3ae3f14fc652509e09be34fddf455fcc70514b26c33f9c68fe01518',
              id_score: null,
              is_active: true,
              name: 'Noemail Test',
              permission_scope: 'UNVERIFIED',
              physical_docs: [],
              required_edd_docs: [],
              social_docs: [
                {
                  document_type: 'PHONE_NUMBER',
                  id: '18784fb9e8c910dd407e49c5b6ffc703689bffcd98eef4e1187907f6781c01af',
                  last_updated: 1616640937141,
                  status: 'SUBMITTED|REVIEWING',
                },
                {
                  document_type: 'EMAIL',
                  id: '0986a1d95cdc7878c3d6f88901b14e3c9b0b379d8e7cb1cd20e13f28ecdce427',
                  last_updated: 1616640937130,
                  status: 'SUBMITTED|REVIEWING',
                },
                {
                  document_type: 'IP',
                  id: 'c268f09207991fe338f28970d57e7e27e36b4611d8acd36dcc46c0541f18a1fc',
                  last_updated: 1616640937161,
                  status: 'SUBMITTED|REVIEWING',
                },
              ],
              virtual_docs: [],
              watchlists: 'PENDING',
            },
          ],
          emails: [],
          extra: {
            cip_tag: 1,
            date_joined: 1616638311023,
            extra_security: false,
            is_business: false,
            is_trusted: false,
            last_updated: 1616638311023,
            public_note: null,
            supp_id: 1,
          },
          flag: 'NOT-FLAGGED',
          flag_code: null,
          is_hidden: false,
          legal_names: ['Noemail Test'],
          logins: [{ email: '+19493308004', scope: 'READ_AND_WRITE' }],
          permission: 'UNVERIFIED',
          permission_code: null,
          phone_numbers: ['+19493308004'],
          photos: [],
          refresh_token: 'refresh_NJqIvW46e3MPscy1YLDtAE9XwTard0lH0kzx5Qow',
          watchlists: 'PENDING',
        },
      });

      await upsertSynapsePayUser(user, '127.0.0.1', {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });

      sandbox.stub(SynapsepayModels.users, 'getAsync').rejects({ error: { statusCode: 500 } });

      const removalPromise = AccountManagement.removeUserAccountById({
        userId: user.id,
        reason: 'a reason',
      });

      await expect(removalPromise).to.eventually.be.rejectedWith(
        BatchAccountActionsError,
        '[BATCH-ACTION-ERRORS:(failed_actions:deleteSynapsePayUser)] deleteSynapsePayUser (account-action:remove)',
      );
    });

    it('should set permission to CLOSED', async () => {
      const update: any = {
        documents: [],
        permission: 'CLOSED',
      };
      const user = await factory.create('user');
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        updated: moment().subtract(10, 'days'),
      });
      await SynapsepayDocumentLib.updateSynapsePayDocument(user.id, update);
      await doc.reload();
      expect(doc.permission).to.equal(update.permission);
    });

    it('should update document ssn and license status without patch data', async () => {
      const user = await factory.create('user', { phoneNumber: '+19998887777' });
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        licenseStatus: null,
        ssnStatus: null,
      });
      expect(doc.licenseStatus).to.be.null;
      expect(doc.ssnStatus).to.be.null;
      const synapseUpdate: any = {
        documents: [
          {
            virtual_docs: [{ document_type: 'SSN', status: 'SUBMITTED|REVIEWING' }],
            physical_docs: [{ document_type: 'GOVT_ID', status: 'SUBMITTED|VALID' }],
          },
        ],
        permission: 'SEND-AND-RECEIVE',
      };

      await SynapsepayDocumentLib.updateSynapsePayDocument(user.id, synapseUpdate);
      await doc.reload();
      expect(doc.permission).to.equal(SynapsepayDocumentPermission.SendAndReceive);
      expect(doc.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Reviewing);
      expect(doc.licenseStatus).to.equal(SynapsepayDocumentLicenseStatus.Valid);
    });

    it('should update id_score without patch data', async () => {
      const user = await factory.create('user', { phoneNumber: '+19998887777' });
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        idScore: null,
      });
      expect(doc.idScore).to.be.null;
      const synapseUpdate: any = {
        documents: [
          {
            id_score: '0.5',
          },
        ],
      };

      await SynapsepayDocumentLib.updateSynapsePayDocument(user.id, synapseUpdate);
      await doc.reload();
      expect(doc.idScore).to.equal(0.5);
    });

    const synapseUserPropertyTests: Array<{
      field: NonFunctionKeys<SynapsepayDocument>;
      original: any;
      updated: any;
    }> = [
      { field: 'permissionCode', original: null, updated: 'DUPLICATE_ACCOUNT' },
      { field: 'watchlists', original: 'PENDING', updated: 'MATCH' },
      { field: 'flag', original: 'NOT-FLAGGED', updated: 'FLAGGED' },
      { field: 'flagCode', original: 'NOT-FLAGGED', updated: 'ACCOUNT_CLOSURE|HIGH_RISK' },
      {
        field: 'extra',
        original: {
          cip_tag: 1,
          date_joined: 1498288029784,
          is_business: false,
          is_trusted: true,
          last_updated: 1498288034864,
          note: null,
          public_note: null,
          supp_id: '122eddfgbeafrfvbbb',
        },
        updated: {
          cip_tag: 1,
          date_joined: 1498288029784,
          is_business: false,
          is_trusted: true,
          last_updated: 1498288034864,
          note: 'Some new note is now here',
          public_note: 'Paras was here',
          supp_id: '122eddfgbeafrfvbbb',
        },
      },
    ];

    synapseUserPropertyTests.forEach(({ field, original, updated }) => {
      it(`handles updates to ${field}`, async () => {
        const dbDoc = await factory.create<SynapsepayDocument>('synapsepay-document', {
          [field]: original,
        });

        expect(dbDoc[field]).to.deep.equal(original, 'orginal value not set in db');

        const dehydratedUser = await factory.create<DehydratedUser>('dehydrated-synapsepay-user', {
          [snakeCase(field)]: updated,
        });

        await SynapsepayDocumentLib.updateSynapsePayDocument(dbDoc.userId, dehydratedUser);
        await dbDoc.reload();

        expect(dbDoc[field]).to.deep.equal(updated);
      });
    });

    it('should update document when patch data passed in', async () => {
      const user = await factory.create('user');
      const doc = await factory.create<SynapsepayDocument>('synapsepay-document', {
        userId: user.id,
        licenseStatus: null,
        ssnStatus: null,
      });
      expect(doc.licenseStatus).to.be.null;
      expect(doc.ssnStatus).to.be.null;

      const newName = 'Awkafina';
      const newPhoneNumber = '+19998887777';
      const newStreet = '123 STREET';
      const newCity = 'LOS ANGELES';
      const newState = 'CA';
      const newZipCode = '90019';
      const countryCode = 'US';
      const newEmail = 'newEmail@gmail.com';
      const newDay = '31';
      const newMonth = '12';
      const newYear = '1959';
      const synapseUpdate: any = {
        documents: [
          {
            virtual_docs: [{ document_type: 'SSN', status: 'SUBMITTED|REVIEWING' }],
            physical_docs: [{ document_type: 'GOVT_ID', status: 'SUBMITTED|VALID' }],
          },
        ],
        permission: 'SEND-AND-RECEIVE',
      };
      const partialDoc: BaseDocumentUpdate = {
        id: doc.synapsepayDocId,
        phone_number: newPhoneNumber,
        address_street: newStreet,
        address_city: newCity,
        address_subdivision: newState,
        address_postal_code: newZipCode,
        address_country_code: countryCode,
        email: newEmail,
        name: newName,
        day: parseInt(newDay, 10),
        month: parseInt(newMonth, 10),
        year: parseInt(newYear, 10),
      };
      const patchUpdate: UpdateUserPayload = {
        documents: [partialDoc],
      };

      await SynapsepayDocumentLib.updateSynapsePayDocument(user.id, synapseUpdate, patchUpdate);
      await doc.reload();
      expect(doc.permission).to.equal(SynapsepayDocumentPermission.SendAndReceive);
      expect(doc.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Reviewing);
      expect(doc.licenseStatus).to.equal(SynapsepayDocumentLicenseStatus.Valid);
      expect(doc.phoneNumber).to.equal(newPhoneNumber);
      expect(doc.addressStreet).to.equal(newStreet);
      expect(doc.addressCity).to.equal(newCity);
      expect(doc.addressSubdivision).to.equal(newState);
      expect(doc.addressPostalCode).to.equal(newZipCode);
      expect(doc.email).to.equal(newEmail);
      expect(doc.name).to.equal(newName);
      expect(doc.day).to.equal(newDay);
      expect(doc.month).to.equal(newMonth);
      expect(doc.year).to.equal(newYear);
    });
  });

  describe('handleSynapsePayDocumentUpdate', () => {
    let user: User;
    let datadogStub: sinon.SinonStub;
    let consoleStub: sinon.SinonStub;
    const synapseUpdate: any = {
      documents: [
        {
          virtual_docs: [{ document_type: 'SSN', status: 'SUBMITTED|INVALID|BLACKLIST' }],
        },
      ],
    };
    before(() => clean());

    beforeEach(async () => {
      user = await factory.create('user');
      datadogStub = sandbox.stub(dogstatsd, 'increment');
      consoleStub = sandbox.stub(console, 'log');
    });

    afterEach(() => clean(sandbox));

    //TODO: unskip this test once Synpase blacklist bug is resolved
    it.skip('should update ssn_status and create fraud alert when status is blacklist', async () => {
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        ssnStatus: null,
      });
      await handleSynapsePayDocumentUpdate(user.id, synapseUpdate);
      const [fraudAlert] = await Promise.all([
        FraudAlert.findOne({ where: { userId: user.id } }),
        doc.reload(),
      ]);
      expect(doc.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Blacklist);
      expect(datadogStub).to.have.callCount(1);
      expect(consoleStub).to.have.callCount(1);
      expect(fraudAlert.reason).to.equal(FraudAlertReason.BlacklistSsn);
    });

    //TODO: delete this test once Synpase blacklist bug is resolved
    it('should update ssn_status and NOT create fraud alert when status is blacklist', async () => {
      const doc = await factory.create('synapsepay-document', {
        userId: user.id,
        ssnStatus: null,
      });
      await handleSynapsePayDocumentUpdate(user.id, synapseUpdate);
      const [fraudAlert] = await Promise.all([
        FraudAlert.findOne({ where: { userId: user.id } }),
        doc.reload(),
      ]);
      expect(doc.ssnStatus).to.equal(SynapsepayDocumentSSNStatus.Blacklist);
      expect(datadogStub).to.have.callCount(1);
      expect(fraudAlert).not.to.exist;
    });

    it('should not create a blacklist ssn fraud alert for user if one already exists', async () => {
      await FraudAlert.createFromUserAndReason(user, FraudAlertReason.BlacklistSsn);
      await handleSynapsePayDocumentUpdate(user.id, synapseUpdate);
      expect(datadogStub).to.have.callCount(0);
      expect(consoleStub).to.have.callCount(0);
    });
  });
  describe('updateSynapseNodeId', () => {
    after(() => clean(sandbox));

    it('should handle synapse node errors', async () => {
      const synapseId = 'bacon';
      const bankAccount = await factory.create('checking-account');
      const user = await User.findByPk(bankAccount.userId);
      const nodeStubs = sandbox
        .stub(SynapsepayNodeLib, 'createSynapsePayNode')
        .onFirstCall()
        .rejects({
          response: {
            text: 'Platform not allowed to add any more nodes',
          },
        })
        .onSecondCall()
        .resolves(synapseId);
      try {
        sandbox.stub(SynapsepayNodeLib, 'getAllSynapsePayNodes').resolves([]);
        await updateSynapseNodeId(bankAccount, user, 'oh-im-just-a-little-ip');
        expect(bankAccount.synapseNodeId).to.equal(synapseId);
      } finally {
        nodeStubs.restore();
      }
    });

    it('should ignore bank of dave users', async () => {
      const bankAccount = await factory.create('checking-account');
      const connection = await bankAccount.getBankConnection();
      await connection.update({ bankingDataSource: BankingDataSource.BankOfDave });
      const user = await User.findByPk(bankAccount.userId);
      const spy = sandbox.spy(SynapsepayNodeLib, 'createSynapsePayNode');
      await updateSynapseNodeId(bankAccount, user, 'oh-im-just-a-little-ip');
      expect(spy.callCount).to.equal(0);
    });
  });
});
