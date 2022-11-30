import { NextFunction, Request, Response } from 'express';

export default function(req: Request, res: Response, next: NextFunction): void {
  res.set('Cache-Control', 'no-cache');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}
