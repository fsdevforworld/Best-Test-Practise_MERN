import redisClient from '../lib/redis';
import { IDaveRequest } from '../typings';
import { Response, NextFunction } from 'express';
import logger from '../lib/logger';

export default async function(
  req: IDaveRequest,
  res: Response,
  next: NextFunction,
): Promise<Response> {
  const uuid = req.get('X-Request-Id');
  if (uuid) {
    const existingRecord = await redisClient.getAsync(`requestId:${uuid}`);
    let currentTtl;
    if (existingRecord) {
      currentTtl = await redisClient.ttlAsync(`requestId:${uuid}`);
    }
    const record = await redisClient.getsetAsync(`requestId:${uuid}`, 'seen');
    // call set again so we can set the expire time
    await redisClient.setAsync([`requestId:${uuid}`, 'seen', 'EX', '300']);
    if (record === 'seen') {
      const logged = await redisClient.getsetAsync(`duplicateRequestLog:${uuid}`, 'logged');
      await redisClient.setAsync([`duplicateRequestLog:${uuid}`, 'logged', 'EX', '300']);
      if (logged !== 'logged') {
        logger.error('duplicate request', {
          headers: req.headers,
          requestId: uuid,
          deviceId: req.get('x-device-id'),
          deviceType: req.get('x-device-type'),
          ip: req.ip,
          method: req.method,
          url: req.url,
          query: req.query,
          endpoint: req.originalUrl,
          seen: existingRecord,
          ttl: currentTtl,
        });
      }
      return res.status(400).send({ message: 'Duplicate request' });
    }
  }
  next();
}
