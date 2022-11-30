import * as request from 'supertest';
import * as express from 'express';
import { expect } from 'chai';
import { ensureRequestIdExistsMiddleware } from '../../src/middleware/ensure-request-id-exists';
import { IDaveRequest } from '../typings';
import logger from '../../src/lib/logger';
import * as sinon from 'sinon';

describe('[Middleware] Ensure RequestID Exists Middleware', async () => {
  let loggerDebugSpy: sinon.SinonSpy | undefined;

  const app = express();
  app.use(ensureRequestIdExistsMiddleware);
  app.get('/', (req: IDaveRequest, res: express.Response) => {
    res.status(200).send({ requestId: req.requestID });
  });

  before(() => {
    loggerDebugSpy = sinon.spy(logger, 'debug');
  });

  after(() => {
    loggerDebugSpy.restore();
  });

  it('should utilize existing requestID whenever it already exists in a requests headers', async () => {
    const result = await request(app)
      .get('/')
      .set('X-Request-Id', '123456')
      .send({});

    expect(result.status).to.equal(200);
    expect(result.body).to.have.property('requestId', '123456');
  });

  it('should generate new requestID whenever it is missing from a requests headers', async () => {
    const result = await request(app)
      .get('/')
      .send({});

    expect(result.status).to.equal(200);
    expect(result.body.requestId.length).to.be.equal(36);
    expect(result.body).to.have.property('requestId');
  });

  it('should not log anything unless this occurs within the production environment', async () => {
    const result = await request(app)
      .get('/')
      .send({});

    expect(result.body).to.have.property('requestId');
    expect(result.body.requestId.length).to.be.equal(36);
    expect(loggerDebugSpy).not.to.have.been.called;
  });
});
