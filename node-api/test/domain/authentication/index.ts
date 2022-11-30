import { expect } from 'chai';
import * as sinon from 'sinon';
import { getAuthenticationHeader } from '../../../src/domain/authentication';
import { IDaveRequest } from '../../../src/typings';

/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');

describe('Sombra Helpers', () => {
  describe('getAuthenticationHeader', () => {
    const accessToken = 'hallPass';
    const deviceId = 'gameCube';
    const legacyToken = 'ancientSkeletonKey';

    it('should return an access token header', () => {
      const request = new MockExpressRequest({
        headers: { 'X-Access-Token': accessToken },
      }) as IDaveRequest;
      const headers = getAuthenticationHeader(request);
      expect(headers).to.be.deep.eq({
        'X-Access-Token': accessToken,
      });
    });

    it('should return an authorization header if there is a legacy token and device id', () => {
      const request = new MockExpressRequest({
        headers: { 'X-Device-Id': deviceId, Authorization: legacyToken },
      }) as IDaveRequest;
      const headers = getAuthenticationHeader(request);
      sinon.assert.match(headers, {
        Authorization: sinon.match.string,
      });
    });

    it('should return an authorization header if session cookie has legacy token and device id', () => {
      const request = new MockExpressRequest({
        signedCookies: { user: { deviceId, authorization: legacyToken } },
      }) as IDaveRequest;
      const headers = getAuthenticationHeader(request);
      sinon.assert.match(headers, {
        Authorization: sinon.match.string,
      });
    });

    it('should return null if we can not create anything from the headers', () => {
      const request = new MockExpressRequest({}) as IDaveRequest;
      const headers = getAuthenticationHeader(request);
      expect(headers).to.be.deep.eq(null);
    });
  });
});
