import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import factory from '../../../factories';
import { UserIncident, Incident, InternalUser } from '../../../../src/models';
import { moment } from '@dave-inc/time-lib';
import { clean, createInternalUser, withInternalUser } from '../../../test-helpers';

describe('/admin/incidents/*', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('POST /admin/incidents', () => {
    context('as an admin', () => {
      let req: request.Test;
      let agent: InternalUser;
      beforeEach(async () => {
        agent = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
        req = request(app).post('/admin/incidents');
      });

      it('should create a new private incident', async () => {
        const title = 'Jeffrey';
        const description = 'Lee';

        const response = await withInternalUser(
          req.send({ title, description }).expect(200),
          agent,
        );

        const incident = await Incident.findOne({ where: { creatorId: agent.id } });
        expect(incident.title).to.eq(title);
        expect(incident.description).to.eq(description);
        expect(incident.isPublic).to.be.false;
        expect(response.body.title).to.eq(title);
        expect(response.body.description).to.eq(description);
        expect(response.body.isPublic).to.be.false;
      });

      it('should create a public new incidents', async () => {
        const title = 'Jeffrey';
        const description = 'Lee';

        const response = await withInternalUser(
          req.send({ title, description, isPublic: true }),
          agent,
        );

        const incident = await Incident.findOne({ where: { creatorId: agent.id } });
        expect(incident.title).to.eq(title);
        expect(incident.description).to.eq(description);
        expect(incident.isPublic).to.be.true;
        expect(response.body.title).to.eq(title);
        expect(response.body.description).to.eq(description);
        expect(response.body.isPublic).to.be.true;
      });

      it('should throw an invalid parameters error if the proper parameters are not passed in', async () => {
        const title = 'Jeffrey';

        const response = await withInternalUser(req.send({ title }), agent);

        expect(response.status).to.equal(400);
        expect(response.body.message).to.match(
          /Required parameters not provided: title, description/,
        );
      });

      it('should throw an already exists error if an active incident already exists with that title and description', async () => {
        const title = 'Jeffrey';
        const description = 'Lee';
        await factory.create('activeIncident', {
          title,
          description,
          isPublic: true,
        });

        const response = await withInternalUser(req.send({ title, description }), agent);

        expect(response.status).to.equal(409);
        expect(response.body.message).to.match(
          /Incident couldn't be created because an active one already exists with that title and description\./,
        );
      });
    });

    it('should thrown an error if user does not have proper role', async () => {
      const title = 'Jeffrey';
      const description = 'Lee';

      const req = request(app)
        .post('/admin/incidents')
        .send({ title, description });

      const response = await withInternalUser(req);

      expect(response.status).to.equal(403);
      expect(response.body.message).to.match(/User does not have permission/);
    });
  });

  describe('POST /admin/incidents/:id/users', () => {
    it('should throw an error if incident is public', async () => {
      const [incident, user] = await Promise.all([
        factory.create('activeIncident', { isPublic: true }),
        factory.create('user'),
      ]);

      const req = request(app)
        .post(`/admin/incidents/${incident.id}/users`)
        .send({ userIds: `${user.id}` });

      const response = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(response.status).to.be.eq(422);
      expect(response.body.message).to.match(/Can't attach a user to a public incident\./);
    });

    it("should throw an error if incident doesn't exist", async () => {
      const [user, incident] = await Promise.all([
        factory.create('user'),
        factory.create('activeIncident'),
      ]);

      const req = request(app)
        .post(`/admin/incidents/${incident.id}999/users`)
        .send({ userIds: `${user.id}` });

      const response = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(response.status).to.be.eq(404);
      expect(response.body.message).to.match(/Incident does not exist\./);
    });

    it('should throw an error if the user is not an admin', async () => {
      const [user, incident] = await Promise.all([
        factory.create('user'),
        factory.create('activeIncident'),
      ]);

      const req = request(app)
        .post(`/admin/incidents/${incident.id}/users`)
        .send({ userIds: `${user.id}` });

      const response = await withInternalUser(req);

      expect(response.status).to.be.eq(403);
      expect(response.body.message).to.match(/User does not have permission/);
    });

    it('should should create UserIncidents if incident is private and ignore duplicates', async () => {
      const [user2, user3, incident] = await Promise.all([
        factory.create('user'),
        factory.create('user'),
        factory.create('activeIncident'),
      ]);

      const userIds = [user2.id, user3.id];

      const req = request(app)
        .post(`/admin/incidents/${incident.id}/users`)
        .send({ userIds: userIds.concat(userIds).join(',') })
        .expect(201);

      await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      const userIncidents = await UserIncident.findAll({ where: { incidentId: incident.id } });
      expect(userIncidents.length).to.be.eq(2);

      userIncidents.forEach(row => {
        expect(userIds).to.include(row.userId);
      });
    });
  });

  describe('PATCH /incidents/:id', () => {
    it('should update incident title and description', async () => {
      const incident = await factory.create('activeIncident');
      const title = 'Jeffrey';
      const description = 'Lee';

      const req = request(app)
        .patch(`/admin/incidents/${incident.id}`)
        .send({ title, description });

      await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      await incident.reload();

      expect(incident.title).to.eq(title);
      expect(incident.description).to.eq(description);
    });

    it('should update status to resolved', async () => {
      const user = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
      const incident = await factory.create('activeIncident');

      await withInternalUser(
        request(app)
          .patch(`/admin/incidents/${incident.id}`)
          .send({ resolved: true }),
        user,
      );

      await incident.reload();
      expect(incident.resolvedAt).to.exist;
      expect(incident.resolverId).to.eq(user.id);
    });

    it('should thrown an error if user does not have proper role', async () => {
      const user = await createInternalUser({ roleAttrs: { name: 'overdraftSupport' } });
      const title = 'Jeffrey';
      const description = 'Lee';

      const response = await withInternalUser(
        request(app)
          .patch('/admin/incidents/1')
          .send({ title, description, creatorId: user.id }),
        user,
      );

      expect(response.status).to.equal(403);
      expect(response.body.message).to.match(/User does not have permission/);
    });

    it('should throw a not found error if the incident was not found with id', async () => {
      const title = 'Jeffrey';
      const description = 'Lee';

      const req = request(app)
        .patch('/admin/incidents/123')
        .send({ title, description });

      const response = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(response.status).to.equal(404);
      expect(response.body.message).to.match(
        /Incident couldn't be updated because it does not exist\./,
      );
    });

    it('should throw a unprocessable entity error if the incident was resolved', async () => {
      const incident = await factory.create('activeIncident', { resolvedAt: moment() });
      const title = 'Jeffrey';
      const description = 'Lee';

      const req = request(app)
        .patch(`/admin/incidents/${incident.id}`)
        .send({ title, description });

      const response = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(response.status).to.equal(422);
      expect(response.body.message).to.match(
        /Incident couldn't be updated because it has already been resolved\./,
      );
    });
  });

  describe('DELETE /incidents/:id', () => {
    context('as an admin', () => {
      let req: request.Test;
      let agent: InternalUser;
      let incident: Incident;
      beforeEach(async () => {
        agent = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
        incident = await factory.create('activeIncident', { creatorId: agent.id });

        req = request(app).delete(`/admin/incidents/${incident.id}`);
      });

      it('should delete incident', async () => {
        await withInternalUser(req.expect(200), agent);

        const deletedIncident = await Incident.findOne({
          where: { creatorId: agent.id },
          paranoid: false,
        });

        expect(deletedIncident.deleted).to.exist;
      });

      it('should throw a not found error if the incident was not found with id', async () => {
        const response = await withInternalUser(
          request(app).delete(`/admin/incidents/${incident.id + 1}`),
          agent,
        );

        expect(response.status).to.equal(404);
        expect(response.body.message).to.match(
          /Incident couldn't be deleted because it does not exist\./,
        );
      });

      it('should throw a unprocessable entity error if incident has already been resolved', async () => {
        await incident.update({ resolvedAt: moment() });

        const response = await withInternalUser(req, agent);

        expect(response.status).to.equal(422);
        expect(response.body.message).to.match(
          /Incident couldn't be deleted because it has already been resolved\./,
        );
      });
    });

    it('should thrown an error if user does not have proper role', async () => {
      const agent = await createInternalUser({ roleAttrs: { name: 'overdraftSupport' } });
      const incident = await factory.create('activeIncident');

      const response = await withInternalUser(
        request(app).delete(`/admin/incidents/${incident.id}`),
        agent,
      );

      expect(response.status).to.equal(403);
      expect(response.body.message).to.match(/User does not have permission/);
    });
  });
});
