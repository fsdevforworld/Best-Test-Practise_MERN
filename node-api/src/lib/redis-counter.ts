import redisClient from './redis';

export default class RedisCounter {
  constructor(private key: string) {}

  public async getValue(): Promise<number> {
    const valueRaw = await redisClient.getAsync(this.key);

    return Number(valueRaw);
  }

  public async increment(): Promise<boolean> {
    return redisClient.incrAsync(this.key);
  }

  public async setValue(value: number): Promise<number> {
    await redisClient.setAsync(this.key, value);

    return value;
  }
}
