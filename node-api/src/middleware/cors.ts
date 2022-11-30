import { Request, Response, NextFunction } from 'express';
import { isDevEnv } from '../lib/utils';

export default (req: Request, res: Response, next: NextFunction) => {
  const whitelist = [
    'https://staging.dave.com',
    'https://uat-dashboard.trydave.com',
    'https://dashboard.trydave.com',
    'https://staging-dashboard.trydave.com',
    'https://dave.com',
    'https://www.dave.com',
    'http://localhost:8081',
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:3001',
    'http://localhost:3006',
    'http://localhost:3100',
  ];
  const origin = req.get('origin');
  if (origin && req.headers) {
    const isTestFeature = origin.endsWith('test.trydave.com');
    const isWhitelisted = whitelist.includes(origin);
    if (isWhitelisted || isTestFeature || isDevEnv()) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, PUT, PATCH, DELETE');
      res.set(
        'Access-Control-Allow-Headers',
        'authorization,locale,x-device-id,x-device-type,content-type',
      );
    }
  }
  next();
};
