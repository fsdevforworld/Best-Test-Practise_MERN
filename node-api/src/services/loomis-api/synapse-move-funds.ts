import ErrorHelper from '@dave-inc/error-helper';
import { SynapseDisburserNodeId } from '@dave-inc/loomis-client';
import { Request, Response } from 'express';
import { dogstatsd } from '../../lib/datadog-statsd';
import Constants from '../../domain/synapsepay/constants';
import SynapsepayNodeLib from '../../domain/synapsepay/node';
import logger from '../../lib/logger';
import { Node } from 'synapsepay';
import { helpers, transactions } from '../../domain/synapsepay';
import { InvalidParametersError } from '../../lib/error';

const {
  SYNAPSEPAY_DISBURSING_NODE_ID,
  SYNAPSEPAY_DISBURSING_USER_ID,
  SYNAPSEPAY_DISBURSING_USER_FINGERPRINT,
  SYNAPSEPAY_FEE_NODE_ID,
  SYNAPSEPAY_RECEIVING_NODE_ID,
} = Constants;

async function moveFunds(fromNode: Node, toNode: Node, amount: number): Promise<boolean> {
  const availableBalance = fromNode.json.info.balance.amount;

  dogstatsd.increment('synapsepay.dave_account_balance', Number(availableBalance * 100));

  const note = `Moving ${amount} from ${fromNode.json.info.nickname} to ${toNode.json.info.nickname}`;
  if (availableBalance < amount) {
    logger.error(`Error ${note}. Available balance ${availableBalance} less than amount ${amount}`);
    return false;
  }
  const createPayload = {
    to: {
      type: toNode.json.type,
      id: toNode.json._id,
    },
    amount: {
      amount,
      currency: 'USD',
    },
    extra: {
      same_day: false,
      note,
      ip: helpers.getUserIP(),
    },
    fees: [
      {
        fee: 0,
        note: 'Transfer fee',
        to: {
          id: Constants.SYNAPSEPAY_FEE_NODE_ID,
        },
      },
    ],
  };
  try {
    await transactions.createAsync(fromNode, createPayload);
  } catch (err) {
    dogstatsd.increment('synapsepay_balance_check.error_transferring_funds');
    logger.error('Error moving funds', ErrorHelper.logFormat(err));
    return false;
  }
  dogstatsd.increment('synapsepay_balance_check.funds_successfully_transferred');
  return true;
}

async function getDestinationNode(targetNode: SynapseDisburserNodeId): Promise<Node> {
  let synapseNodeId: string;
  switch (targetNode) {
    case SynapseDisburserNodeId.Disbursing:
      synapseNodeId = SYNAPSEPAY_DISBURSING_NODE_ID;
      break;
    case SynapseDisburserNodeId.Fee:
      synapseNodeId = SYNAPSEPAY_FEE_NODE_ID;
      break;
    default:
      throw new InvalidParametersError(`Invalid target node: ${targetNode}`);
  }

  return SynapsepayNodeLib.getSynapsePayNode(
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  );
}

export async function moveFundsFromDisburser(req: Request, res: Response) {
  const { targetNode } = req.params;
  const { amount } = req.body;

  if (isNaN(amount)) {
    throw new InvalidParametersError(`Invalid amount: ${amount}`);
  }

  const destinationNode = await getDestinationNode(targetNode);
  const receivingNode = await SynapsepayNodeLib.getSynapsePayNode(
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId: SYNAPSEPAY_RECEIVING_NODE_ID },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  );

  const ok = await moveFunds(receivingNode, destinationNode, amount);
  return res.json({ ok });
}
