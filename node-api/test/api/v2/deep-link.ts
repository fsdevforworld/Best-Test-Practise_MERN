import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../src/api';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { isBrazeEmailLink } from '../../../src/api/v2/deep-link/controller';

const dest = 'destination';
const destUrl = encodeURI(`https://www.dave.com/app/${dest}`);
describe('GET /v2/deep_link', () => {
  beforeEach(async () => {
    await factory.create('deep-link', {
      url: 'open',
      path: '',
      minVersion: '2.13.4',
    });
  });

  afterEach(() => clean());

  it('returns path for valid request and version', async () => {
    const link = await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.13.4',
      maxVersion: '2.13.5',
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrl}`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal(link.path);
  });

  it('returns path with single param for valid request and version', async () => {
    const params = '?email=email@dave.com';
    const destUrlWitParams = encodeURI(`https://www.dave.com/app/${dest}${params}`);
    const link = await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.13.4',
      maxVersion: '2.13.5',
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrlWitParams}`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal(`${link.path}${params}`);
  });

  it('returns path with multiple params for valid request and version', async () => {
    const params = '?email=email@dave.com&test=test&token=123';
    const destUrlWitParams = encodeURI(`https://www.dave.com/app/${dest}${params}`);
    const link = await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.13.4',
      maxVersion: '2.13.5',
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrlWitParams}`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal(`${link.path}${params}`);
  });

  it('returns 400 if version is not provided', async () => {
    await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.13.4',
      maxVersion: '2.13.5',
    });

    const response = await request(app).get(`/v2/deep-link?url=${destUrl}`);
    expect(response.status).to.equal(400);
  });

  it('returns 200 if url is not a dave deeplink', async () => {
    const response = await request(app)
      .get(`/v2/deep-link?url=bad_url`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal('');
  });

  it('returns 404 if url is not an existing deeplink', async () => {
    const nonExistantUrl = encodeURI(`https://www.dave.com/m/non-existant`);
    const response = await request(app)
      .get(`/v2/deep-link?url=${nonExistantUrl}`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(404);
  });

  it('returns 301 if version is too low', async () => {
    await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.99.4',
      maxVersion: '2.100.5',
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrl}`)
      .set('X-App-Version', '2.98.99');

    expect(response.status).to.equal(301);
  });

  it('returns 410 if version is too high', async () => {
    await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.99.4',
      maxVersion: '2.100.5',
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrl}`)
      .set('X-App-Version', '3.0.0');

    expect(response.status).to.equal(410);
  });

  it('returns path if no max version is present on the deep link', async () => {
    const link = await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/destination',
      minVersion: '2.13.4',
      maxVersion: null,
    });

    const response = await request(app)
      .get(`/v2/deep-link?url=${destUrl}`)
      .set('X-App-Version', '2.13.4');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal(link.path);
  });

  it('returns latest minimum version if multiple valid records exist for a given url', async () => {
    await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/old-destination-5',
      minVersion: '2.13.5',
      maxVersion: '2.13.10',
    });
    await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/old-destination-6',
      minVersion: '2.13.6',
      maxVersion: '2.13.10',
    });
    const latestLink = await factory.create('deep-link', {
      url: dest,
      path: 'Authorized/new-destination',
      minVersion: '2.13.7',
      maxVersion: '2.13.10',
    });

    const latestUrl = encodeURI(`https://www.dave.com/m/${latestLink.url}`);
    const response = await request(app)
      .get(`/v2/deep-link?url=${latestUrl}`)
      .set('X-App-Version', '2.13.8');

    expect(response.status).to.equal(200);
    expect(response.body.path).to.equal(latestLink.path);
  });

  describe('isBrazeEmailLink', () => {
    it('returns true for braze links', () => {
      const subdomainOne = isBrazeEmailLink(
        'https://ablink.mail.dave.com/uni/ls/click?upn=YGkp-2BYkPwn1F7jqizlpBQ57S',
      );
      const subdomainTwo = isBrazeEmailLink(
        'https://ablink.no-reply.dave.com/uni/ls/click?upn=YGkp-2BYkPwn1F7jqizlpBQ57S',
      );
      expect(subdomainOne).to.be.true;
      expect(subdomainTwo).to.be.true;
    });

    it('returns true for braze links (case-insensitive)', () => {
      const result = isBrazeEmailLink(
        'Https://Ablink.mail.Dave.com/uni/ls/click?upn=YGkp-2BYkPwn1F7jqizlpBQ57S',
      );
      expect(result).to.be.true;
    });

    it('returns false for non-braze links', () => {
      const result = isBrazeEmailLink(
        'https://random.com?url=https://ablink.mail.dave.com/uni/ls/click?upn=YGkp-2BYkPwn1F7jqizlpBQ57S',
      );
      expect(result).to.be.false;
    });

    it('returns false for non-valid urls', () => {
      const result = isBrazeEmailLink('bad_url');
      expect(result).to.be.false;
    });
  });
});
