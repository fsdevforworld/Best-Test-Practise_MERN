import { getSimpleLogger, LOG_LEVEL } from '@dave-inc/logger';
import * as config from 'config';

const additionalRestrictedKeys = [
  /account[_]?number/i,
  /authorization/i,
  /auth[_]?token/i,
  /synapsepay[_]?id/i,
  /^metroName/i,
  /^streetAddress/i,
  /^phone$/i,
  /^postal[_]?code$/i,
  /^legal_names$/i,
  /^nickname$/i,
];

const options = {
  cluster: config.get('k8s.cluster') as string,
  level: config.get('k8s.logLevel') as LOG_LEVEL,
  name: config.get('k8s.name') as string,
  namespace: config.get('k8s.namespace') as string,
  nodeEnv: config.get('k8s.environment') as string,
  nodeName: config.get('k8s.nodeName') as string,
  projectId: config.get('googleCloud.projectId') as string,
  additionalRestrictedKeys,
  ddTraceAgentHostName: config.get<string>('datadog.traceAgentHostname'),
  serviceName: config.get<string>('services.name'),
};

const logger = getSimpleLogger(options);

export default logger;
