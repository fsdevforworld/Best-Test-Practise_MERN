import * as config from 'config';
import client from '../../src/lib/plaid';
import {
  addAccountAndRoutingToAccounts,
  upsertBankAccounts,
} from '../../src/domain/banking-data-sync';
import * as request from 'supertest';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import {
  Advance,
  BankAccount,
  BankConnection,
  Institution,
  SubscriptionBilling,
  User,
  UserSession,
} from '../../src/models';
import * as Tasks from '../../src/jobs/data';
import { SUBSCRIPTION_COLLECTION_TRIGGER } from '../../src/domain/collection';
import factory from '../factories';
import * as tabapay from '../../src/lib/tabapay';
import * as util from 'util';
import * as childProcess from 'child_process';
import AdvanceCollectionAttempt from '../../src/models/advance-collection-attempt';
import SubscriptionCollectionAttempt from '../../src/models/subscription-collection-attempt';

export const STAGING_URL = config.get('dave.api.url');

export async function addPlaidBankAccount(bankConnection: BankConnection, amount: number = 10000) {
  const token = await client.sandboxPublicTokenCreate('ins_1', ['auth'], {
    override_username: 'user_custom',
    override_password: JSON.stringify({
      override_accounts: [
        {
          starting_balance: amount,
          type: 'depository',
          subtype: 'checking',
          meta: {
            name: 'Checking Name 1',
          },
          numbers: {
            account: '1234567890',
            ach_routing: '121000358',
          },
        },
      ],
    }),
  });
  const item = await client.exchangePublicToken(token.public_token);
  await bankConnection.update({ authToken: item.access_token, externalId: item.item_id });
  const bankAccounts = await upsertBankAccounts(bankConnection);
  await addAccountAndRoutingToAccounts(bankConnection, bankAccounts);

  return bankAccounts[0];
}

export async function createTabapayCard(user: User, bankAccount: BankAccount) {
  const cardNumber = '9400111999999990';
  const bin = cardNumber.substring(0, 6);
  const expiration = moment().add(4, 'month');
  const mask = cardNumber.substring(cardNumber.length - 4);
  const zipCode = '90019';
  const optedIntoDaveRewards = false;

  const encryptionKeyResponse = await request(STAGING_URL)
    .get('/v2/encryption_key')
    .set('Authorization', user.id.toString())
    .set('X-Device-Id', user.id.toString())
    .set('X-App-Version', '2.12.0')
    .send();

  const { key, keyId } = encryptionKeyResponse.body;

  const tabapayEncryptedCard = await tabapay.encrypt(cardNumber, expiration, '123', key);

  const paymentMethodResponse = await request(STAGING_URL)
    .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
    .set('Authorization', user.id.toString())
    .set('X-Device-Id', user.id.toString())
    .set('X-App-Version', '2.12.0')
    .send({
      tabapayEncryptedCard: {
        keyId,
        encryptedCardData: tabapayEncryptedCard.encrypted,
      },
      bin,
      mask,
      expirationMonth: expiration.format('MM'),
      expirationYear: expiration.format('YYYY'),
      zipCode,
      optedIntoDaveRewards,
    });

  await bankAccount.reload();

  return paymentMethodResponse.body;
}

export async function setupBankAccount() {
  const institution = await Institution.findOne();
  const institutionId = institution ? institution.id : null;
  const bankConnection: BankConnection = await factory.create('bank-connection', {
    institutionId,
  });
  const bankAccount = await addPlaidBankAccount(bankConnection);

  await factory.create('bank-transaction', {
    bankAccountId: bankAccount.id,
    userId: bankAccount.userId,
    transactionDate: moment().format(),
  });

  const user = await bankAccount.getUser();

  const paymentMethod = await factory.create('payment-method', {
    bankAccountId: bankAccount.id,
    userId: user.id,
  });
  bankAccount.defaultPaymentMethodId = paymentMethod.id;

  return { bankAccount, user, paymentMethod };
}

export async function runAdvanceCollection(advance: Advance, fakeHour?: number) {
  const exec = util.promisify(childProcess.exec);

  // I hate publishing this way, but I couldn't publish to staging another way, someone better should fix it
  let jsonString = `"{ \\"advanceId\\": ${advance.id}`;

  if (fakeHour) {
    jsonString += `, \\"time\\": \\"${moment()
      .hour(fakeHour)
      .format()}\\"`;
  }
  jsonString += '}"';

  const command = `gcloud pubsub topics publish staging_collect-advance --message ${jsonString}`;
  await exec(command);

  const startTime = moment();
  let collectionAttempt: AdvanceCollectionAttempt = null;
  while (!collectionAttempt || collectionAttempt.processing) {
    collectionAttempt = await AdvanceCollectionAttempt.findOne({
      where: {
        advanceId: advance.id,
      },
    });

    if (moment().diff(startTime, 'minutes') > 2) {
      throw new Error('Timed out waiting for advance to process');
    }
  }

  return collectionAttempt;
}

export async function runSubscriptionCollection(
  subscriptionBilling: SubscriptionBilling,
  time?: Moment,
) {
  await Tasks.collectPastDueSubscriptionTask({
    userId: subscriptionBilling.userId,
    trigger: SUBSCRIPTION_COLLECTION_TRIGGER.DAILY_JOB,
    shouldSkipBalanceCheck: false,
    time,
  });

  const startTime = moment();
  let collectionAttempt: SubscriptionCollectionAttempt = null;
  while (!collectionAttempt || collectionAttempt.processing) {
    collectionAttempt = await SubscriptionCollectionAttempt.findOne({
      where: {
        subscriptionBillingId: subscriptionBilling.id,
      },
    });

    if (moment().diff(startTime, 'minutes') > 2) {
      throw new Error('Timed out waiting for subscription to process');
    }
  }

  return collectionAttempt;
}

export async function fetchExternalTransactions(externalId: string, transactionType: string) {
  // use an admin user in order to fetch external transactions via our own api
  const adminUserSession = await UserSession.findAll({
    where: {
      userId: 21,
      deviceType: 'admin_web',
    },
  });

  // get the latest admin user session
  const adminUser = adminUserSession[adminUserSession.length - 1];

  // fetch external transactions
  const externalTransactionRequest = await request(STAGING_URL)
    .get(
      `/dashboard/external_transaction/search?transactionType=${transactionType}&externalId=${externalId}`,
    )
    .set('Authorization', adminUser.token)
    .set('X-Device-Id', adminUser.deviceId)
    .set('X-App-Version', '2.12.0');

  return externalTransactionRequest.body;
}

export async function setupUser(user: User, setSynapsepayId: boolean) {
  const randomPhoneNumber = Math.floor(Math.random() * 8888889) + 1111111;

  if (setSynapsepayId) {
    await user.update({
      allowDuplicateCard: true,
      phoneNumber: `+1949${randomPhoneNumber}`,
    });
  } else {
    await user.update({
      allowDuplicateCard: true,
      phoneNumber: `+1949${randomPhoneNumber}`,
      synapsepayId: null,
    });
  }

  return user;
}

export async function setSynapseNodeId(bankAccount: BankAccount) {
  const synapseNodeId = Math.random()
    .toString(36)
    .substring(2, 15);

  await bankAccount.update({
    synapseNodeId,
  });

  return bankAccount;
}
