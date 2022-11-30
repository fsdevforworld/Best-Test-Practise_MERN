import * as request from 'supertest';
import * as Bluebird from 'bluebird';
import app from '../../../../src/services/internal-dashboard-api';
import { moment } from '@dave-inc/time-lib';
import { FraudAlert } from '../../../../src/models';
import { expect } from 'chai';
import { clean, withInternalUser } from '../../../test-helpers';
import factory from '../../../factories';

describe('PATCH /dashboard/fraud_alert/:id', () => {
  before(() => clean());
  afterEach(() => clean());

  it('allows the resolved date to be set', async () => {
    const time = moment();

    const fraudAlert = await factory.create('fraud-alert');

    await withInternalUser(
      request(app)
        .patch(`/dashboard/fraud_alert/${fraudAlert.id}`)
        .send({ resolved: time.format() })
        .expect(200),
    );

    const updatedAlert = await FraudAlert.findByPk(fraudAlert.id);

    expect(updatedAlert.resolved).to.exist;
  });

  it("resets the user's fraud flag if they have no unresolved fraud alerts", async () => {
    const user = await factory.create('user', { fraud: true });
    const alert = await factory.create('fraud-alert', { userId: user.id });

    await withInternalUser(
      request(app)
        .patch(`/dashboard/fraud_alert/${alert.id}`)
        .send({ resolved: moment().format() })
        .expect(200),
    );

    await user.reload();
    expect(user.fraud).to.equal(false);
  });

  it("does not reset the user's fraud flag when there are other fraud alerts", async () => {
    const user = await factory.create('user', { fraud: true });

    const [alert] = await Bluebird.all([
      factory.create('fraud-alert', { userId: user.id }),
      factory.create('fraud-alert', { userId: user.id }),
    ]);

    await withInternalUser(
      request(app)
        .patch(`/dashboard/fraud_alert/${alert.id}`)
        .send({ resolved: moment().format() })
        .expect(200),
    );

    await user.reload();
    expect(user.fraud).to.equal(true);
  });
});
