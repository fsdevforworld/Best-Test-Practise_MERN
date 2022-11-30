import * as request from 'superagent';
import * as semver from 'semver';
import { omit } from 'lodash';

import logger from '../../../lib/logger';
import { DeepLink } from '../../../models';
import { IDaveRequest } from '../../../typings';

export function getLatestValidPath(
  deepLinks: DeepLink[],
  version: string,
): { path: string; valid: boolean; versionTooLow: boolean } {
  let latestValidIndex = -1;
  let latestMinIndex = -1;
  for (let i = 0; i < deepLinks.length; i++) {
    const dl = deepLinks[i];
    if (semver.gt(dl.minVersion, version)) {
      latestMinIndex = i;
      continue;
    }
    if (dl.maxVersion && semver.gt(version, dl.maxVersion)) {
      continue;
    }
    latestValidIndex = i;
  }
  let versionTooLow = false;
  if (latestValidIndex >= 0) {
    return { path: deepLinks[latestValidIndex].path, valid: true, versionTooLow };
  }
  versionTooLow = latestMinIndex >= 0;

  return { path: '', valid: false, versionTooLow };
}

export async function resolveUrl({
  query,
}: IDaveRequest): Promise<{ url: string; params: string }> {
  let url = decodeURI(query.url);
  const queryParams = Object.entries(omit(query, ['url']));
  if (queryParams.length && !url.includes('?')) {
    url = url + '?';
  }
  queryParams.forEach(([key, value]) => {
    const param = `&${key}=${value}`;
    url += param;
  });

  if (isBrazeEmailLink(url)) {
    url = await getResolvedUrl(url);
  }
  const webPrefix = [
    'https://dave.com/m/',
    'http://dave.com/m/',
    'https://dave.com/app/',
    'http://dave.com/app/',
    'https://dave.com/uni/',
    'http://dave.com/uni/',
    'https://www.dave.com/m/',
    'http://www.dave.com/m/',
    'https://www.dave.com/app/',
    'http://www.dave.com/app/',
    'https://www.dave.com/uni/',
    'http://www.dave.com/uni/',
  ].find(x => url.toLowerCase().includes(x));

  if (!webPrefix) {
    return {
      url: 'open',
      params: null,
    };
  }
  let trimmed = url.replace(webPrefix, ''); // http://dave.com/app/side-hustle/?test=true => side-hustle/?test=true
  [trimmed] = trimmed.split('?'); // side-hustle/?test=true => side-hustle/
  [trimmed] = trimmed.split('/'); // side-hustle/ => side-hustle

  return {
    url: trimmed,
    params: url.split('?')[1],
  };
}

export function isBrazeEmailLink(urlParam: string): boolean {
  try {
    const url = new URL(urlParam);
    return (
      url.origin === 'https://ablink.mail.dave.com' ||
      url.origin === 'https://ablink.no-reply.dave.com'
    );
  } catch (e) {
    // invalid url passed in, just return false
    return false;
  }
}

async function getResolvedUrl(url: string): Promise<string> {
  try {
    const data: any = await request.get(url);
    return data?.request?.url ?? '';
  } catch (error) {
    logger.error(error);
  }
  return url;
}
