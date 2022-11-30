import * as config from 'config';
import { isDevEnv, isTestEnv } from '../../lib/utils';

export class SombraConfig {
  public static isMockEnvironment(): boolean {
    return !config.has(SombraConfig.ConfigURL) && (isDevEnv() || isTestEnv());
  }

  public static devPublicKey(): string {
    const base64PublicKey = config.get<string>(SombraConfig.ConfigDevPublicKey);
    return Buffer.from(base64PublicKey, 'base64').toString('utf-8');
  }

  public static devPrivateKey(): string {
    const base64PrivateKey = config.get<string>(SombraConfig.ConfigDevPrivateKey);
    return Buffer.from(base64PrivateKey, 'base64').toString('utf-8');
  }

  public static devIssuer(): string {
    return config.get<string>(SombraConfig.ConfigDevIssuer);
  }

  public static devExpiresIn(): number {
    return config.get<number>(SombraConfig.ConfigExpiresIn);
  }

  public static url(): string {
    return config.get<string>(SombraConfig.ConfigURL);
  }

  public static stubResponse(): string {
    return config.get<string>(SombraConfig.ConfigStubResponse);
  }

  private static ConfigDevPublicKey = 'sombra.development.publicKey';
  private static ConfigDevPrivateKey = 'sombra.development.privateKey';
  private static ConfigDevIssuer = 'sombra.development.issuer';
  private static ConfigExpiresIn = 'sombra.development.expiresIn';
  private static ConfigURL = 'sombra.url';
  private static ConfigStubResponse = 'sombra.stubResponse';
}
