import { expect } from 'chai';
import * as request from 'supertest';
import { DashboardActionReason, DashboardUserNote, User } from '../../../../../../src/models';
import app from '../../../../../../src/services/internal-dashboard-api';
import factory from '../../../../../factories';
import {
  clean,
  createInternalUser,
  seedDashboardAction,
  seedDashboardNotePriorities,
  validateRelationships,
  withInternalUser,
} from '../../../../../test-helpers';
import { ActionCode } from '../../../../../../src/services/internal-dashboard-api/domain/action-log';
import { NotePriorityCode } from '../../../../../../src/services/internal-dashboard-api/domain/note';

describe('POST /v2/users/:id/notes', () => {
  let userId: number;
  let req: request.Test;
  let dashboardActionReason: DashboardActionReason;

  before(() => clean());

  beforeEach(async () => {
    [{ id: userId }, { dashboardActionReason }] = await Promise.all([
      factory.create<User>('user'),
      seedDashboardAction(ActionCode.CreateUserNote),
      seedDashboardNotePriorities(),
    ]);

    req = request(app).post(`/v2/users/${userId}/notes`);
  });

  afterEach(() => clean());

  describe('Happy path', () => {
    beforeEach(() => {
      req = req
        .send({
          dashboardActionReasonId: dashboardActionReason.id,
          zendeskTicketUrl: 'zende.sk',
          note: 'This user needs some help',
          dashboardNotePriorityCode: NotePriorityCode.Default,
        })
        .expect(200);
    });

    it('responds with created note', async () => {
      const internalUser = await createInternalUser();

      const {
        body: { data },
      } = await withInternalUser(req, internalUser);

      const createdUserNote = await DashboardUserNote.findOne({ where: { userId } });

      expect(data.id).to.equal(`user-note-${createdUserNote.id}`);
      expect(data.type).to.equal('dashboard-note');
      expect(data.attributes).to.include({
        internalUserEmail: internalUser.email,
        note: 'This user needs some help',
        noteType: dashboardActionReason.reason,
        zendeskTicketUrl: 'zende.sk',
      });
      expect(data.attributes.created).to.be.a('string');
      expect(data.attributes.updated).to.be.a('string');
    });

    it('includes serialized note priority', async () => {
      const {
        body: { included },
      } = await withInternalUser(req);

      const [serializedPriority] = included;
      const { id, type } = serializedPriority;

      expect(id).to.equal('default');
      expect(type).to.equal('dashboard-note-priority');
    });

    it('includes relationships', async () => {
      const { body } = await withInternalUser(req);

      const {
        data: {
          relationships: {
            user: {
              data: { id: serializedUserId },
            },
          },
        },
      } = body;

      validateRelationships(body, { dashboardNotePriority: 'dashboard-note-priority' });
      expect(serializedUserId).to.equal(`${userId}`);
    });
  });

  it('Throws if note and url both not present', async () => {
    req = req
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        dashboardNotePriorityCode: NotePriorityCode.Default,
      })
      .expect(400);

    const response = await withInternalUser(req);

    expect(response.body.message).to.contain('Reference url or note must be present.');
  });

  it('Throws if priority code is not recognized', async () => {
    req = req
      .send({
        dashboardActionReasonId: dashboardActionReason.id,
        dashboardNotePriorityCode: 'something-else',
        note: 'Blah',
      })
      .expect(400);

    const response = await withInternalUser(req);

    expect(response.body.message).to.contain('Invalid note priority.');
  });
});
