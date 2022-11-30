import axios, { AxiosError, AxiosRequestConfig, AxiosInstance } from 'axios';
import { ISetupCache, setupCache } from 'axios-cache-adapter';
import {
  SombraRsaKeyFetchError,
  SombraTokensDisabledError,
  InvalidCredentialsError,
} from '../lib/error';
import * as jwt from 'jsonwebtoken';
import { SombraConfig } from '../services/sombra/config';
import { InvalidCredentialsMessageKey } from '../translations';
import logger from '../lib/logger';

const ONE_HOUR_IN_MILLISECONDS = 60 * 60 * 1000;
const UTC_MILLI_OFFSET = new Date().getTimezoneOffset() * 60 * 1000;

interface IApiKeyPairResponseBody {
  id: number;
  publicKey: string;
}

const AxiosHelper = {
  isAxiosError(err: any): err is AxiosError {
    return err.response || err.request;
  },
};

export class SombraTokenValidator {
  public static async verifyTokenPayload(
    tokenString: string,
    fetchRsaPublicKey: (token: string) => Promise<jwt.Secret & Buffer>,
  ): Promise<object | string> {
    const currentTime = SombraTokenValidator.nowUTCEpochSeconds();
    const publicKey: jwt.Secret = SombraConfig.isMockEnvironment()
      ? SombraConfig.devPublicKey()
      : await fetchRsaPublicKey(tokenString);
    try {
      const verified = jwt.verify(tokenString, publicKey, {
        algorithms: ['RS256'],
        clockTimestamp: currentTime,
      });
      return verified;
    } catch (e) {
      logger.warn(`[Sombra-Token-Validator] Unable to verify Access Token`, {
        message: e.message,
      });
      throw e;
    }
  }

  private static validKid(kid: any): boolean {
    const number = Number.parseInt(kid, 10);
    return Number.isSafeInteger(number) && number > 0;
  }

  private static nowUTCEpochSeconds(): number {
    return Math.floor((new Date().getTime() + UTC_MILLI_OFFSET) / 1000);
  }

  private requestConfig?: AxiosRequestConfig;
  private sombraClient?: AxiosInstance;
  private keyPairCache: ISetupCache;
  private sombraTokensEnabled: boolean;

  public constructor(requestConfig?: AxiosRequestConfig) {
    this.keyPairCache = setupCache({
      maxAge: ONE_HOUR_IN_MILLISECONDS,
    });
    this.sombraClient = SombraConfig.isMockEnvironment()
      ? undefined
      : axios.create({
          adapter: this.keyPairCache.adapter,
          baseURL: SombraConfig.url(),
          timeout: 1000,
          responseType: 'json',
          validateStatus: status => status === 200,
        });
    this.requestConfig = requestConfig;
    this.sombraTokensEnabled = SombraConfig.stubResponse() === 'false';
  }

  public async validateAccessTokenGetUserId(sombraToken: string): Promise<number> {
    if (!this.isEnabled()) {
      logger.info(`[Sombra-Token-Validator] Sombra token validator disabled`);
      throw new SombraTokensDisabledError('Access tokens not enabled');
    }

    const tokenPayload: any = await SombraTokenValidator.verifyTokenPayload(sombraToken, token =>
      this.fetchRsaPublicKey(token),
    );
    if (tokenPayload.type !== 'access') {
      logger.warn(`[Sombra-Token-Validator] Token type is not access`, {
        type: tokenPayload.type,
      });
      throw new Error('Invalid access token');
    }
    return tokenPayload.sub;
  }

  public isEnabled() {
    return this.sombraTokensEnabled;
  }

  private async getPublicKey(keyId: string): Promise<string> {
    try {
      const response = await this.sombraClient.get<IApiKeyPairResponseBody>(
        `/api/v1/keypair/${keyId}`,
        this.requestConfig,
      );
      return response.data.publicKey;
    } catch (err) {
      if (AxiosHelper.isAxiosError(err) && err.response) {
        logger.warn(
          `[Sombra-Token-Validator] Unable to fetch keypair by kid due to error response`,
          {
            kid: keyId,
            status: err.response.status,
            statusText: err.response.statusText,
          },
        );
      } else if (AxiosHelper.isAxiosError(err) && err.request) {
        logger.warn(
          `[Sombra-Token-Validator] Unable to fetch keypair by kid due to failed request`,
          {
            kid: keyId,
          },
        );
      } else {
        logger.error(`[Sombra-Token-Validator] Unexpected error fetching keypair`, {
          message: err.message,
        });
      }
      throw new SombraRsaKeyFetchError('Unable to get public key from keypair API endpoint');
    }
  }

  private async fetchRsaPublicKey(headerToken: string): Promise<jwt.Secret & Buffer> {
    let decoded;
    try {
      decoded = jwt.decode(headerToken, { complete: true, json: true });
    } catch (e) {
      logger.warn(`[Sombra-Token-Validator] Invalid Access Token`, {
        token: decoded,
      });
    }
    const kid = decoded?.header?.kid;
    if (!SombraTokenValidator.validKid(kid)) {
      logger.warn(`[Sombra-Token-Validator] Invalid kid`, {
        kid,
      });
      throw new InvalidCredentialsError(InvalidCredentialsMessageKey.InvalidAuthToken);
    }
    const publicKey: string = await this.getPublicKey(kid);
    const publicKeyBuffer = Buffer.from(publicKey, 'utf8');
    return publicKeyBuffer;
  }
}

let sombraTokenValidator: SombraTokenValidator;

export function getSombraTokenValidator() {
  if (!sombraTokenValidator) {
    sombraTokenValidator = new SombraTokenValidator();
  }
  return sombraTokenValidator;
}
