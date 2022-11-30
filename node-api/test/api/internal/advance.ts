import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import app from '../../../src/api';
import { getCacheKey, userAdvanceApprovalStatusCache } from '../../../src/api/internal/advance';
import { BankAccount, BankConnection, User } from '../../../src/models';
import { AdvanceApprovalTrigger } from '../../../src/services/advance-approval/types';
import factory from '../../factories';
import { clean, stubBankTransactionClient, up } from '../../test-helpers';
import { AUTH_SECRET, CLIENT_ID } from './test-constants';
import AdvanceApprovalClient from '../../../src/lib/advance-approval-client';
import { getAdvanceSummary } from '../../../src/domain/advance-approval-request';

const sandbox = sinon.createSandbox();

describe('advance', () => {
  let validBankAccount: BankAccount;
  let requestAdvancesStub: sinon.SinonStub;
  let daveBankingUser: User;

  const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString('base64')}`;

  beforeEach(async () => {
    await clean(sandbox);
    await up();
    stubBankTransactionClient(sandbox);
    daveBankingUser = await factory.create('user');
  });

  after(async () => {
    await clean(sandbox);
    await up();
  });

  describe('GET /user/:id/advance/status', () => {
    it('should return inconclusive when no non Dave banking exists', async () => {
      const { body: result } = await request(app)
        .get(`/internal/user/${daveBankingUser.id}/advance/status`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(result.status).to.be.equal('INCONCLUSIVE');
    });

    it('should return inconclusive if only a Dave checking exists', async () => {
      validBankAccount = await factory.create('bod-checking-account', {
        userId: daveBankingUser.id,
      });

      const { body: result } = await request(app)
        .get(`/internal/user/${daveBankingUser.id}/advance/status`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(result.status).to.be.equal('INCONCLUSIVE');
    });

    it('should return inconclusive if the primary account is deleted', async () => {
      validBankAccount = await factory.create<BankAccount>('checking-account', {
        userId: daveBankingUser.id,
        available: 100,
      });

      await validBankAccount.destroy();

      const { body: result } = await request(app)
        .get(`/internal/user/${daveBankingUser.id}/advance/status`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(result.status).to.be.equal('INCONCLUSIVE');
    });

    it('should return inconclusive if the bank connection is deleted', async () => {
      validBankAccount = await factory.create<BankAccount>('checking-account', {
        userId: daveBankingUser.id,
        available: 100,
      });

      await BankConnection.destroy({ where: { id: validBankAccount.bankConnectionId } });

      const { body: result } = await request(app)
        .get(`/internal/user/${daveBankingUser.id}/advance/status`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(result.status).to.be.equal('INCONCLUSIVE');
    });

    it('should return 404 when user is not found', async () => {
      await request(app)
        .get(`/internal/user/${daveBankingUser.id + 1}/advance/status`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    context('with multiple bank accounts', () => {
      beforeEach(async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([{}]);

        validBankAccount = await factory.create<BankAccount>('checking-account', {
          userId: daveBankingUser.id,
          available: 100,
        });

        await BankConnection.update(
          {
            primaryBankAccountId: validBankAccount.id,
          },
          {
            where: {
              id: validBankAccount.bankConnectionId,
            },
          },
        );
      });

      it('requestAdvances should be called with a non Dave banking account when both exist', async () => {
        await factory.create('bod-checking-account', {
          userId: daveBankingUser.id,
        });

        await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        const args = requestAdvancesStub.lastCall.args;

        expect(args[0]).to.deep.equal({
          bankAccountId: validBankAccount.id,
          advanceSummary: await getAdvanceSummary(daveBankingUser.id),
          userId: daveBankingUser.id,
          trigger: AdvanceApprovalTrigger.BankingRiskCheck,
          auditLog: false,
          userTimezone: undefined,
        });
      });

      it('requestAdvances should be called with non-primary account if primary is deleted', async () => {
        // secondary bank account on the bank account
        const secondaryBankAccount = await factory.create<BankAccount>('checking-account', {
          userId: daveBankingUser.id,
          available: 100,
          bankConnectionId: validBankAccount.bankConnectionId,
        });

        await validBankAccount.destroy();

        await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        const args = requestAdvancesStub.lastCall.args;

        expect(args[0]).to.deep.equal({
          bankAccountId: secondaryBankAccount.id,
          advanceSummary: await getAdvanceSummary(daveBankingUser.id),
          userId: daveBankingUser.id,
          trigger: AdvanceApprovalTrigger.BankingRiskCheck,
          auditLog: false,
          userTimezone: undefined,
        });
      });

      it('requestAdvances should be called with the account with a higher balance when two valid accounts exist', async () => {
        const altValidBankAccount = await factory.create<BankAccount>('checking-account', {
          userId: daveBankingUser.id,
          available: validBankAccount.available + 20,
        });

        await BankConnection.update(
          {
            primaryBankAccountId: altValidBankAccount.id,
          },
          {
            where: {
              id: altValidBankAccount.bankConnectionId,
            },
          },
        );

        await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        const args = requestAdvancesStub.lastCall.args;

        expect(args[0]).to.deep.equal({
          bankAccountId: altValidBankAccount.id,
          advanceSummary: await getAdvanceSummary(daveBankingUser.id),
          userId: daveBankingUser.id,
          trigger: AdvanceApprovalTrigger.BankingRiskCheck,
          auditLog: false,
          userTimezone: undefined,
        });
      });
    });

    context('with valid bank account', () => {
      beforeEach(async () => {
        validBankAccount = await factory.create('checking-account', {
          userId: daveBankingUser.id,
        });

        await BankConnection.update(
          {
            primaryBankAccountId: validBankAccount.id,
          },
          {
            where: {
              id: validBankAccount.bankConnectionId,
            },
          },
        );
      });

      it('should return rejected if requestAdvances returns no results', async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([]);
        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('REJECTED');
      });

      it('should return cached result if one exists', async () => {
        const expectedStatus = 'APPROVED_BIG_MONEY';

        await userAdvanceApprovalStatusCache.set(getCacheKey(daveBankingUser.id), expectedStatus);

        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal(expectedStatus);
      });

      it('should return rejected if approval status is not approved', async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([
            {
              approved: false,
            },
          ]);

        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('REJECTED');
      });

      it('should return approved with big money if over threshold', async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([
            {
              approved: true,
              approvedAmounts: [20, 25, 75],
            },
            {
              approved: true,
              approvedAmounts: [10, 15],
            },
          ]);

        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('APPROVED_BIG_MONEY');
      });

      it('should return approved with small money if under threshold', async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([
            {
              approved: true,
              approvedAmounts: [20, 10],
            },
            {
              approved: true,
              approvedAmounts: [10, 15],
            },
          ]);

        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('APPROVED_SMALL_MONEY');
      });

      it('should return cached result when called twice', async () => {
        requestAdvancesStub = sandbox
          .stub(AdvanceApprovalClient, 'createAdvanceApproval')
          .resolves([
            {
              approved: true,
              approvedAmounts: [20, 10],
            },
            {
              approved: true,
              approvedAmounts: [10, 15],
            },
          ]);

        const { body: result } = await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('APPROVED_SMALL_MONEY');

        await request(app)
          .get(`/internal/user/${daveBankingUser.id}/advance/status`)
          .set('Authorization', authHeader)
          .expect(200);

        expect(result.status).to.equal('APPROVED_SMALL_MONEY');

        expect(requestAdvancesStub.callCount).to.equal(1);
      });
    });
  });
});
