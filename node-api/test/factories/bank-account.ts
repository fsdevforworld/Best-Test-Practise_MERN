import { BankAccountSubtype, BankAccountType, MicroDeposit } from '@dave-inc/wire-typings';
import * as Faker from 'faker';
import { BankAccount } from '../../src/models';

const options = {
  afterBuild: (model: any, attrs: any, buildOptions: any) => {
    if (typeof model.bankConnectionId !== 'number' && model.bankConnectionId) {
      model.userId = model.userId || model.bankConnectionId.userId;
      model.institutionId = model.bankConnectionId.institutionId;
      model.bankConnectionId = model.bankConnectionId.id;
    }

    return model;
  },
};

export default function(factory: any) {
  factory.define(
    'bank-account',
    BankAccount,
    {
      synapseNodeId: () => Faker.random.alphaNumeric(20),
      bankConnectionId: factory.assoc('bank-connection'),
      institutionId: factory.assoc('institution', 'id'),
      externalId: () => Faker.random.alphaNumeric(20),
      displayName: () => Faker.company.companyName(),
      current: 0,
      available: 0,
      type: BankAccountType.Depository,
      microDeposit: null,
      mainPaycheckRecurringTransactionId: null,
    },
    options,
  );

  factory.extend(
    'bank-account',
    'checking-account',
    {
      subtype: BankAccountSubtype.Checking,
      lastFour: () => Math.floor(1000 + Math.random() * 9000),
      accountNumber: accountNumberSandwich(6),
      accountNumberAes256: accountNumberSandwich(3),
    },
    options,
  );

  factory.extend(
    'bank-account',
    'savings-account',
    {
      subtype: BankAccountSubtype.Savings,
      lastFour: () => Math.floor(1000 + Math.random() * 9000),
      accountNumber: accountNumberSandwich(6),
      accountNumberAes256: accountNumberSandwich(3),
    },
    options,
  );

  factory.extend(
    'bank-account',
    'bod-checking-account',
    {
      bankConnectionId: factory.assoc('bank-of-dave-bank-connection'),
      lastFour: () => Math.floor(1000 + Math.random() * 9000),
      microDeposit: MicroDeposit.COMPLETED,
      subtype: BankAccountSubtype.Checking,
    },
    options,
  );
}

function accountNumberSandwich(digits: number) {
  return () => {
    const num = accountNumber(digits);
    return num + '|' + num;
  };
}

function accountNumber(numDigits: number) {
  const digits = '0123456789';
  const output = [];
  for (let i = 0; i < numDigits; i++) {
    output.push(digits[Math.floor(Math.random() * 10)]);
  }
  return output.join('');
}
