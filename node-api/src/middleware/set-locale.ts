import { parse } from 'bcp-47';
import { Response, NextFunction } from 'express';

import { IDaveRequest } from '../typings';

export default function(req: IDaveRequest, res: Response, next: NextFunction) {
  if (!req.i18n) {
    return next();
  }

  let { locale = '' } = req.headers;

  if (Array.isArray(locale) && typeof locale[0] === 'string') {
    locale = locale[0];
  }

  const parsedLocale = parse(locale as string);

  if (!!parsedLocale.language) {
    req.i18n.changeLanguage(parsedLocale.language);
  }

  next();
}
