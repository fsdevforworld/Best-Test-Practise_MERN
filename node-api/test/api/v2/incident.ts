import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../src/api';
import factory from '../../factories';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../../test-helpers';

describe('/v2/incident/*', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('GET /incident', () => {
    it('should return an array of size 2 if there are unresolved and undeleted incidents', async () => {
      const [user, internalUser] = await Promise.all([
        factory.create('user'),
        factory.create('internal-user'),
      ]);
      await factory.create('activeIncident', { isPublic: true });
      await factory.create('activeIncident', { isPublic: true });
      await factory.create('activeIncident', {
        resolvedAt: moment().format('YYYY-MM-DD'),
        resolverId: internalUser.id,
        isPublic: true,
      });

      const response = await request(app)
        .get('/v2/incident')
        .set('X-Device-Id', user.id)
        .set('Authorization', user.id);

      expect(response.body.incidents).to.be.an('array');
      expect(response.body.incidents.length).to.eq(2);
    });

    it('should return 1 active public incident and 1 that is specific to the user', async () => {
      const user = await factory.create('user');
      const differentUser = await factory.create('user');

      const activePublicIncident = await factory.create('activeIncident', { isPublic: true });
      await factory.create('resolvedIncident');
      await factory.create('deletedIncident');
      const incidentForUser = await factory.create('activeIncident');
      const incidentForDiffrentUser = await factory.create('activeIncident');

      await factory.create('user-incident', {
        incidentId: incidentForUser.id,
        userId: user.id,
      });
      await factory.create('user-incident', {
        incidentId: incidentForDiffrentUser.id,
        userId: differentUser.id,
      });

      const response = await request(app)
        .get('/v2/incident')
        .set('X-Device-Id', user.id)
        .set('Authorization', user.id);

      expect(response.body.incidents).to.be.an('array');
      expect(response.body.incidents.length).to.eq(2);
      expect(response.body.incidents[0].id).to.eq(activePublicIncident.id);
      expect(response.body.incidents[1].id).to.eq(incidentForUser.id);
    });

    it('should return only 1 incident if it switches from private to public when tied to a user', async () => {
      const user = await factory.create('user');
      const incidentForUser = await factory.create('activeIncident');

      await factory.create('user-incident', {
        incidentId: incidentForUser.id,
        userId: user.id,
      });

      incidentForUser.isPublic = true;
      await incidentForUser.save();

      const response = await request(app)
        .get('/v2/incident')
        .set('X-Device-Id', user.id)
        .set('Authorization', user.id);

      expect(response.body.incidents).to.be.an('array');
      expect(response.body.incidents.length).to.eq(1);
      expect(response.body.incidents[0].id).to.eq(incidentForUser.id);
      expect(response.body.incidents[0].isPublic).to.be.true;
    });

    it('should return an empty array if there are no unresolved and undeleted incidents', async () => {
      const user = await factory.create('user');
      const response = await request(app)
        .get('/v2/incident')
        .set('X-Device-Id', user.id)
        .set('Authorization', user.id);

      expect(response.body.incidents).to.be.an('array');
      expect(response.body.incidents).to.be.empty;
    });
  });
});
