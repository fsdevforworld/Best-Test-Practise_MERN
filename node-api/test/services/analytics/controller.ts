import * as sinon from 'sinon';
import * as request from 'supertest';
import { expect } from 'chai';

import app from '../../../src/api';
import * as externalController from '../../../src/services/analytics/api/external/controller';
import * as AppsFlyer from '../../../src/services/analytics/integrations/appsflyer';
import * as events from '../../../src/services/analytics/events';
import metrics from '../../../src/services/analytics/metrics';
import logger from '../../../src/lib/logger';

import { AUTH_SECRET, CLIENT_ID } from '../../api/internal/test-constants';
const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString('base64')}`;

// //test-constants';
import factory from '../../factories';
import { clean } from '../../test-helpers';

describe('Analytics controller', () => {
  const sandbox = sinon.createSandbox();
  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('POST /analytics/internal/v1/track', async () => {
    it('should reject without authorization', async () => {
      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .send({
          event: 'debit card funding initiated',
        });
      expect(result.status).to.equal(403);
    });

    it('should 404 if event not included in events', async () => {
      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'foobar',
        });
      expect(result.body.data.event).to.equal('foobar');
      expect(result.status).to.equal(404);
    });

    it('should 202 if event exists', async () => {
      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'debit card funding initiated',
        });
      expect(result.status).to.equal(202);
    });

    it('should call integration if override on', async () => {
      const metricsStub = sandbox.stub(metrics, 'increment');
      const trackStub = sandbox.stub(AppsFlyer, 'track');

      sandbox.stub(events, 'Overrides').value({
        'debit card funding initiated': {
          AppsFlyer: true,
        },
      });

      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'debit card funding initiated',
        });
      expect(result.status).to.equal(202);
      expect(trackStub).to.be.called;
      expect(metricsStub).to.have.been.calledWith('analytics.track.success');
    });

    it('should call integration if on in payload', async () => {
      const metricsStub = sandbox.stub(metrics, 'increment');
      const trackStub = sandbox.stub(AppsFlyer, 'track');

      sandbox.stub(events, 'Overrides').value({
        'debit card funding initiated': {},
      });

      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'debit card funding initiated',
          integrations: { AppsFlyer: true },
        });
      expect(result.status).to.equal(202);
      expect(trackStub).to.be.called;
      expect(metricsStub).to.have.been.calledWith('analytics.track.success');
    });

    it('should not call integration if on in payload but off in overrides', async () => {
      const trackStub = sandbox.stub(AppsFlyer, 'track');
      sandbox.stub(events, 'Overrides').value({
        'debit card funding initiated': { AppsFlyer: false },
      });

      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'debit card funding initiated',
          integrations: { AppsFlyer: true },
        });
      expect(result.status).to.equal(202);
      expect(trackStub).to.not.be.called;
    });

    it('should log integration failure', async () => {
      const error = new Error('foobar');
      const trackStub = sandbox.stub(AppsFlyer, 'track').rejects(error);
      const loggerStub = sandbox.stub(logger, 'error');
      const metricsStub = sandbox.stub(metrics, 'increment');

      sandbox.stub(events, 'Overrides').value({
        'debit card funding initiated': {},
      });

      const result = await request(app)
        .post('/analytics/internal/v1/track')
        .set('Authorization', authHeader)
        .send({
          event: 'debit card funding initiated',
          integrations: { AppsFlyer: true },
        });
      expect(result.status).to.equal(202);
      expect(trackStub).to.be.called;
      expect(metricsStub).to.have.been.calledWith('analytics.track.failure');
      expect(loggerStub).to.have.been.calledWith('analytics error', {
        error,
        integration: 'AppsFlyer',
        method: 'track',
      });
    });
  });

  describe('GET /analytics/v1/braze-auth-token', async () => {
    it('should return a 200', async () => {
      sandbox.stub(externalController, 'secret').value(secret);
      const user = await factory.create('user', {}, { hasSession: true });
      const result = await request(app)
        .get('/analytics/v1/braze-auth-token')
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .send();
      expect(result.status).to.equal(200);
      expect(result.body.token).to.be.an('string');
    });

    it('should return a 401 if not authorized', async () => {
      const user = await factory.create('user', {}, { hasSession: true });
      const result = await request(app)
        .get('/analytics/v1/braze-auth-token')
        .set('Authorization', 'bad-authorization')
        .set('X-Device-Id', user.id)
        .send();
      expect(result.status).to.equal(401);
    });
  });
});

const secret = `-----BEGIN RSA PRIVATE KEY-----
MIIJKAIBAAKCAgEAuqN8Ei3E2Iq8zdl+wmddD3xLJPzESnBFjSs9nfmF08jqKYdg
/vAYAYMMfZgsVtsNEVlOWp3y3rc/q8yput/YUv29Iv65r6yNJ/yS1KdQJ50V0scI
2iGEzDX4qZyoYCTY5DFctdJqfnWxL26H47BmjEcLw3NQmxyQutu/sDcLfMp+jQCD
PR/rNSaRx+GJepoVLfIXuQPDrmmdVrVwJODkdhs3JlTxGsA/kO7g64shV5ygiPtc
xczfwAfq6aGo+P3KCdepfQaKkF9uoylAS6ITFRBetqpZ2m+TI60kkGLKt+JdbOLU
gXUJgJm9DasH7cQEfbKFK5xK7wbdRciFyWUK7pVYtQgg9rm/4IkIvUU09bXPnJzc
URLr71lT/yGcVcfRqmzXf4uy1vG+MWXAy8OHwTB9kQgZjdokuXyd7HjM1w+qt1V/
pwaKv1vxnLbvhM3uy1FCXUcRKhCfyYBFQTSnTP3P4qyEYmOhEN6vtbWySzbpq3qg
x2BgKbpTHFgqbE/WVEZdSJy8hzARanoZdKmwbBR2IsSVeMN8dVlZpUhXXhyg3QyC
V09Gs/pwP44+qBUnhciomGNoTkYh3pT1e9xJBPCLN8W6zF6GM3fHPWZGFeKql0db
x5M+YKszrIUR05mJcMFE4u68cE9EWDmJVWu7MMcE+lk6L9x2ycJjvWoNKfMCAwEA
AQKCAgB1tx1O/e0UwtR4ZQBtLvJkDPn8Nyy64nsLocU4OSPuQt9mGAvWX6pUccpU
AMGeeoSQd6pSvyJq1FtlSS2YPwzas00yoESPh550JPqbA3grtAkKqxxrMA7pGfVf
TP5pvXPK4VNfHnqqjiKWDvnIYv8a5MiHmtixLGAgau9I/j7Rk4oj9rnPuK0KFeyG
jDrAyCQpmXLa74PhIp3pDYDQ0cNmtp2fIJ39SFoPWIsmJNd/wbsDCr8lxqUtIhFJ
D/xaJv/iG1K8F38Xtgk7AY6a5XtxoqSKQ4Fuo0bDjrXsF1NSjYRtY9eyWxYGNXEn
CMN0dFh8yzbxHZ+piMPQ+rtfHcq5QhBTfWWJ8vg9HRyhwlWvxL4oifyHMCKZ+lX6
CKWqthVUF2U7V/osf48ok7zZ9AAwNo842ihO+TR7l5qutns7speEr3O/Ip5RWJ6r
0aUCHMtN/BMkiGwsl46aB73VXEDdzWRSZdXSTBCExpgyPlfVN8XwJ7RxCe2LxJ0b
nXASwpQkYPlGbXrCwnaKZg+65whc1gztQmYJ3PvOzKSM5RgGuAVUcu0Hrnw1koMS
D25SvhcJitnRw4jsOIDp6kl7L/dhFzspqGM6fXMsX2pqPdh3DFVJhPkk7uoLW+l1
mBwLUftjVUDxF7anVnuTmyvY4jj2kl4/CGxScXdRipOWx7qv6QKCAQEA5SxDwhP+
IhgZ4gO1YCqLe0zABOksgLL8mfGNvHc8IJASEn4bXX6UuNS7tjOgRxZatWSnlM+K
vK4+LtJPqaOtId1kMMqEnpTnT+4CT0Nv02C8iVzk8ruLclh91o1xyYU8lJgrAqml
n7uAcremqI/gZOp7S/HDFhdcFXpCQEFuq2Y80REEb8+bgcitnGbJiaITY/TW1n25
JfBvdqEpVmn9+Gfno5hWk0Z/LN9nFEBmKPgrcQQ8IrBtUo/zytRl9+joV+b86TkV
kxJDWhxnaN0q7tkbVfWgIAQVDJacxr8I7r1fk0+7zT/A1SwbZSVJyRjOAuqURM+j
zeQzkqOUFCRHhQKCAQEA0HyS+rJWEJDkJ7Y3OV2qJZ2NlbHrjslWjZDgxYIgpaoQ
Bxph4BKNQxCc5wDrGGVCl51guYhSd3YEts0Q5Ti+uVft2JIWzcTnmtmaig1hUyKU
ol7RWTEalC0QNIXnbFVJ3VjwiRvu80IOTMLY01zlqR6+Vt/daZzXkIo+wxhGgKD5
wSF8mRPv2ou4GYF82bE8uWNB1tKcb/XLIhnHDalMyxgssiDXPHAn7ckaHCmPWteN
gxeLtCN2yhrisysQ8N0irjR8JDnN7b9Mkm5Pl/vnbGmBemjGQiCcLqoh5g/VUDQQ
IpQups/PxJgqdKh+UoZjHfNPc5SJ2nnegZ55Ue/ZFwKCAQAWB7dLxNg9NsvmKi0Z
XX2jELG0xyV8Cbi2o73YTC3/g1n5ZR4EUtLBIdIZpcTWkJOPtGlXqMvRb36SyazW
xeEyzDGBbzZoeC/0QxD9xaHOVBJLsh5gJx80ksUmBtrVYHV+Y1JfIyfEvyWN4ZGn
yozrpo7LsiXqzbwQZHxR6PhWibF294fRp8dvJndp/YeKL4ZlqXetjtBpkT9lzABJ
Sk8bvgFKfK514eT/z0n9bGNltNWYO6v8ObGIqkXpTZmvxzfum0ncsZwdUzgeRXS7
Y+dopn42OTJ3YW0UlLXldR/Ks3Gom5WWGXbUBzVq97asGjJTnXE7XCqG9FTw18C4
XvRxAoIBAQCaBw8Hi+2tu330INjX1u03cRkDOTlQekspt5l4EdVQzz2cIc+hndMj
cwiYWcNWeKkkHi8xoxdaDqUY8JPE5ZFymRWtZPDYANsjOhTEXXJD2054TxjXjkGW
q1xHkY4SKUiy8Vxzz2FP8sNhzqomLYG22nHA+Q85UZiovpnzxOGBcmxSVQ0agvI3
QfY3UcUNh7XXOQ+RSHQu+yaiAO1gmG2Vtjx/NWgOzMWTFXnmyIWSlaGE8kZSRckj
M4281NplONrAXSJCGTqcpTJLFJhVLtQg8imoZ/PhMvpwN11n/NaZtH0fLt7weqOD
GPB0027QRVzA6dsPBvR5poPOu2fiMxLtAoIBAH0hbTMJ7GKqlMtH9ndbQidHdiFS
8EXT6A6tXbYt4W1FwMBwqiSG0NXRWYmkNVxRjyXcnjfIRQG4LFJsizuvGeoPZpyf
q/fLjvFIo4EmA6Eear2OhgeEIYmlgRa1nhQZJLgEEYPIjuvC93X9u4HQ0wjYgAaB
mOVF4aWiFDQu1HmHort7MHzHitZ8EasDFtmCFsegQ7oBmUe+bKKUtjsBjYdXXTQL
2k1WjpsB1Y/7WVQQ359/SS8Zg+M3XoMzrPc61xUQjA7QeWiHLSO7ISOOBT0ryj/d
LDZvM4Oq8RjqhRLaBD+ldplmC+52dSWJJnl5QiWKUIlAn84BI2jB1Zdb0L0=
-----END RSA PRIVATE KEY-----`;
