import { createClient } from '@dave-inc/heath-client';
import * as config from 'config';

const googleProjectId = config.get<string>('googleCloud.projectId');
const {
  domain: heathDomain,
  migratedServiceName: heathMigratedDomain,
  balanceLogTopic,
  balanceLogServiceDomain,
  batchedFetchBatchSize,
  bankTransactionTopic,
  maxSockets,
} = config.get<{
  domain: string;
  migratedServiceName: string;
  balanceLogTopic: string;
  balanceLogServiceDomain: string;
  batchedFetchBatchSize: number;
  bankTransactionTopic: string;
  maxSockets: number;
}>('heath');

const HeathClient = createClient({
  heathDomain,
  heathMigratedDomain,
  balanceLogTopic,
  bankTransactionTopic,
  googleProjectId,
  balanceLogServiceDomain,
  batchedFetchBatchSize,
  maxSockets,
});

export default HeathClient;
