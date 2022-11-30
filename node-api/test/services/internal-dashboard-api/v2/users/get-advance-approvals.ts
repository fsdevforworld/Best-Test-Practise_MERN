import { expect } from 'chai';
import * as request from 'supertest';
import { serializeDate } from '../../../../../src/serialization';
import { AdvanceApproval, BankAccount, User } from '../../../../../src/models';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';

describe('GET /v2/users/:id/advance-approvals', () => {
  before(() => clean());

  afterEach(() => clean());

  let userId: number;
  let bankAccountId: number;
  let req: request.Test;

  beforeEach(async () => {
    ({ id: userId } = await factory.create<User>('user'));

    const { id: bankConnectionId } = await factory.create('bank-connection', { userId });

    ({ id: bankAccountId } = await factory.create<BankAccount>('bank-account', {
      userId,
      bankConnectionId,
    }));

    req = request(app)
      .get(`/v2/users/${userId}/advance-approvals`)
      .expect(200);
  });

  it('responds with all advance approvals for a user', async () => {
    const advanceApprovals = await Promise.all([
      factory.create<AdvanceApproval>('advance-approval', { userId, bankAccountId }),
      factory.create<AdvanceApproval>('advance-approval', { userId, bankAccountId }),
      factory.create<AdvanceApproval>('advance-approval', { userId, bankAccountId }),
      factory.create<AdvanceApproval>('advance-approval', { userId: userId + 1, bankAccountId }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(
      advanceApprovals.filter(approval => approval.userId === userId).length,
    );
  });

  it('data is a list of serialized advance approvals', async () => {
    const advanceApproval = await factory.create<AdvanceApproval>('advance-approval', { userId });

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    const { created } = await advanceApproval.reload();

    expect(res.type).to.equal('advance-approval');
    expect(res.id).to.equal(`${advanceApproval.id}`);
    expect(res.attributes).to.deep.equal({
      approved: advanceApproval.approved,
      approvedAmounts: advanceApproval.approvedAmounts,
      created: serializeDate(created),
      defaultPaybackDate: serializeDate(advanceApproval.defaultPaybackDate, 'YYYY-MM-DD'),
      initiator: 'user',
    });
  });

  it('initiator is "agent" if there is a dashboard_advance_approval entry for the advance approval', async () => {
    const { id: advanceApprovalId } = await factory.create<AdvanceApproval>('advance-approval', {
      userId,
    });

    await factory.create('dashboard-advance-approval', { advanceApprovalId });

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    expect(res.attributes.initiator).to.equal('agent');
  });

  it('responds with an empty array if there are no advance approvals for the user', async () => {
    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(0);
  });
});
