import { SombraConfig } from './config';
import * as uuidV4 from 'uuid/v4';
import * as jwt from 'jsonwebtoken';
import { ISombraResponse } from './typings';

export type CreateMockAuthTokens = {
  id: number;
  exp?: number;
};

export type MockAuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export class MockAuthenticationException extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SombraMockClient {
  public static async userAuthenticate(userId: number): Promise<ISombraResponse> {
    const { accessToken, refreshToken } = MockAuthentication.createTokens({ id: userId });
    const body = { accessToken, refreshToken };
    const statusCode = 200;
    return { body, statusCode };
  }
}

export class MockAuthentication {
  public static createTokens(opts: CreateMockAuthTokens): MockAuthTokens {
    if (SombraConfig.isMockEnvironment()) {
      const privateKey: string = SombraConfig.devPrivateKey();
      const accessTokenPayload = {
        sub: opts.id,
        exp: opts.exp ? opts.exp : Math.round(Date.now() / 1000) + SombraConfig.devExpiresIn(),
        iss: SombraConfig.devIssuer(),
        jti: uuidV4(),
        type: 'access',
      };

      const refreshTokenPayload = {
        sub: opts.id,
        exp: opts.exp ? opts.exp : Math.round(Date.now() / 1000) + SombraConfig.devExpiresIn(),
        iss: SombraConfig.devIssuer(),
        jti: uuidV4(),
        type: 'refresh',
      };
      const accessToken = jwt.sign(accessTokenPayload, privateKey, {
        algorithm: 'RS256',
        header: { kid: '1' },
      });
      const refreshToken = jwt.sign(refreshTokenPayload, privateKey, {
        algorithm: 'RS256',
        header: { kid: '1' },
      });
      return { accessToken, refreshToken };
    } else {
      throw new MockAuthenticationException('Unauthorized action in non-mock environment');
    }
  }
}
