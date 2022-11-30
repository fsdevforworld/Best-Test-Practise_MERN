import { SombraTokenValidator } from '../../src/middleware/sombra-token-validator';
import * as sinon from 'sinon';
import { clean } from '@test-helpers';
import { expect } from 'chai';
import * as jwt from 'jsonwebtoken';
import { SOMBRA_PUBLIC_KEY } from '../test-helpers/sombra';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { SombraConfig } from '../../src/services/sombra/config';

describe('sombra-token-validator', () => {
  const sandbox = sinon.createSandbox();

  beforeEach(async () => {
    await clean(sandbox);
  });

  afterEach(async () => {
    await clean(sandbox);
  });

  describe('verifyTokenPayload should', () => {
    for (const environment of ['prod', 'staging']) {
      it(`in the ${environment} environment, not use the dev key`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        const fetchKeySpy = sandbox.stub().resolves('keyValue');
        const devKeySpy = sandbox.stub(SombraConfig, 'devPublicKey');

        sandbox.stub(jwt, 'verify').returns('ok');

        await SombraTokenValidator.verifyTokenPayload('lol.token.string', fetchKeySpy);
        expect(fetchKeySpy.called).to.be.true;
        expect(devKeySpy.called).to.be.false;
      });

      it(`in the ${environment} environment, try to verify the jwt with the value from fetchPublicKey`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(false);
        const keyValue = 'i.am.a.public.key';
        const fetchKeySpy = sandbox.stub().resolves(keyValue);
        const jwtStub = sandbox.stub(jwt, 'verify').returns('ok');
        const token = 'lol.token.string';

        await SombraTokenValidator.verifyTokenPayload(token, fetchKeySpy);
        expect(jwtStub.callCount).to.be.eq(1);
        const args = jwtStub.args[0];
        expect(args[0]).to.be.eq(token);
        expect(args[1]).to.be.eq(keyValue);
        const options = args[2];
        expect(options.algorithms[0]).to.be.eq('RS256');
        expect(fetchKeySpy.callCount).to.be.eq(1);
      });
    }

    for (const environment of ['dev', 'ci', 'test']) {
      it(`in the ${environment} environment, not try to fetch a public key from Sombra`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
        const fetchKeySpy = sandbox.spy();
        sandbox.stub(jwt, 'verify').returns('ok');

        await SombraTokenValidator.verifyTokenPayload('lol.token.string', fetchKeySpy);
        expect(fetchKeySpy.called).to.be.false;
      });

      it(`in the ${environment} environment, try to verify the jwt with the dev public key`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(true);
        const fetchKeySpy = sandbox.spy();
        const jwtStub = sandbox.stub(jwt, 'verify').returns('ok');
        const token = 'lol.token.string';

        await SombraTokenValidator.verifyTokenPayload(token, fetchKeySpy);
        expect(jwtStub.callCount).to.be.eq(1);
        const args = jwtStub.args[0];
        expect(args[0]).to.be.eq(token);
        expect(args[1]).to.be.eq(SOMBRA_PUBLIC_KEY);
        const options = args[2];
        expect(options.algorithms[0]).to.be.eq('RS256');
      });
    }

    for (const isDev of [true, false]) {
      it(`when isMockEnvironment is ${isDev}, will throw a JsonWebTokenError when verify throws a JsonWebTokenError`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(isDev);
        const fetchKeySpy = sandbox.spy();
        sandbox.stub(jwt, 'verify').throws(new JsonWebTokenError('sad'));
        const token = 'lol.token.string';
        expect(SombraTokenValidator.verifyTokenPayload(token, fetchKeySpy)).to.be.rejectedWith(
          JsonWebTokenError,
        );
      });

      it(`when isMockEnvironment is ${isDev}, will throw a TokenExpiredError when verify throws a TokenExpiredError`, async () => {
        sandbox.stub(SombraConfig, 'isMockEnvironment').returns(isDev);
        const fetchKeySpy = sandbox.spy();
        sandbox.stub(jwt, 'verify').throws(new TokenExpiredError('sad', new Date(Date.now())));
        const token = 'lol.token.string';

        expect(SombraTokenValidator.verifyTokenPayload(token, fetchKeySpy)).to.be.rejectedWith(
          TokenExpiredError,
        );
      });
    }
  });
});
