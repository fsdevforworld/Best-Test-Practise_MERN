import * as config from 'config';
import * as request from 'supertest';
import * as jwt from 'jwt-simple';
import { addEndpoint } from '../../src/services/task-handler/router';
import app from '../../src/services/task-handler';
import {
  GOOD_HEADER_OBJECT,
  TEST_PRIVATE_KEY,
  startMockGoogleJWKS,
  stopMockGoogleJWKS,
} from '@dave-inc/google-cloud-tasks-helpers/dist/test/helper/jwt';

const ENQUEUEER_EMAIL = config.get('googleCloud.tasks.signingEmail') as string;
const GOOD_TOKEN = jwt.encode({ email: ENQUEUEER_EMAIL }, TEST_PRIVATE_KEY, 'RS256', {
  header: GOOD_HEADER_OBJECT,
});

describe('task-handler/controllers/addEndpoint', () => {
  before(() => {
    startMockGoogleJWKS();

    addEndpoint(
      '/test',
      ({ success }: { success: boolean }) => {
        return success ? Promise.resolve() : Promise.reject('Error here');
      },
      { suppressErrors: true },
    );
  });

  after(stopMockGoogleJWKS);

  it('Should be able to function normally', async () => {
    const payload = { success: true };

    await request(app)
      .post('/test')
      .auth(GOOD_TOKEN, { type: 'bearer' })
      .set('X-CloudTasks-QueueName', 'queueName')
      .set('X-CloudTasks-TaskName', 'taskName')
      .set('X-CloudTasks-TaskRetryCount', '1')
      .set('X-CloudTasks-TaskExecutionCount', '1')
      .set('X-Cloudtasks-TaskETA', new Date().toISOString())
      .send(payload)
      .expect(200);
  });

  it('Problems should 202', async () => {
    const payload = { success: false };

    await request(app)
      .post('/test')
      .auth(GOOD_TOKEN, { type: 'bearer' })
      .set('X-CloudTasks-QueueName', 'queueName')
      .set('X-CloudTasks-TaskName', 'taskName')
      .set('X-CloudTasks-TaskRetryCount', '1')
      .set('X-CloudTasks-TaskExecutionCount', '1')
      .set('X-Cloudtasks-TaskETA', new Date().toISOString())
      .send(payload)
      .expect(202);
  });

  it('no auth header should 401', async () => {
    await request(app)
      .post('/test')
      .expect(401);
  });

  it('get should 404', async () => {
    await request(app)
      .get('/test')
      .auth(GOOD_TOKEN, { type: 'bearer' })
      .expect(404);
  });

  it('no body should 400', async () => {
    await request(app)
      .post('/test')
      .auth(GOOD_TOKEN, { type: 'bearer' })
      .set('X-CloudTasks-QueueName', 'queueName')
      .set('X-CloudTasks-TaskName', 'taskName')
      .set('X-CloudTasks-TaskRetryCount', '1')
      .set('X-CloudTasks-TaskExecutionCount', '1')
      .set('X-Cloudtasks-TaskETA', new Date().toISOString())
      .expect(400);
  });
});
