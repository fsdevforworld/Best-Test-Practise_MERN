import * as Bluebird from 'bluebird';
import { get } from 'lodash';

import { BankingDataSource } from '@dave-inc/wire-typings';

import { NotSupportedError } from '../../lib/error';
import { BankAccount, User } from '../../models';
import SynapsepayNodeLib from './node';

export async function updateSynapseNodeId(bankAccount: BankAccount, user: User, ip: string) {
  const bankConnection = await bankAccount.getBankConnection();
  // synapse nodes are not required for bank of dave users
  if (bankConnection.bankingDataSource === BankingDataSource.BankOfDave) {
    return;
  }
  let synapseNodeId: string;
  try {
    synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount, { ip });
  } catch (e) {
    // catches 400 Bad Request where user already has 2 synapsepay nodes
    // deletes existing synapsepay nodes before attempting to create a new one
    if (get(e, 'response.text', '').includes('Platform not allowed to add any more nodes')) {
      const synapseNodes = await SynapsepayNodeLib.getAllSynapsePayNodes(user);
      await Bluebird.all(synapseNodes.map(node => node.deleteAsync()));
      synapseNodeId = await SynapsepayNodeLib.createSynapsePayNode(user, bankAccount, { ip });
    } else {
      throw e;
    }
  }

  if (!synapseNodeId) {
    throw new NotSupportedError('Bank account not supported');
  } else {
    bankAccount.synapseNodeId = synapseNodeId;
  }
}
