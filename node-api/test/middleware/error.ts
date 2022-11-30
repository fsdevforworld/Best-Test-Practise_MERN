import * as request from 'supertest';
import * as createError from 'http-errors';
import * as express from 'express';
import { expect } from 'chai';
import { errorHandlerMiddleware } from '../../src/middleware/error';

describe('Error Handler middleware', () => {
  it('should handle http-errors', async () => {
    const error = createError(400, 'request aborted', {
      code: 'ECONNABORTED',
      type: 'request.aborted',
    });

    const app = express();
    app.use((_, _res, next) => {
      next(error);
    });
    app.post('/', (_, res) => {
      res.sendStatus(202);
    });
    app.use(errorHandlerMiddleware);

    const result = await request(app)
      .post('/')
      .send({});
    expect(result.text).to.equal('Bad Request');
    expect(result.status).to.equal(400);
  });
});
