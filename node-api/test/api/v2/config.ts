import * as request from 'supertest';
import { get as getConfig } from 'config';
import app from '../../../src/api';
import 'mocha';
import { expect } from 'chai';
import 'chai-json-schema';
import { clean, up } from '../../test-helpers';
import factory from '../../factories';
import { CUSTOM_ERROR_CODES } from '../../../src/lib/error';

describe('/v2/config', () => {
  // clean everything before we start
  before(() => clean());

  // insert user and user_session data
  beforeEach(() => {
    return up();
  });

  //truncate user and user_session data
  afterEach(() => clean());

  describe('GET /v2/config', () => {
    const minVersionConfig = getConfig<string>('minAppVersion.config');

    it('should map config to JSON', async () => {
      await factory.createMany('config', [
        {
          key: 'FOO',
          value: true,
        },
        {
          key: 'BAR',
          value: false,
        },
      ]);

      const result = await request(app)
        .get('/v2/config/')
        .set('X-App-Version', minVersionConfig);

      expect(result.status).to.equal(200);
      expect(result.body).to.not.be.empty;
      expect(result.body).to.deep.equal({
        FOO: true,
        BAR: false,
      });
    });

    it('should return empty result if no config', async () => {
      const result = await request(app)
        .get('/v2/config/')
        .set('X-App-Version', minVersionConfig);

      expect(result.status).to.equal(200);
      expect(result.body).to.be.empty;
    });

    it('should force update error if missing X-App-Version header', async () => {
      const result = await request(app).get('/v2/config');

      expect(result.status).to.equal(400);
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL);
    });

    it('should force update error if < v2.47.0', async () => {
      const result = await request(app)
        .get('/v2/config')
        .set('X-App-Version', '2.46.0');

      expect(result.status).to.equal(400);
      expect(result.body.customCode).to.equal(CUSTOM_ERROR_CODES.FORCE_APP_RE_INSTALL);
    });

    it('should not force update error if >= v2.47.0', async () => {
      const result = await request(app)
        .get('/v2/config')
        .set('X-App-Version', minVersionConfig);

      expect(result.status).to.equal(200);
    });
  });
});
