import { Op } from 'sequelize';
import * as config from 'config';
import { sample, random, capitalize } from 'lodash';
import factory from '../../../../test/factories';
import logger from '../../../../src/lib/logger';
import * as Faker from 'faker';
import * as tabapay from '../../../../src/lib/tabapay';
import { moment } from '@dave-inc/time-lib';
import { addCardToTabapay } from '../../../../src/domain/payment-method';
import { TabapayKey } from '../../../../src/models';
import { DonationOrganizationCode } from '@dave-inc/wire-typings';

// Card info from https://developers.tabapay.com/
// Samples -> Test Cards
const testCards = [
  { cardNumber: '4000056655665556', availability: 'immediate', network: 'visa' },
  { cardNumber: '4005519200000004', availability: 'immediate', network: 'visa' },
  { cardNumber: '4012000077777777', availability: 'immediate', network: 'visa' },
  { cardNumber: '4000004840008001', availability: 'next business day', network: 'visa' },
  { cardNumber: '4500600000000061', availability: 'few business days', network: 'visa' },
  { cardNumber: '4242424242424242', availability: 'few business days', network: 'visa' },
  { cardNumber: '2223000048400011', availability: 'immediate', network: 'mastercard' },
  { cardNumber: '5200828282828210', availability: 'immediate', network: 'mastercard' },
  { cardNumber: '5105105105105100', availability: 'immediate', network: 'mastercard' },
  { cardNumber: '6011111111111117', availability: 'immediate', network: 'discover' },
  { cardNumber: '6011000991300009', availability: 'immediate', network: 'discover' },
];

// note that these are not run as part of the dev seed script. Here's how to:
// https://www.loom.com/share/068c93403d5c4ea09bfcf77c62928672
// https://www.loom.com/share/dda05c3d531043599e19efdc90b17ae8
async function up() {
  const firstName = 'Advance Repayment';
  const lastName = Faker.name.lastName();
  const email = Faker.internet.email(firstName, lastName);

  const user = await factory.create('user', {
    firstName,
    lastName,
    email,
    allowDuplicateCard: true,
  });

  const { cardNumber, availability, network } = sample(testCards);
  const expiration = moment().add(2, 'year');
  const mask = cardNumber.substring(cardNumber.length - 4);

  let keyData = await TabapayKey.findOne({
    where: {
      expiration: { [Op.gt]: moment().add(1, 'hour') },
    },
    order: [['expiration', 'DESC']],
  });

  if (!keyData) {
    // To run locally grab key data from the staging database and add to
    // your `config/local-dev.json`
    const tabapayKeyConfigPath = 'tabapay.encryptionKey';

    keyData = await factory.create<TabapayKey>('tabapay-key', {
      keyId: config.get(`${tabapayKeyConfigPath}.keyId`),
      key: config.get(`${tabapayKeyConfigPath}.key`),
    });
  }

  const bankConnection = await factory.create('bank-connection', {
    userId: user.id,
    hasValidCredentials: true,
    hasTransactions: true,
  });

  const bankAccount = await factory.create('checking-account', {
    userId: user.id,
    institutionId: bankConnection.institutionId,
    bankConnectionId: bankConnection.id,
    current: 500,
    available: 500,
  });

  const { encrypted, referenceId } = tabapay.encrypt(
    cardNumber,
    expiration,
    `${random(1, 1000000)}`,
    keyData.key,
  );

  const tabapayId = await addCardToTabapay({
    referenceId,
    encryptedCard: encrypted,
    keyId: keyData.keyId,
    user,
  });

  const paymentMethod = await factory.create('payment-method', {
    availability,
    bankAccountId: bankAccount.id,
    tabapayId,
    displayName: `${capitalize(network)}: ${mask}`,
    expiration,
    mask,
    scheme: network,
    userId: user.id,
    bin: cardNumber.slice(0, 6),
  });

  await bankAccount.update({ defaultPaymentMethodId: paymentMethod.id });

  const amount = 75;
  const created = moment().subtract(4, 'days');
  const processor = 'TABAPAY';

  const advance = await factory.create('advance', {
    amount,
    bankAccountId: bankAccount.id,
    created,
    delivery: 'EXPRESS',
    disbursementStatus: 'COMPLETED',
    disbursementProcessor: processor,
    network,
    outstanding: amount,
    paymentMethodId: paymentMethod.id,
    updated: created,
    userId: user.id,
  });

  await factory.create('advance-tip', {
    advanceId: advance.id,
    donationOrganization: DonationOrganizationCode.TREES,
    amount: 1.0,
  });

  logger.info('created advance repayment user', {
    userId: user.id,
  });
}

if (require.main === module) {
  up()
    .then(() => process.exit())
    .catch(ex => {
      logger.error('Failed to seed advance repayment', { error: ex });
      process.exit(1);
    });
}
