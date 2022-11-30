import {
  DataEngineClient,
  Event,
  getStagingConfig,
  ClientConfig,
} from '@dave-inc/data-engine-client';
import { max, flatMap } from 'lodash';
import { isStagingEnv, isTestEnv } from '../../lib/utils';
import { wrapMetrics } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { moment, Moment } from '@dave-inc/time-lib';

function getClientConfig(): ClientConfig {
  // TODO: update once production events are supported
  return getStagingConfig();
}

const ENTITY = 'user';
const SOURCE = 'advance-approval';
const VERSION = 'v1';

enum EventNames {
  Requested = 'request',
  Approved = 'approved',
  Rejected = 'rejected',
}

enum Metrics {
  Succeeded = 'advance_approval.data_engine.publish_succeeded',
  Failed = 'advance_approval.data_engine.publish_failed',
}

const metrics = wrapMetrics<Metrics>();

interface IApprovalDetails {
  id: number;
  approved: boolean;
  bankAccountId: number;
  approvedAmounts: number[];
  primaryRejectionReason?: { type: string };
  created: string;
}

function doPublishEvents() {
  return isStagingEnv() || isTestEnv();
}

export async function publishApprovalEvents(
  userId: number,
  approvalResults: IApprovalDetails[],
): Promise<void> {
  if (!doPublishEvents()) {
    return;
  }

  try {
    const events = flatMap(approvalResults, buildEvents);
    const client = new DataEngineClient(getClientConfig());

    await client.publishEventMessage({
      entity: ENTITY,
      id: `${userId}`,
      source: SOURCE,
      events,
    });

    metrics.increment(Metrics.Succeeded);
  } catch (error) {
    metrics.increment(Metrics.Failed);
    logger.error('Failed to publish approval to data engine', {
      error,
      approvalIds: approvalResults.map(approval => approval.id),
    });
  }
}

function buildEvents(approval: IApprovalDetails): [Event, Event] {
  const createdAt = moment(approval.created);
  return [buildRequestedEvent(approval, createdAt), buildApprovalResultEvent(approval, createdAt)];
}

function buildRequestedEvent(approval: IApprovalDetails, createdAt: Moment): Event {
  return {
    field: EventNames.Requested,
    subEntities: { 'bank-account': `${approval.bankAccountId}` },
    value: true,
    version: VERSION,
    timestampMs: createdAt.valueOf(),
  };
}

function buildApprovalResultEvent(approval: IApprovalDetails, createdAt: Moment): Event {
  if (approval.approved) {
    const maxApprovedAmount = max(approval.approvedAmounts);
    return {
      field: EventNames.Approved,
      subEntities: { 'bank-account': `${approval.bankAccountId}` },
      value: maxApprovedAmount,
      version: VERSION,
      timestampMs: createdAt.valueOf(),
    };
  }

  return {
    field: EventNames.Rejected,
    subEntities: { 'bank-account': `${approval.bankAccountId}` },
    value: approval.primaryRejectionReason?.type,
    version: VERSION,
    timestampMs: createdAt.valueOf(),
  };
}
