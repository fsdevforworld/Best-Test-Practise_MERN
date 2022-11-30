import * as request from 'supertest';
import { Request } from 'express';
import * as bodyParser from 'body-parser';
import createDaveExpressApp from '../../../../src/api/dave-express-app';
import { InternalRole, InternalUser } from '../../../../src/models';
import { IDashboardApiRequest } from '../../../../src/typings';
import requireInternalRole from '../../../../src/services/internal-dashboard-api/middleware/require-internal-role';
import { clean, createInternalUser } from '../../../test-helpers';
import factory from '../../../factories';

interface ITestAppRequest<T> extends Request {
  body: T;
  internalUser?: InternalUser;
}

describe('requireInternalRole', () => {
  const roleName = 'overdraftSupport';

  let testApp: ReturnType<typeof createDaveExpressApp>;
  let internalRole: InternalRole;
  before(async () => {
    await clean();

    internalRole = await factory.create<InternalRole>('internal-role', { name: roleName });

    testApp = createDaveExpressApp(
      app => {
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: false }));
        app.post(
          '/test',
          async (req: ITestAppRequest<{ id: number }>, res, next) => {
            const internalUser = await InternalUser.findByPk(req.body.id);
            req.internalUser = internalUser;

            next();
          },
          requireInternalRole([roleName]),
          (req: IDashboardApiRequest, res) => res.send(req.internalUser),
        );
      },
      'testApi',
      9081,
    );
  });

  after(async () => {
    await clean();
    testApp.removeAllListeners();
  });

  it('allows internal users with the correct internal role', async () => {
    const internalUser = await createInternalUser({ roleAttrs: { name: internalRole.name } });

    await request(testApp)
      .post('/test')
      .send({
        type: 'endUser',
        id: internalUser.id,
      })
      .expect(200);
  });

  it('handles when req.internalUser has already been set', async () => {
    const internalUser = await createInternalUser({ roleAttrs: { name: internalRole.name } });

    await request(testApp)
      .post('/test')
      .send({
        type: 'internalUser',
        id: internalUser.id,
      })
      .expect(200);
  });

  it('throws an unauthorized error when the user does not have the correct role', async () => {
    const internalUser = await createInternalUser({ roleAttrs: { name: 'some other role' } });

    await request(testApp)
      .post('/test')
      .send({
        type: 'internalUser',
        id: internalUser.id,
      })
      .expect(403);
  });
});
