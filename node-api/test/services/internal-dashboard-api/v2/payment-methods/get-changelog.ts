import { expect } from 'chai';
import * as request from 'supertest';
import { DashboardPaymentMethodModification } from '../../../../../src/models';
import { serializeDate } from '../../../../../src/serialization';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { clean, withInternalUser } from '../../../../test-helpers';
import { IChangelogEntryResource } from '../../serializers/changelog';

describe('GET /v2/payment-methods/:id/changelog', () => {
  before(() => clean());

  afterEach(() => clean());

  it('responds with all modifications for a given payment method', async () => {
    const paymentMethodUniversalId = 'BANK:1234';

    const [mod1, mod2, unrelatedMod] = await Promise.all([
      factory.create<DashboardPaymentMethodModification>('dashboard-payment-method-modification', {
        paymentMethodUniversalId,
      }),
      factory.create<DashboardPaymentMethodModification>('dashboard-payment-method-modification', {
        paymentMethodUniversalId,
      }),
      factory.create<DashboardPaymentMethodModification>('dashboard-payment-method-modification', {
        paymentMethodUniversalId: 'some-other-id',
      }),
    ]);

    const req = request(app)
      .get(`/v2/payment-methods/${paymentMethodUniversalId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data).to.have.length(2);

    const changelogResIds = data.map(({ id }: IChangelogEntryResource) => id);
    expect(changelogResIds).to.include(`payment-method-mod-${mod1.id}`);
    expect(changelogResIds).to.include(`payment-method-mod-${mod2.id}`);
    expect(changelogResIds).not.to.include(`payment-method-mod-${unrelatedMod.id}`);
  });

  it('responds with serialized changelog data', async () => {
    const paymentMethodUniversalId = 'BANK:1234';

    const dashboardAction = await factory.create('dashboard-action', {
      name: 'Delete payment method',
    });
    const dashboardActionReason = await factory.create('dashboard-action-reason', {
      dashboardActionId: dashboardAction.id,
      reason: 'User request',
    });
    const internalUser = await factory.create('internal-user', { email: 'dev@dave.com' });
    const dashboardActionLog = await factory.create('dashboard-action-log', {
      dashboardActionReasonId: dashboardActionReason.id,
      internalUserId: internalUser.id,
      note: 'how is babby formed',
      zendeskTicketUrl: 'Yahoo! answers',
    });

    const { id } = await factory.create<DashboardPaymentMethodModification>(
      'dashboard-payment-method-modification',
      {
        paymentMethodUniversalId,
        dashboardActionLogId: dashboardActionLog.id,
      },
    );

    const req = request(app)
      .get(`/v2/payment-methods/${paymentMethodUniversalId}/changelog`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    const [response] = data;

    const { created } = await DashboardPaymentMethodModification.findByPk(id);

    const details = [
      {
        type: 'action-log',
        attributes: {
          reason: 'User request',
          internalUserEmail: 'dev@dave.com',
          created: serializeDate(dashboardActionLog.created),
          note: 'how is babby formed',
          zendeskTicketUrl: 'Yahoo! answers',
        },
      },
    ];

    expect(response.id).to.equal(`payment-method-mod-${id}`);
    expect(response.type).to.equal('changelog-entry');
    expect(response.attributes).to.deep.equal({
      title: 'Delete payment method',
      initiator: 'agent',
      occurredAt: serializeDate(created),
      details,
    });
  });
});
