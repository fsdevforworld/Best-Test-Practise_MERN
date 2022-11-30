import { Response } from 'express';
import { IDaveRequest, IDaveResponse } from '../../../typings';
import { DeepLink } from '../../../models';
import { resolveUrl, getLatestValidPath } from './controller';

export async function get(
  req: IDaveRequest,
  res: IDaveResponse<{ path: string }>,
): Promise<Response> {
  const version: string = req.get('X-App-Version');
  if (!version) {
    return res.status(400).send({ message: 'No valid app version provided' });
  }

  const { url, params } = await resolveUrl(req);
  const deepLinks = await DeepLink.findAll({ where: { url }, order: [['min_version', 'ASC']] });
  if (!deepLinks || deepLinks.length <= 0) {
    return res.status(404).send({ message: `Unable to find deep links for url: ${url}` });
  }
  const { path, valid, versionTooLow } = getLatestValidPath(deepLinks, version);
  if (!valid) {
    const status = versionTooLow ? 301 : 410;
    const msg = versionTooLow ? 'too low' : 'too high';
    return res.status(status).send({
      message: `${deepLinks.length} deeplink(s) found for url: ${url}, but current version is ${msg}.`,
    });
  }

  const pathWithParams = params ? [path, params].join('?') : path;

  return res.send({ path: pathWithParams });
}
