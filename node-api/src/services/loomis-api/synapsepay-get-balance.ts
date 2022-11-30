import { Request, Response } from 'express';
import { SynapseDisburserNodeId } from '@dave-inc/loomis-client';
import Constants from '../../domain/synapsepay/constants';
import SynapsepayNodeLib from '../../domain/synapsepay/node';
import { get } from 'lodash';
import { NotFoundError } from '../../lib/error';

const {
  SYNAPSEPAY_DISBURSING_NODE_ID,
  SYNAPSEPAY_DISBURSING_USER_ID,
  SYNAPSEPAY_DISBURSING_USER_FINGERPRINT,
  SYNAPSEPAY_FEE_NODE_ID,
  SYNAPSEPAY_RECEIVING_NODE_ID,
} = Constants;
async function getTargetNode(targetNode: SynapseDisburserNodeId): Promise<Node> {
  let synapseNodeId: string;
  switch (targetNode) {
    case SynapseDisburserNodeId.Disbursing:
      synapseNodeId = SYNAPSEPAY_DISBURSING_NODE_ID;
      break;
    case SynapseDisburserNodeId.Fee:
      synapseNodeId = SYNAPSEPAY_FEE_NODE_ID;
      break;
    case SynapseDisburserNodeId.Receiving:
      synapseNodeId = SYNAPSEPAY_RECEIVING_NODE_ID;
      break;
    default:
      throw new NotFoundError(`Invalid target node: ${targetNode}`);
  }

  return SynapsepayNodeLib.getSynapsePayNode(
    { synapsepayId: SYNAPSEPAY_DISBURSING_USER_ID },
    { synapseNodeId },
    { fingerPrint: SYNAPSEPAY_DISBURSING_USER_FINGERPRINT },
  );
}

export async function getDisburserBalance(req: Request, res: Response) {
  const { targetNode } = req.params;
  const node = await getTargetNode(targetNode);
  return res.json({ balance: get(node, 'json.info.balance.amount') });
}
