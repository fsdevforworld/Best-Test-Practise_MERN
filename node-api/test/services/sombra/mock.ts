import * as sinon from 'sinon';
import { clean } from '../../test-helpers';
import {
  MockAuthentication,
  MockAuthenticationException,
  SombraMockClient,
} from '../../../src/services/sombra/mock';
import { SombraConfig } from '../../../src/services/sombra/config';
import { expect } from 'chai';
import * as jwt from 'jsonwebtoken';

describe('Sombra mocks', () => {
  const sandbox = sinon.createSandbox();
  before(async () => await clean());
  afterEach(async () => await clean(sandbox));

  describe('MockAuthentication', () => {
    describe('createTokens', () => {
      it('should throw an exception when not in a mock environment', () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        expect(() => MockAuthentication.createTokens({ id: 1, exp: 2 })).to.throw(
          MockAuthenticationException,
        );
      });

      it('should generate a pair of JWT tokens according to the specifications of Sombra Access and Refresh tokens', () => {
        const isMockEnvironment = sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
        const devPrivateKey = sandbox.stub(SombraConfig, 'devPrivateKey').returns('privateKey');
        const devIssuer = sandbox.stub(SombraConfig, 'devIssuer').returns('issuer');
        const sign = sandbox.stub(jwt, 'sign').resolves();

        MockAuthentication.createTokens({ id: 1, exp: 9999999999 });

        expect(isMockEnvironment.called).to.be.eq(true);
        expect(devPrivateKey.called).to.be.eq(true);
        expect(devIssuer.called).to.be.eq(true);
        expect(sign.called).to.be.eq(true);

        for (const test of [
          { call: 0, type: 'access' },
          { call: 1, type: 'refresh' },
        ]) {
          const args = sign.args[test.call];
          const token = args[0];
          expect(token.jti).to.satisfy(
            (each: any) => typeof each === 'string',
            'token.jti must be a string',
          );
          expect(token.iat).to.satisfy(
            (each: any) => each === undefined,
            'token.iat is generated at runtime',
          );
          expect(token.sub).to.be.eq(1);
          expect(token.exp).to.be.eq(9999999999);
          expect(token.iss).to.be.eq('issuer');
          expect(token.type).to.be.eq(test.type);
          const secretOrPrivateKey = args[1];
          expect(secretOrPrivateKey).to.be.eq('privateKey');
          const options = args[2];
          expect(options.algorithm).to.be.eq('RS256');
        }
      });

      it('should generate a pair of RS256 JWT token signed with the dev public key when in a mock environment that are verifiable', () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
        const { accessToken, refreshToken } = MockAuthentication.createTokens({
          id: 1,
          exp: 9999999999,
        });
        expect(() =>
          jwt.verify(accessToken, SombraConfig.devPublicKey(), { algorithms: ['RS256'] }),
        ).to.not.throw();
        expect(() =>
          jwt.verify(refreshToken, SombraConfig.devPublicKey(), { algorithms: ['RS256'] }),
        ).to.not.throw();

        const {
          accessToken: accessTokenExpired,
          refreshToken: refreshTokenExpired,
        } = MockAuthentication.createTokens({ id: 1, exp: 1 });
        expect(() =>
          jwt.verify(accessTokenExpired, SombraConfig.devPublicKey(), { algorithms: ['RS256'] }),
        ).to.throw();
        expect(() =>
          jwt.verify(refreshTokenExpired, SombraConfig.devPublicKey(), { algorithms: ['RS256'] }),
        ).to.throw();
      });
    });
  });

  describe('SombraMockClient', () => {
    describe('userAuthenticate', () => {
      it('should call MockAuthentication createTokens', async () => {
        const createTokens = sandbox
          .stub(MockAuthentication, 'createTokens')
          .returns({ accessToken: 'hi', refreshToken: 'hi' });
        await SombraMockClient.userAuthenticate(1);
        expect(createTokens.called).to.be.eq(true);
      });
      it('should always return a 200 response code and tokens when there are no exceptions thrown', async () => {
        sandbox
          .stub(MockAuthentication, 'createTokens')
          .returns({ accessToken: 'hi', refreshToken: 'hi' });
        const response = await SombraMockClient.userAuthenticate(1);
        expect(response.statusCode).to.be.eq(200);
        const { accessToken, refreshToken } = response.body;
        expect(accessToken).to.eq('hi');
        expect(refreshToken).to.eq('hi');
      });
    });
  });
});
