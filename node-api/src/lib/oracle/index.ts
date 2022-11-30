import { isEmpty } from 'lodash';
import { ScoringApi } from '@dave-inc/oracle-client';

import * as config from 'config';

export interface IOracleConfig {
  version: { major: number; minor: number; tag?: string };
  timeout: number;
}

const ORACLE_BASE_URL = config.get('services.oracle.baseUrl');

/**
 * Builds client to interact with oracle - dave's machine learning service
 * Configured to connect to the corresponding versioned k8s service
 *
 * @param {{ major: number, minor: number }} version
 * @param {number} timeout
 * @returns {ScoringApi}
 */
export default function oracleClient({ version, timeout }: IOracleConfig): ScoringApi {
  return new ScoringApi(
    { baseOptions: { timeout } },
    getHostWithVersion({
      major: version.major,
      minor: version.minor,
      tag: version.tag,
    }),
  );
}

/**
 * Builds the host for the oracle API based on the provided versioning
 *
 * Oracle has a versioned deployment system - the exposing k8s services follow this naming convention:
 *
 * oracle-v{MAJOR}-{MINOR}
 *
 * They are also exposed via ingress - https://oracle.trydave.com/v1.0/
 * but using service names allows us to stay within the k8s cluster
 *
 * Ex:
 * - version v1.0 deployment is exposed via service oracle-v1-0
 * - version v1.1 deployment is exposed via service oracle-v1-1
 *
 * @param {number} major
 * @param {number} minor
 * @returns {string}
 */
export function getHostWithVersion({
  major,
  minor,
  tag,
}: {
  major: number;
  minor: number;
  tag?: string;
}): string {
  // TODO:
  // barf, this is just unnecessary complexity, in the future
  // change this to just a simple version string
  let host = `${ORACLE_BASE_URL}-v${major}-${minor}`;
  if (!isEmpty(tag)) {
    host += `-${tag}`;
  }
  return host;
}

export * from './contracts';
