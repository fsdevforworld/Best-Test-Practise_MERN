import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as request from 'supertest';
import {
  AdminComment,
  DashboardActionLog,
  DashboardActionReason,
  DashboardNotePriority,
  DashboardUserNote,
  InternalUser,
  User,
} from '../../../../../../src/models';
import { serializeDate } from '../../../../../../src/serialization';
import app from '../../../../../../src/services/internal-dashboard-api';
import { NotePriorityCode } from '../../../../../../src/services/internal-dashboard-api/domain/note';
import factory from '../../../../../factories';
import { clean, seedDashboardNotePriorities, withInternalUser } from '../../../../../test-helpers';
import { INotePriorityResource } from '../../../../../../src/services/internal-dashboard-api/serializers/note';

describe('GET /v2/users/:id/notes', () => {
  let userId: number;
  let req: request.Test;

  before(() => clean());

  beforeEach(async () => {
    [{ id: userId }] = await Promise.all([
      factory.create<User>('user'),
      seedDashboardNotePriorities(),
    ]);

    req = request(app)
      .get(`/v2/users/${userId}/notes`)
      .expect(200);
  });

  afterEach(() => clean());

  it('responds with all notes for a user', async () => {
    await Promise.all([
      factory.create('admin-comment', { userId }),
      factory.create('dashboard-user-note', { userId }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(2);
  });

  it('includes all note priorities for the result set', async () => {
    const [includedPriority] = await Promise.all([
      factory.create<DashboardNotePriority>('dashboard-note-priority', { code: 'include-me' }),
      factory.create('dashboard-note-priority', { code: 'not-me' }),
      factory.create('dashboard-note-priority', { code: 'me-neither' }),
    ]);

    await Promise.all([
      factory.create('admin-comment', { userId, isHighPriority: true }),
      factory.create('dashboard-user-note', {
        userId,
        dashboardNotePriorityCode: includedPriority.code,
      }),
    ]);

    const {
      body: { included },
    } = await withInternalUser(req);

    expect(included).to.have.length(2);
    expect(included.map(({ id }: INotePriorityResource) => id)).to.deep.equal([
      NotePriorityCode.High, // the admin comment
      includedPriority.code,
    ]);
  });

  it('does not include deleted notes', async () => {
    await Promise.all([
      factory.create('admin-comment', { userId, deleted: moment() }),
      factory.create('dashboard-user-note', { userId, deleted: moment() }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(0);
  });

  it('responds with an empty array if there are no notes for the user', async () => {
    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.length).to.equal(0);
  });

  it('orders notes by created DESC', async () => {
    const [fourth, first, third, second] = await Promise.all([
      factory.create<AdminComment>('admin-comment', {
        userId,
        isHighPriority: false,
        created: moment().subtract(3, 'second'),
      }),
      factory.create<DashboardUserNote>('dashboard-user-note', {
        userId,
        dashboardNotePriorityCode: NotePriorityCode.Default,
        created: moment(),
      }),
      factory.create<DashboardUserNote>('dashboard-user-note', {
        userId,
        dashboardNotePriorityCode: NotePriorityCode.High,
        created: moment().subtract(2, 'second'),
      }),
      factory.create<AdminComment>('admin-comment', {
        userId,
        isHighPriority: true,
        created: moment().subtract(1, 'second'),
      }),
    ]);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(4);

    expect(data[0].id).to.include(first.id);
    expect(data[1].id).to.include(second.id);
    expect(data[2].id).to.include(third.id);
    expect(data[3].id).to.include(fourth.id);
  });

  it('includes serialized admin_comment data', async () => {
    const created = moment();

    const internalUser = await factory.create<InternalUser>('internal-user', {
      email: 'person@dave.com',
    });

    const [adminComment, highPriority] = await Promise.all([
      factory.create<AdminComment>('admin-comment', {
        created,
        userId,
        authorId: internalUser.id,
        isHighPriority: true,
        message: 'Bleep bloop, user was naughty',
      }),
      DashboardNotePriority.findByPk(NotePriorityCode.High),
    ]);

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    expect(res).to.deep.equal({
      id: `admin-comment-${adminComment.id}`,
      type: 'dashboard-note',
      attributes: {
        created: serializeDate(created),
        internalUserEmail: 'person@dave.com',
        note: 'Bleep bloop, user was naughty',
        noteType: 'Account note',
        updated: null,
        zendeskTicketUrl: null,
      },
      relationships: {
        user: { data: { id: `${userId}`, type: 'user' } },
        dashboardNotePriority: {
          data: {
            id: `${highPriority.code}`,
            type: 'dashboard-note-priority',
          },
        },
      },
    });
  });

  it('includes serialized user_note data', async () => {
    const [internalUser, dashboardActionReason, notePriority] = await Promise.all([
      factory.create<InternalUser>('internal-user', {
        email: 'hal-9000@dave.com',
      }),
      factory.create<DashboardActionReason>('dashboard-action-reason', {
        reason: 'Rebellious AI note',
      }),
      factory.create<DashboardNotePriority>('dashboard-note-priority', {
        code: 'pretty-serious',
        ranking: 9000,
        displayName: 'Run!',
      }),
    ]);

    const dashboardActionLog = await factory.create<DashboardActionLog>('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
      note: "I can't let you do that, Dave",
      zendeskTicketUrl: 'in space',
    });

    const userNote = await factory.create<DashboardUserNote>('dashboard-user-note', {
      userId,
      dashboardActionLogId: dashboardActionLog.id,
      dashboardNotePriorityCode: notePriority.code,
    });

    await userNote.reload();

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    expect(res).to.deep.equal({
      id: `user-note-${userNote.id}`,
      type: 'dashboard-note',
      attributes: {
        created: serializeDate(userNote.created),
        internalUserEmail: 'hal-9000@dave.com',
        note: "I can't let you do that, Dave",
        noteType: 'Rebellious AI note',
        updated: serializeDate(userNote.updated),
        zendeskTicketUrl: 'in space',
      },
      relationships: {
        user: { data: { id: `${userId}`, type: 'user' } },
        dashboardNotePriority: {
          data: {
            id: 'pretty-serious',
            type: 'dashboard-note-priority',
          },
        },
      },
    });
  });

  it('handles note with a deleted author', async () => {
    const internalUser = await factory.create<InternalUser>('internal-user', {
      email: 'person@dave.com',
      deleted: moment(),
    });

    await factory.create<AdminComment>('admin-comment', {
      created: moment(),
      userId,
      authorId: internalUser.id,
      isHighPriority: true,
      message: 'random message',
    });

    const {
      body: {
        data: [res],
      },
    } = await withInternalUser(req);

    expect(res.attributes.internalUserEmail).to.equal(internalUser.email);
  });
});
