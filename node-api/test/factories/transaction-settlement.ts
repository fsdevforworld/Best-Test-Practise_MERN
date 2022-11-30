import { TransactionSettlement } from '../../src/models';
import * as Faker from 'faker';
import { sample } from 'lodash';
import { TransactionSettlementStatus, TransactionSettlementType } from '@dave-inc/wire-typings';
import { TransactionSettlementSource } from '../../src/typings/external-transaction';

export default function(factory: any) {
  factory.define('transaction-settlement', TransactionSettlement, {
    externalId: () => Faker.random.uuid(),
    type: () => sample([TransactionSettlementType.Disbursement, TransactionSettlementType.Payment]),
    status: () =>
      sample([
        TransactionSettlementStatus.Canceled,
        TransactionSettlementStatus.Chargeback,
        TransactionSettlementStatus.Completed,
        TransactionSettlementStatus.Error,
        TransactionSettlementStatus.Pending,
        TransactionSettlementStatus.Representment,
      ]),
    amount: () => Faker.random.number(80),
    sourceId: () => Faker.random.number(1000000),
    sourceType: TransactionSettlementSource.Advance,
  });
}
