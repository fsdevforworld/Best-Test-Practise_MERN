import { expect } from 'chai';
import * as sinon from 'sinon';
import * as request from 'supertest';
import createDaveExpressApp from '../../../../src/api/dave-express-app';
import { User, Advance } from '../../../../src/models';
import addResourceInternal from '../../../../src/services/internal-dashboard-api/middleware/add-resource-internal';
import { clean, withInternalUser } from '../../../test-helpers';
import { IDashboardApiResourceRequest } from '../../../../src/typings';
import factory from '../../../factories';
import { moment } from '@dave-inc/time-lib';

describe('addResourceInternal', () => {
  const sandbox = sinon.createSandbox();
  let testApp: ReturnType<typeof createDaveExpressApp>;
  before(async () => {
    await clean();

    testApp = createDaveExpressApp(
      app => {
        app.get(
          '/user/:id',
          addResourceInternal(User),
          (req: IDashboardApiResourceRequest<User>, res) => res.send({ user: req.resource }),
        );

        app.get(
          '/user/:id/paranoid',
          addResourceInternal(User, { paranoid: true }),
          (req: IDashboardApiResourceRequest<User>, res) => res.send({ user: req.resource }),
        );

        app.get(
          '/user/:id/wrong-param',
          addResourceInternal(User, { idRoute: 'params.userId' }),
          (req: IDashboardApiResourceRequest<User>, res) => res.send({ user: req.resource }),
        );

        app.get(
          '/user/:id/wrong-resource-type',
          addResourceInternal(Advance),
          (req: IDashboardApiResourceRequest<User>, res) => res.send({ user: req.resource }),
        );
      },
      'addResourceInternalTestApp',
      9083,
    );
  });

  afterEach(() => clean(sandbox));

  after(() => {
    testApp.removeAllListeners();
  });

  context('/user/:id', () => {
    it('should send user to response', async () => {
      const user = await factory.create<User>('user');
      const req = request(testApp)
        .get(`/user/${user.id}`)
        .expect(200);
      const { body } = await withInternalUser(req);

      expect(body.user.id).to.eq(user.id);
    });

    it('should throw if resource cannot be found', async () => {
      const req = request(testApp)
        .get(`/user/101011`)
        .expect(404);

      await withInternalUser(req);
    });
  });

  context('/user/:id/paranoid', () => {
    it('should throw if resource is soft deleted', async () => {
      const user = await factory.create<User>('user', { deleted: moment() });
      const req = request(testApp)
        .get(`/user/${user.id}/paranoid`)
        .expect(404);
      await withInternalUser(req);
    });
  });

  context('/user/:id/wrong-param', () => {
    it('should throw non matching resource name', async () => {
      const user = await factory.create<User>('user');
      const req = request(testApp)
        .get(`/user/${user.id}/wrong-param`)
        .expect(400);

      const res = await withInternalUser(req);

      expect(res.body.message).to.contain('Could not find resource at specified path');
    });
  });

  context('/user/:id/wrong-resource-type', () => {
    it('should throw not found error when wrong resource type is provided', async () => {
      const user = await factory.create<User>('user');
      const req = request(testApp)
        .get(`/user/${user.id}/wrong-resource-type`)
        .expect(404);

      await withInternalUser(req);
    });
  });
});
