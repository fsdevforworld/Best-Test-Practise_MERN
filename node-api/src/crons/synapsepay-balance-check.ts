import loomisClient, { SynapseDisburserNodeId } from '@dave-inc/loomis-client';
import { dogstatsd } from '../lib/datadog-statsd';
import Constants from '../domain/synapsepay/constants';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';
import { parseLoomisSynapseDisburserBalance } from '../services/loomis-api/helper';

const logSource = 'crons/synapse-balance-check';
/**
 * This job checks for balances in Dave's various SynapsePay nodes, and moves funds into
 * nodes that are below the minimum threshhold.
 */
export async function main() {
  dogstatsd.increment('synapsepay_balance_check.job_triggered');

  const loomisResponseFees = await loomisClient.synapsePayGetDisburserBalance(
    SynapseDisburserNodeId.Fee,
  );
  const accountBalanceForFees = parseLoomisSynapseDisburserBalance(loomisResponseFees, logSource);

  dogstatsd.gauge('synapse_balance_check.fee_node_balance', accountBalanceForFees, {
    node_id: Constants.SYNAPSEPAY_FEE_NODE_ID,
  });

  logger.info(`Current synapse account balance for fee node: ${accountBalanceForFees}`);
}

export const SynapsepayBalanceCheck: Cron = {
  name: DaveCron.SynapsepayBalanceCheck,
  process: main,
  schedule: '*/15 * * * *',
  startingDeadlineSeconds: 120,
};
