import * as Bluebird from 'bluebird';

import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { TransactionSettlementSource } from '../../src/typings';
import factory from '../../test/factories';
import { TransactionSettlement } from '../../src/models';

export async function up() {
  const payment = await factory.create('payment', { referenceId: '789' });
  await factory.create('transaction-settlement', {
    type: TransactionSettlementType.Payment,
    sourceType: TransactionSettlementSource.Payment,
    status: TransactionSettlementStatus.Chargeback,
    sourceId: payment.id,
  });
}

export async function down() {
  const payments = await TransactionSettlement.findAll({
    where: {
      type: TransactionSettlementType.Payment,
    },
  });

  await Bluebird.map(payments, payment => payment.destroy({ force: true }));
}
