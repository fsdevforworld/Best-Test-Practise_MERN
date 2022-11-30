import { expect } from 'chai';
import * as sinon from 'sinon';
import { Request } from 'express';
import * as request from 'supertest';
import createDaveExpressApp from '../../../../src/api/dave-express-app';
import { InternalUser } from '../../../../src/models';
import requireInternalAuth from '../../../../src/services/internal-dashboard-api/middleware/require-internal-auth';
import { clean, createInternalUser, stubGoogleAuth } from '../../../test-helpers';

interface ITestAppRequest extends Request {
  internalUser?: InternalUser;
}

describe('requireInternalAuth', () => {
  const sandbox = sinon.createSandbox();
  let testApp: ReturnType<typeof createDaveExpressApp>;
  before(async () => {
    await clean();

    testApp = createDaveExpressApp(
      app => {
        app.get('/test', requireInternalAuth, (req: ITestAppRequest, res) =>
          res.send({ internalUser: req.internalUser }),
        );
      },
      'requireInternalAuthTestApp',
      9082,
    );
  });

  afterEach(() => clean(sandbox));

  after(() => {
    testApp.removeAllListeners();
  });

  context('Authorization header is a Google Oauth token', () => {
    it('adds the internalUser to the request', async () => {
      const internalUser = await createInternalUser();
      const { idToken, spy } = stubGoogleAuth(internalUser.email, { sandbox });

      const res = await request(testApp)
        .get('/test')
        .set('Authorization', idToken)
        .expect(200);

      expect(spy.calledWith({ idToken, audience: sinon.match.string }));
      expect(res.body.internalUser.email).to.equal(internalUser.email);
    });
  });

  context('Authorization header is a Dave session token', () => {
    it('throws an Unauthorized error', async () => {
      const internalUser = await createInternalUser();

      const res = await request(testApp)
        .get('/test')
        .set('Authorization', `${internalUser.id}`)
        .set('X-Device-Id', `${internalUser.id}`)
        .expect(403);

      expect(res.text).match(/User does not have permission/);
    });
  });

  it('throws a MissingHeaders error if the Authorization header is missing', async () => {
    await request(testApp)
      .get('/test')
      .expect(400);
  });
});
