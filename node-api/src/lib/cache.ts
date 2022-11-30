import redisClient from './redis';

export class Cache {
  private readonly keyPrefix: string;

  constructor(keyPrefix: string) {
    this.keyPrefix = keyPrefix;
  }

  public async set(key: string, value: string, expireTimeSeconds?: number): Promise<void> {
    const args = [this.formatKey(key), value];
    if (expireTimeSeconds) {
      args.push('EX', expireTimeSeconds.toString());
    }
    await redisClient.setAsync(args);
  }

  public async get(key: string): Promise<string> {
    return redisClient.getAsync(this.formatKey(key));
  }

  public async remove(key: string) {
    return redisClient.delAsync(this.formatKey(key));
  }

  private formatKey(key: string) {
    return `${this.keyPrefix}${key}`;
  }
}
