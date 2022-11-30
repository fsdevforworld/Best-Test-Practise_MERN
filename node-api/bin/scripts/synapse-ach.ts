/* tslint:disable:no-console no-unused-expression */

/*
 *
 * SYNAPSEPAY_DISBURSING_NODE_ID=foo USER_IP=192.168.1.65\
 *     synapse-ach.ts disburse --userId [user-id] --bankAccountId [bank-account-id] --amount [amount]
 *
 * SYNAPSEPAY_USER_FINGERPRINT_SECRET=XXXXXXXXXXXx \
 * SYNAPSEPAY_RECEIVING_NODE_ID=foo \
 *     synapse-ach.ts charge   --userId [user-id] --bankAccountId [bank-account-id] --amount [amount]
 * Options:
 *   --force                              [boolean] [default: false]
 *   --userId                             [number] [required] The Dave user ID that owns the account
 *   --bankAccountId                      [number] [required] The ID of the bank account to disburse to / collect from
 *   --amount                             [number] [required] [default: 0.01]
 *
 */

import * as readline from 'readline';
import * as config from 'config';
import * as uuid from 'uuid';
import { omitBy } from 'lodash';
import yargs from 'yargs';
import SynapseDisburse from '../../src/domain/payment-provider/synapsepay/gateway';
import { retrieve } from '../../src/domain/collection/charge-bank-account';
import { ExternalTransactionProcessor } from '@dave-inc/wire-typings';
import { PaymentProviderTransactionType } from '../../src/typings';
import { inspect } from 'util';
import { BankAccount, User } from '../../src/models';
import { isNil, pick } from 'lodash';
import { updateSynapseNodeId } from '../../src/domain/synapsepay/nodeupdate';

interface IArguments {
  referenceId?: string;
  amount?: number;
  userId?: number;
  bankAccountId?: number;
  isSameDay?: boolean;
}

const userIp = process.env.USER_IP;

const isSecret = (_value: string, key: string) => key.indexOf('Secret') !== -1;
let synapseConfig: any = config.get('synapsepay');
synapseConfig = omitBy(synapseConfig, isSecret);

async function disburse({ userId, amount, referenceId, bankAccountId }: IArguments) {
  if (userId === undefined) {
    throw new Error('Missing userId');
  }

  if (bankAccountId === undefined) {
    throw new Error('Missing bank account ID');
  }

  const [user, bankAccount] = await Promise.all([
    User.findByPk(userId),
    BankAccount.findByPk(bankAccountId),
  ]);

  if (isNil(bankAccount.synapseNodeId)) {
    console.log('Creating synapseNodeId for this account');
    await updateSynapseNodeId(bankAccount, user, userIp);
    await bankAccount.save();
  }

  const { synapseNodeId } = bankAccount;

  console.log('Creating Disbursement', { referenceId, amount });
  return await SynapseDisburse.createTransaction({
    type: PaymentProviderTransactionType.AdvanceDisbursement,
    sourceId: synapseNodeId,
    referenceId,
    amount,
  });
}

async function charge({ userId, amount, referenceId, bankAccountId, isSameDay }: IArguments) {
  if (userId === undefined) {
    throw new Error('Missing userId');
  }

  if (bankAccountId === undefined) {
    throw new Error('Missing bank account ID');
  }

  const [user, bankAccount] = await Promise.all([
    User.findByPk(userId),
    BankAccount.findByPk(bankAccountId),
  ]);

  if (isNil(user)) {
    throw new Error(`Could not load user ${userId}`);
  }

  if (isNil(bankAccount)) {
    throw new Error(`Could not load bank account ${bankAccountId}`);
  }

  if (bankAccount.userId !== userId) {
    throw new Error(
      `This is not right, userId = ${userId} bankAccount.userId=${bankAccount.userId}`,
    );
  }

  console.log('Creating Charge', {
    referenceId,
    amount,
    synapseConfig,
    synapseNodeId: bankAccount.synapseNodeId,
    ...pick(user, ['legacyId', 'synapsepayId']),
  });
  return retrieve(bankAccount, referenceId, user, ExternalTransactionProcessor.Synapsepay, amount, {
    isSameDay,
  });
}

async function awaitUserConfirmation() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`Running with Synapse Configuration Options:
${JSON.stringify(synapseConfig, null, 2)}
    `);

  return new Promise((resolve: any, reject: any) => {
    rl.question('y to continue\n', answer => {
      if (answer !== 'y') {
        rl.close();
        return reject();
      }
      rl.close();
      return resolve();
    });
  });
}

async function main(): Promise<void> {
  const args = yargs(process.argv.slice(2))
    .command('disburse', 'Disburse from one node to another', _args => {
      return _args
        .options({
          userId: { type: 'number', demand: true },
          bankAccountId: { type: 'number', demand: true },
          amount: { type: 'number', default: 0.01, demand: true },
        })
        .usage('$0 --receivingNodeId [node-id] --amount [amount]');
    })
    .command('charge', 'Charge from one node to another', _args => {
      return _args.options({
        amount: { type: 'number', default: 0.01, demand: true },
        userId: { type: 'number', demand: true },
        bankAccountId: { type: 'number', demand: true },
        isSameDay: { type: 'boolean', default: false },
      });
    })
    .options({
      force: { type: 'boolean', default: false },
      referenceId: { type: 'string', default: uuid.v4() },
    }).argv;

  const command = args._[0];

  if (!args.force) {
    await awaitUserConfirmation().catch(() => {
      console.log('Canceling..');
      process.exit();
    });
  }

  let result;
  try {
    switch (command) {
      case 'disburse':
        result = await disburse(args);
        console.log(result);
        process.exit();
      case 'charge':
        result = await charge(args);
        console.log(result);
        process.exit();
      default:
        console.error('Invalid Command');
        throw new Error('Invalid Command');
    }
  } catch (error) {
    console.error(`Failed to ${command}`, { error: inspect(error, false, 4) });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
