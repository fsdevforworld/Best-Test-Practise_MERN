import { BankAccountType } from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import { flatten, uniqBy } from 'lodash';
import { BankAccount, BankConnection, Institution, User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import {
  serializeMany,
  bankAccountSerializers,
  bankConnectionSerializers,
} from '../../serializers';
import { serializeBankAccount } from '../../serializers/bank-account';
import { serializeBankConnection } from '../../serializers/bank-connection';

async function getBankAccounts(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<
    bankAccountSerializers.IBankAccountResource[],
    bankConnectionSerializers.IBankConnectionResource
  >,
) {
  const bankAccounts = await BankAccount.findAll({
    where: { userId: req.resource.id, type: BankAccountType.Depository },
    include: [
      { model: BankConnection, include: [Institution], paranoid: false },
      { model: User, paranoid: false },
    ],
    paranoid: false,
    order: [['created', 'DESC']],
  });

  const bankConnections = uniqBy(flatten(bankAccounts.map(acc => acc.bankConnection)), 'id');

  const serializedBankConnections = await serializeMany(bankConnections, serializeBankConnection);

  const data = await Bluebird.map(bankAccounts, async bankAccount => {
    const connection = serializedBankConnections.find(
      bankConnection => bankConnection.id === bankAccount.bankConnectionId.toString(),
    );
    return serializeBankAccount(bankAccount, {
      'bank-connection': connection,
    });
  });

  const included = [...serializedBankConnections];

  const response = {
    data,
    included,
  };

  return res.send(response);
}

export default getBankAccounts;
