import { expect } from 'chai';
import * as request from 'supertest';
import { clean } from '../../test-helpers';
import app from '../../../src/services/loomis-api';
import factory from '../../factories';
import { BankAccountSubtype, PaymentMethodResponse } from '@dave-inc/wire-typings';
import {
  BankAccount as LoomisBankAccount,
  BankAccountType,
  PaymentMethod as LoomisPaymentMethod,
  PaymentMethodType,
} from '@dave-inc/loomis-client';
import { paymentMethodModelToType } from '../../../src/typings';
import { BankAccount, BankConnection, PaymentMethod, User } from '../../../src/models';

describe('Loomis Get Payment Methods API', () => {
  before(() => clean());

  function encodeDebitCard(debitCard: PaymentMethod): LoomisPaymentMethod {
    return {
      universalId: `DEBIT:${debitCard.id}`,
      validAchAccount: false,
      isDaveBanking: false,
      bankAccount: {
        institutionId: debitCard.bankAccount.institutionId,
      } as LoomisBankAccount,
      type: PaymentMethodType.DEBIT_CARD,
      ...paymentMethodModelToType(debitCard),
    };
  }

  function decodeDebitCard(debitCard: Record<string, unknown>): LoomisPaymentMethod {
    const result: Record<string, unknown> = {};
    const dateFields = ['created', 'updated', 'deleted', 'expiration'];
    Object.keys(debitCard).map(key => {
      if (dateFields.includes(key) && debitCard[key] !== null) {
        result[key] = new Date(debitCard[key] as string);
      } else {
        result[key] = debitCard[key];
      }
    });

    return result as LoomisPaymentMethod;
  }

  it('should throw for invalid user ID', async () => {
    await request(app)
      .get('/services/loomis_api/payment_methods/pelican')
      .send()
      .expect(400)
      .then(response => {
        expect(response.body.type).to.eq('invalid_parameters');
        expect(response.body.message).to.contain('Must pass a valid user ID');
      });
  });

  it('should return an empty result when user does not exist', async () => {
    await request(app)
      .get('/services/loomis_api/payment_methods/1234')
      .send()
      .expect(200)
      .then(response => expect(response.body).to.deep.equal([]));
  });

  it('should return an empty result when user exists with no payment methods', async () => {
    const user = await factory.create('user');

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .send()
      .expect(200)
      .then(response => expect(response.body).to.deep.equal([]));
  });

  it('should return a payment method when one exists', async () => {
    const user = await factory.create('user');
    const { id: bankAccountId } = await factory.create('bank-account');
    const { id } = await factory.create('payment-method', {
      userId: user.id,
      bankAccountId,
      displayName: 'MasterPelicanVisa',
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const debitCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .send()
      .expect(200)
      .then(response => {
        expect(response.body.length).to.equal(1);
        expect(decodeDebitCard(response.body[0])).to.deep.equal(encodeDebitCard(debitCard));
      });
  });

  it('should not return payment methods for another user', async () => {
    const pelican = await factory.create('user');
    const llama = await factory.create('user');
    await factory.create('payment-method', {
      userId: llama.id,
      empyrCardId: null,
      displayName: 'Llama Card',
      optedIntoDaveRewards: false,
      zipCode: '90210',
    });
    const { id } = await factory.create('payment-method', {
      userId: pelican.id,
      displayName: 'Pelican Express',
      empyrCardId: null,
      optedIntoDaveRewards: true,
      zipCode: '12345',
    });
    const pelicanCard = await PaymentMethod.findByPk(id, { include: [BankAccount] });

    await request(app)
      .get(`/services/loomis_api/payment_methods/${pelican.id}`)
      .send()
      .expect(200)
      .then(response =>
        expect(response.body.map(decodeDebitCard)).to.deep.equal([encodeDebitCard(pelicanCard)]),
      );
  });

  it("should return all of a user's payment methods", async () => {
    const user = await factory.create('user');
    await factory.create('payment-method', {
      userId: user.id,
      displayName: 'MasterPelican',
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
      mask: '1234',
    });
    await factory.create('payment-method', {
      userId: user.id,
      displayName: 'PelicanVisa',
      empyrCardId: null,
      optedIntoDaveRewards: false,
      zipCode: '90210',
      mask: '9876',
    });

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .send()
      .expect(200)
      .then(response => {
        const masks = response.body.map((card: PaymentMethodResponse) => card.displayName).sort();
        expect(masks).to.deep.equal(['MasterPelican', 'PelicanVisa']);
      });
  });

  it('should return both debit cards and bank accounts', async () => {
    const user = await factory.create('user');
    await Promise.all([
      factory.create('payment-method', {
        userId: user.id,
        displayName: 'DiscoverPelican',
        empyrCardId: null,
        optedIntoDaveRewards: false,
        zipCode: '90210',
        mask: '1234',
      }),
      factory.create('bank-account', {
        displayName: 'PelicanBank Checking',
        userId: user.id,
        subtype: BankAccountSubtype.Checking,
      }),
    ]);

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query('includeBankAccounts')
      .send()
      .expect(200)
      .then(response => {
        const masks = response.body.map((card: PaymentMethodResponse) => card.displayName).sort();
        expect(masks).to.deep.equal(['DiscoverPelican', 'PelicanBank Checking']);
      });
  });

  it('should return only bank accounts when a bank account id is provided', async () => {
    const user = await factory.create('user');
    const paymentMethods = await Promise.all([
      factory.create('payment-method', {
        userId: user.id,
        displayName: 'DiscoverPelican',
        empyrCardId: null,
        optedIntoDaveRewards: false,
        zipCode: '90210',
        mask: '1234',
      }),
      factory.create('bank-account', {
        displayName: 'PelicanBank Checking',
        subtype: BankAccountSubtype.Checking,
      }),
    ]);

    const bankAccount = paymentMethods[1];

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ paymentMethodIds: [`BANK:${bankAccount.id}`], includeBankAccounts: true })
      .send()
      .expect(200)
      .then(response => {
        expect(response.body[0]).to.contain({
          universalId: `BANK:${bankAccount.id}`,
          displayName: 'PelicanBank Checking',
          validAchAccount: true,
          isDaveBanking: false,
          bankAccountId: bankAccount.id,
          id: bankAccount.id,
        });
        expect(response.body[0].bankAccount).to.contain({
          institutionId: bankAccount.institutionId,
        });
      });
  });

  it('Should return Dave Banking accounts when queried for bank accounts', async () => {
    const user = await factory.create('user');
    const bankAccount = await factory.create('bod-checking-account');

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ paymentMethodIds: [`DAVE:${bankAccount.id}`], includeBankAccounts: true })
      .send()
      .expect(200)
      .then(response => {
        expect(response.body[0]).to.contain({
          universalId: `DAVE:${bankAccount.id}`,
          validAchAccount: true,
          isDaveBanking: true,
          bankAccountId: bankAccount.id,
          id: bankAccount.id,
        });
      });
  });

  it('should not return Dave Banking accounts when includeBankAccounts = false', async () => {
    const user = await factory.create('user');
    const bankAccount = await factory.create('bod-checking-account');

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ paymentMethodIds: [`DAVE:${bankAccount.id}`], includeBankAccounts: false })
      .send()
      .expect(200)
      .then(response => {
        expect(response.body).to.be.lengthOf(0);
      });
  });

  it('Should only return debit cards if includeBankAccounts=false', async () => {
    const user = await factory.create('user');
    const paymentMethods = await Promise.all([
      factory.create('payment-method', {
        userId: user.id,
        displayName: 'DiscoverPelican',
        empyrCardId: null,
        optedIntoDaveRewards: false,
        zipCode: '90210',
        mask: '1234',
      }),
      factory.create('bank-account', { displayName: 'PelicanBank Checking' }),
    ]);

    const debitCard = paymentMethods[0];

    await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ includeBankAccounts: false })
      .send()
      .expect(200)
      .then(response =>
        expect(response.body[0]).to.contain({
          universalId: `DEBIT:${debitCard.id}`,
          validAchAccount: false,
          isDaveBanking: false,
          id: debitCard.id,
        }),
      );
  });

  ['includeSoftDeleted=true', 'includeSoftDeleted', 'includeSoftDeleted=foo'].forEach(
    queryParam => {
      it(`returns soft deleted records when query param is ?${queryParam}`, async () => {
        const user = await factory.create<User>('user');
        const bankConnection = await factory.create<BankConnection>('bank-connection', {
          userId: user.id,
        });
        const bankAccount = await factory.create<BankAccount>('bank-account', {
          bankConnectionId: bankConnection.id,
          userId: user.id,
          subtype: BankAccountSubtype.Checking,
        });
        const debitCard = await factory.create<PaymentMethod>('payment-method', {
          bankAccountId: bankAccount.id,
          userId: user.id,
        });

        await Promise.all([bankConnection.destroy(), bankAccount.destroy(), debitCard.destroy()]);

        const { body: response }: { body: LoomisPaymentMethod[] } = await request(app)
          .get(`/services/loomis_api/payment_methods/${user.id}`)
          .query('includeBankAccounts=true')
          .query(queryParam)
          .expect(200);

        expect(response.length).to.equal(2);

        const debitCardResponse = response.find(
          result => result.type === PaymentMethodType.DEBIT_CARD,
        );
        expect(debitCardResponse.universalId).to.equal(`DEBIT:${debitCard.id}`);
        expect(debitCardResponse.deleted).to.be.string;

        const bankAccountResponse = response.find(
          result => result.type === PaymentMethodType.BANK_ACCOUNT,
        );
        expect(bankAccountResponse.universalId).to.equal(`BANK:${bankAccount.id}`);
        expect(bankAccountResponse.deleted).to.be.string;
      });
    },
  );

  [undefined, 'includeSoftDeleted=false'].forEach(queryParam => {
    it(`does not return soft deleted records when query param is ${queryParam}`, async () => {
      const user = await factory.create<User>('user');
      const bankAccount = await factory.create<BankAccount>('bank-account', { userId: user.id });
      const debitCard = await factory.create<PaymentMethod>('payment-method', {
        bankAccountId: bankAccount.id,
        userId: user.id,
      });

      await debitCard.destroy();

      const { body: response }: { body: LoomisPaymentMethod[] } = await request(app)
        .get(`/services/loomis_api/payment_methods/${user.id}`)
        .query(queryParam)
        .expect(200);

      expect(response.length).to.equal(0);
    });
  });

  it('returns active records when includeSoftDeleted=true', async () => {
    const user = await factory.create<User>('user');
    const bankAccount = await factory.create<BankAccount>('bank-account', {
      userId: user.id,
      subtype: BankAccountSubtype.Checking,
    });
    const debitCard = await factory.create<PaymentMethod>('payment-method', {
      bankAccountId: bankAccount.id,
      userId: user.id,
    });

    const { body: response }: { body: LoomisPaymentMethod[] } = await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ includeBankAccounts: true, includeSoftDeleted: true })
      .expect(200);

    expect(response.length).to.equal(2);

    const debitCardResponse = response.find(result => result.type === PaymentMethodType.DEBIT_CARD);
    expect(debitCardResponse.universalId).to.equal(`DEBIT:${debitCard.id}`);
    expect(debitCardResponse.deleted).to.be.string;

    const bankAccountResponse = response.find(
      result => result.type === PaymentMethodType.BANK_ACCOUNT,
    );
    expect(bankAccountResponse.universalId).to.equal(`BANK:${bankAccount.id}`);
    expect(bankAccountResponse.deleted).to.be.string;
  });

  it(`only returns ${BankAccountType.Depository} bank accounts with supported subtypes`, async () => {
    const user = await factory.create<User>('user');

    const [depositoryChecking, depositoryPrepaid, depositoryPrepaidDebit] = await Promise.all([
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Checking,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Prepaid,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.PrepaidDebit,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.Auto,
      }),
      factory.create<BankAccount>('bank-account', {
        userId: user.id,
        type: BankAccountType.Depository,
        subtype: BankAccountSubtype.MoneyMarket,
      }),
    ]);

    const { body: response }: { body: LoomisPaymentMethod[] } = await request(app)
      .get(`/services/loomis_api/payment_methods/${user.id}`)
      .query({ includeBankAccounts: true })
      .expect(200);

    expect(response.length).to.equal(3);

    const universalIds = response.map(r => r.universalId);
    expect(universalIds).to.include(`BANK:${depositoryChecking.id}`);
    expect(universalIds).to.include(`BANK:${depositoryPrepaid.id}`);
    expect(universalIds).to.include(`BANK:${depositoryPrepaidDebit.id}`);
  });
});
