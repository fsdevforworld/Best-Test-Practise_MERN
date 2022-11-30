/* tslint:disable:no-console no-unused-expression */

/*
 * TABAPAY_SUBSCRIPTION_SUB_ID=123 \
 *   tabapay-subscription-debit-charge.ts charge --paymentMethodId [payment-method-id] --amount [amount]
 * Options:
 *   --paymentMethodId                    [number] [required]
 *   --amount                             [number] [required] [default: 0.01]
 *
 */

import * as uuid from 'uuid';
import yargs from 'yargs';
import { isNil } from 'lodash';
import { inspect } from 'util';
import { PaymentMethod } from '../../src/models';
import { retrieve } from '../../src/lib/tabapay';

const TABAPAY_MAX_REFERENCE_ID_LENGTH = 15;

interface IArguments {
  paymentMethodId: number;
  amount: number;
  referenceId: string;
}

async function charge({ paymentMethodId, amount, referenceId }: IArguments) {
  const paymentMethod = await PaymentMethod.findByPk(paymentMethodId);

  if (isNil(paymentMethod)) {
    throw new Error(`Could not load payment-method ${paymentMethodId}`);
  }

  if (isNil(paymentMethod.tabapayId)) {
    throw new Error('Missing tabapayId');
  }

  const isSubscription = true;

  console.log('Creating Charge', {
    referenceId,
    amount,
  });
  return retrieve(referenceId, paymentMethod.tabapayId, amount, isSubscription, paymentMethod.bin);
}

async function main(): Promise<void> {
  const args = yargs(process.argv.slice(2)).options({
    referenceId: {
      type: 'string',
      coerce: val => val.slice(0, TABAPAY_MAX_REFERENCE_ID_LENGTH),
      default: uuid
        .v4()
        .replace(/-/g, '')
        .slice(0, TABAPAY_MAX_REFERENCE_ID_LENGTH),
    },
    amount: { type: 'number', default: 0.01, demand: true },
    paymentMethodId: { type: 'number', demand: true },
  }).argv;

  console.log(args);

  let result;
  try {
    result = await charge(args);
    console.log(result);
  } catch (error) {
    console.error({ error: inspect(error, false, 4) });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
