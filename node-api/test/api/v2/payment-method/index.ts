import { expect } from 'chai';
import { partial } from 'lodash';
import * as sinon from 'sinon';
import * as Tabapay from '../../../../src/lib/tabapay';
import * as request from 'supertest';
import factory from '../../../factories';
import { clean, replayHttp, up } from '../../../test-helpers';
import app from '../../../../src/api';
import * as RewardsHelper from '../../../../src/domain/rewards';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import { InvalidParametersError } from '../../../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import * as utils from '../../../../src/lib/utils';
import {
  AuditLog,
  BankAccount,
  BankConnection,
  Institution,
  PaymentMethod,
  User,
  UserSession,
} from '../../../../src/models';

describe('payment method endpoints', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  afterEach(() => clean(sandbox));

  describe('PATCH /v2/payment_method/:paymentMethodId', () => {
    let expectedUserSession: UserSession;
    let expectedBankAccount: BankAccount;

    beforeEach(async () => {
      await up();
      expectedBankAccount = await factory.create('bank-account');
      expectedUserSession = await factory.create('user-session', {
        userId: expectedBankAccount.userId,
      });
    });

    it('sets empyrCardId, optedIntoDaveRewards on PaymentMethod; empyrUserId on User', async () => {
      const expectedPaymentMethod = await factory.create('payment-method', {
        bankAccountId: expectedBankAccount.id,
        userId: expectedBankAccount.userId,
      });

      expect(expectedPaymentMethod.optedIntoDaveRewards).to.not.equal(true);

      await request(app)
        .patch(`/v2/payment_method/${expectedPaymentMethod.id}`)
        .set('Authorization', expectedUserSession.token)
        .set('X-Device-Id', expectedUserSession.deviceId)
        .set('X-App-Version', '2.6.0')
        .send({
          empyrCardId: 1234,
          empyrUserId: 5678,
          optedIntoDaveRewards: true,
        });

      await expectedPaymentMethod.reload();
      const userResult = await User.findOne({
        where: {
          id: expectedUserSession.userId,
        },
      });

      expect(userResult.empyrUserId).to.equal(5678);
      expect(expectedPaymentMethod.empyrCardId).to.equal(1234);
      expect(expectedPaymentMethod.optedIntoDaveRewards).to.equal(true);
    });
  });

  describe('POST /v2/bank_account/:bankAccountId/payment_method', () => {
    const refPrefix = '20191118';
    const tabapayKey = {
      keyId: 'yFAmO2KCCCihxVC3IAw_xg',
      key: `-----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj6IVrBb607BJollojgBLFe3J/ujmiFKifJYA/Dj/kns0kgfIQ1iuAl5icwpmIlOiQME0qgLFG/waIrRsLU//RUKfqqKez5guuSiSwvDCXAgTjJJQzvQAEHroGbrtvG2seFxyxuvASYM//2H8okeknFJItdQVpO7TSJifvjLHw+skvJkfCJon9/uEFV939Hjfx8lJC8Jeb2LLqJo7SCwFT79DPg3BtNf+fxkYvAaKjRxogavFI7x1TnfLMqWmqP58u8Zt+A0hdETxmJcH43XJtyzZ1E6CUY+3QHQ1/LHBBQpBGoy1AT3H4MjRJYJ+hNWr+7cwGHfwtO1iKip48KjKCQIDAQAB
        -----END PUBLIC KEY-----`,
      expiration: moment('2020-11-13T02:07:10Z'),
    };

    const setup = async ({
      cardNumber,
      encryptedCardData,
    }: {
      cardNumber: string;
      encryptedCardData: string;
    }) => {
      const user = await factory.create<User>('user', {
        firstName: 'Taurean',
        lastName: 'Nader',
        phoneNumber: '+14398241071',
      });

      const bankConnection = await factory.create<BankConnection>('bank-connection', {
        userId: user.id,
      });
      const bankAccount = await factory.create<BankAccount>('bank-account', {
        userId: user.id,
        bankConnectionId: bankConnection.id,
      });
      const cardData = {
        tabapayEncryptedCard: { keyId: tabapayKey.keyId, encryptedCardData },
        bin: cardNumber.slice(0, 6),
        mask: cardNumber.substring(cardNumber.length - 4),
        expirationMonth: 12,
        expirationYear: 2028,
      };

      return { user, bankConnection, bankAccount, cardData, cardNumber };
    };

    context('card has never been added to Dave before', () => {
      const cardNumber = '9401121999999998';
      const encryptedCardData =
        'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';
      const firstCardSetup = partial(setup, { cardNumber, encryptedCardData });
      const fixtureName = 'v2/payment-method/add-first-card.json';

      beforeEach(async () => {
        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns(`${refPrefix}001`);
      });

      it(
        'adds a card to a bank account with no previous cards',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData, user } = await firstCardSetup();
          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(200);

          const [paymentMethodCount] = await Promise.all([
            PaymentMethod.count({ where: { userId: user.id } }),
            bankAccount.reload(),
          ]);

          expect(paymentMethodCount).to.equal(1);
          expect(bankAccount.defaultPaymentMethodId).to.equal(response.body.paymentMethodId);
        }),
      );

      it(
        'adds a new card to a bank account an existing cards',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData, user } = await firstCardSetup();

          const existingCard = await factory.create<PaymentMethod>('payment-method', {
            tabapayId: 'foobar',
            bankAccountId: bankAccount.id,
            userId: user.id,
            optedIntoDaveRewards: false,
          });

          await bankAccount.update({ defaultPaymentMethodId: existingCard.id });

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(200);

          const [paymentMethodCount] = await Promise.all([
            PaymentMethod.count({ where: { userId: user.id } }),
            bankAccount.reload(),
          ]);

          expect(paymentMethodCount).to.equal(2);
          expect(bankAccount.defaultPaymentMethodId).to.equal(response.body.paymentMethodId);
        }),
      );

      it(
        'allows a GREEN DOT card if the bank account is GREEN DOT',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData, user } = await firstCardSetup();

          const greenDot = await factory.create<Institution>('institution', { id: 264064 });

          await bankAccount.update({ institutionId: greenDot.id });

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(200);

          const [paymentMethodCount] = await Promise.all([
            PaymentMethod.count({ where: { userId: user.id } }),
            bankAccount.reload(),
          ]);

          expect(paymentMethodCount).to.equal(1);
          expect(bankAccount.defaultPaymentMethodId).to.equal(response.body.paymentMethodId);
        }),
      );

      it(
        'unlinks the previous card from empry',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData, user } = await firstCardSetup();

          const deleteCardStub = sandbox.stub(RewardsHelper, 'deleteEmpyrCard');

          const existingCard = await factory.create<PaymentMethod>('payment-method', {
            tabapayId: 'foobar',
            bankAccountId: bankAccount.id,
            userId: user.id,
            optedIntoDaveRewards: true,
            empyrCardId: 1,
          });

          await bankAccount.update({ defaultPaymentMethodId: existingCard.id });

          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(200);

          expect(deleteCardStub.callCount).to.equal(1);
          expect(deleteCardStub.args[0][0].id).to.equal(existingCard.userId);
          expect(deleteCardStub.args[0][1]).to.equal(existingCard.id);
        }),
      );

      it(
        'saves optedIntoDaveRewards if supplied',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await firstCardSetup();

          const updatedCardData = {
            ...cardData,
            optedIntoDaveRewards: true,
          };

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(updatedCardData)
            .expect(200);

          const paymentMethod = await PaymentMethod.findByPk(response.body.paymentMethodId);

          expect(paymentMethod.optedIntoDaveRewards).to.equal(true);
        }),
      );

      // Note: The zipcode currently sent to tabapay is pulled from the user not
      // this payload.
      it(
        'saves zipCode if supplied',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await firstCardSetup();

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send({
              ...cardData,
              zipCode: '77494',
            })
            .expect(200);

          const paymentMethod = await PaymentMethod.findByPk(response.body.paymentMethodId);

          expect(paymentMethod.zipCode).to.equal('77494');
        }),
      );

      it(
        'saves a successful audit log entry',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await firstCardSetup();

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(200);

          const logCount = await AuditLog.count({
            where: {
              userId: bankAccount.userId,
              type: 'PAYMENT_METHOD_CREATE',
              successful: true,
              eventUuid: response.body.paymentMethodId,
            },
          });

          expect(logCount).to.equal(1);
        }),
      );
    });

    it(
      'allows a card to be added to the same user multiple times',
      replayHttp('v2/payment-method/add-card-multiple.json', async () => {
        const cardNumber = '9421112999999993';
        const { bankAccount, cardData, user } = await setup({
          cardNumber,
          encryptedCardData:
            'CIFz2GYiawq1e0A7y_4h3QyikaOvOtgAaNX9HLmukj3BRGMvLw9UBYE7oKJt7sWll91S_iUcd4N_SpbwnefS9hTM_u-mrCBjfd7ZhkdUz9TKgTeulbuDhqV3x7YTxs64wQ-5zmR_Hict-4rIwwCfDHqpIQooLXierRcErkpeLuWw6RN911C9upQ14lhkZQBmMO80-x2d-aLaQuVAHdYqommD0ewSJBDNvgWpL2JaveGhvkt0Pi3NV56NEOYXI2D8tpUyQGBbxmBhFfSmLORF_V--XV0NInOnM_0i_QD57uJM7JPulh561Jk3HG3XJmxMP_z2G6qq0L6IO8spZBrjrQ',
        });

        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns('8075351f8ed72cf')
          .onSecondCall()
          .returns('487e541fe97f5cf')
          .onThirdCall()
          .returns('bd5e9e3ed66eb58');

        await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData)
          .expect(200);

        const secondResponse = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData)
          .expect(200);

        const [paymentMethodCount] = await Promise.all([
          PaymentMethod.count({ where: { userId: user.id } }),
          bankAccount.reload(),
        ]);

        expect(paymentMethodCount).to.equal(2);
        expect(bankAccount.defaultPaymentMethodId).to.equal(secondResponse.body.paymentMethodId);
      }),
    );

    it(
      'allows a card to be added if the card phone number matches the user',
      replayHttp('v2/payment-method/duplicate-account.json', async () => {
        const cardNumber = '9401121999999998';
        const encryptedCardData =
          'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';

        const { bankAccount, cardData, user } = await setup({ cardNumber, encryptedCardData });

        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns('b368bc7d29599f9')
          .onSecondCall()
          .returns('3d6e080365463db');

        const response = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData)
          .expect(200);

        const [paymentMethodCount] = await Promise.all([
          PaymentMethod.count({ where: { userId: user.id } }),
          bankAccount.reload(),
        ]);

        expect(paymentMethodCount).to.equal(1);
        expect(bankAccount.defaultPaymentMethodId).to.equal(response.body.paymentMethodId);
      }),
    );

    it(
      'does not allow a card to be added if the card does not belong to the user',
      replayHttp('v2/payment-method/reject-duplicate-account.json', async () => {
        const cardNumber = '9401121999999998';
        const encryptedCardData =
          'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';

        const { bankAccount, cardData, user } = await setup({ cardNumber, encryptedCardData });

        await user.update({
          phoneNumber: '+12813308890',
          firstName: 'Peyton',
          lastName: 'Manning',
        });

        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns('8eab2bebc15980f');

        await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData)
          .expect(409);
      }),
    );

    it(
      `properly records the card's availability`,
      replayHttp('v2/payment-method/next-day-avail.json', async () => {
        const cardNumber = '9020112999999998';
        const encryptedCardData =
          'U3cpC7AHTAT1cWHmLdm0yAg5_lwEt8AvgE2i0m1u9we5wLgNDriMATawwME9WJEkBCYePq3Qqao8qMJLcUYaYaqJOjXFp4zcMWaEuVdf59wX4nHubxyCGwgxRQqQpMCeDjPym0wdTLUwg-TrICsnc7ey1qIB63JELhOZV3OwzZ8Ztc-y3RlElRpF4MBw3lENMsWuUn7RTRkjU6y0VEa_HGLGUWnX0xmKe_FDKMeqjb7purLbjITN0YwCRR__0QzFgEfCQZKbOPrT2Af8xFu81EZSdBW4Lx3Gymsv-ZTN86PA_vxN7nrSW4bDKTqHd5l8DRD8qzxWhR1H-QhLWbJa7A';

        const { bankAccount, cardData } = await setup({ cardNumber, encryptedCardData });

        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns('1950b492855da7b');

        const response = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData)
          .expect(200);

        const paymentMethod = await PaymentMethod.findByPk(response.body.paymentMethodId);

        expect(paymentMethod.availability).to.equal('next business day');
      }),
    );

    context('prepaid card', () => {
      const cardNumber = '9030311999999994';
      const encryptedCardData =
        'gQORjYn2ZlHIei4dY4pnxGbTDfYivhbus1iEDwz6fs02rkISubEXLwPBc36NEsT_6dvor0wlyp1sRAj_2WR0NHrmyzzGMPL9QLwgtwQDTljwdXsuL0iTBYMfINSMFSMGRpNE262BynXCZJAzVTTyoBBJ2D3GF92wiIYCTDKeukmm5o9ckEAti3PZ7VXKWUiAJ1v8JYvuSjq4j-oAOE_Qd8Ix02smuN3T7bjxPB2srsEtqtSKMcve6GBR2zvpkFW_evuIaI23c-wfeD4FM1AmYAzWwcMWcRpPM8GLZNT0zTd3_e9C8fs_twUyxJnlk2SMgXkL2QtKpynIql5vbqEt4w';
      const cardSetup = partial(setup, { cardNumber, encryptedCardData });
      const fixtureName = 'v2/payment-method/prepaid-card.json';

      beforeEach(async () => {
        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns(`${refPrefix}001`);
      });

      ['PREPAID', 'PREPAID_DEBIT'].forEach(subtype => {
        it(
          `adds the card if the bank account subtype is ${subtype}`,
          replayHttp(fixtureName, async () => {
            const { bankAccount, cardData, user } = await cardSetup();

            await bankAccount.update({ subtype });

            const response = await request(app)
              .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
              .set('Authorization', `${bankAccount.userId}`)
              .set('X-Device-Id', `${bankAccount.userId}`)
              .set('X-App-Version', '2.6.0')
              .send(cardData)
              .expect(200);

            const [paymentMethodCount] = await Promise.all([
              PaymentMethod.count({ where: { userId: user.id } }),
              bankAccount.reload(),
            ]);

            expect(paymentMethodCount).to.equal(1);
            expect(bankAccount.defaultPaymentMethodId).to.equal(response.body.paymentMethodId);
          }),
        );
      });

      it(
        `does not add the card if the bank account subtype is CHECKING`,
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await cardSetup();

          await bankAccount.update({ subtype: 'CHECKING' });
          const datadogStub = sandbox.spy(dogstatsd, 'increment');
          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(400);
          expect(response.body.message).to.match(/Card type does not match account type/);
          expect(response.body.data).to.deep.equal({
            bin: cardData.bin,
            institutionId: bankAccount.institutionId,
            verificationType: 'prepaid',
            matchAccountSubtype: 'CHECKING',
          });
          sinon.assert.calledWithExactly(
            datadogStub,
            'payment_method.create_error.card_type_mismatch',
            {
              bin: cardData.bin,
              institution_id: `${bankAccount.institutionId}`,
              verification_type: 'prepaid',
              match_account_subtype: 'CHECKING',
            },
          );
        }),
      );

      it(
        'adds a prepaid card on a checking account for Walmart/Green Dot',
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await cardSetup();

          const greenDot = await factory.create('institution', {
            id: 264064,
          });

          await bankAccount.update({
            subtype: 'CHECKING',
            institutionId: greenDot.id,
          });

          await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send({
              ...cardData,
              bin: '437303', // Green Dot bin
            })
            .expect(200);
        }),
      );
    });

    context('credit card', () => {
      const cardNumber = '9030211999999996';
      const encryptedCardData =
        'Kn6QSothcob43P1Ahw6l64pVY_dh-4LAfsTeKGObps0AdLH_GVR0n1m27f11AshkVSFb5JJYsYtMTC3Z0Y6AFH8cbx0B3N3XfO4EiJDLYiuLAxq7XJfpUnf2zYxGRn4Rot-GmBsrPpKwnOYlm3e2w7mdW6HcGTCEPFHnuEK1ulJOobOmk_i4Vr6Y3i7xuhFFzbowztiYzSA8U9W0lXLj0smYpwcxzeNMkrFWLqTF2MfSwmtBdFRGZp_CiKxh4-7CA9dMdcIbwACqMtukwhR-cv_RYuH-G8fE3YlBxk2rmavYDdJfe9S3CqIKvZTnKgqW8njj_NRKBbZsKn-aFJFQgA';
      const cardSetup = partial(setup, { cardNumber, encryptedCardData });
      const fixtureName = 'v2/payment-method/credit-card.json';

      beforeEach(async () => {
        sandbox
          .stub(utils, 'generateRandomHexString')
          .onFirstCall()
          .returns(`${refPrefix}005`);
      });

      it(
        `does not add credit cards`,
        replayHttp(fixtureName, async () => {
          const { bankAccount, cardData } = await cardSetup();

          const response = await request(app)
            .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
            .set('Authorization', `${bankAccount.userId}`)
            .set('X-Device-Id', `${bankAccount.userId}`)
            .set('X-App-Version', '2.6.0')
            .send(cardData)
            .expect(400);

          expect(response.body.message).to.match(/Unsupported card type/);
        }),
      );
    });

    it('requires X-App-Version < 2.6.0', async () => {
      const bankAccount = await factory.create<BankAccount>('bank-account');

      const result = await request(app)
        .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
        .set('Authorization', `${bankAccount.userId}`)
        .set('X-Device-Id', `${bankAccount.userId}`)
        .set('X-App-Version', '2.5.0')
        .send({});

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/Please update/);
    });

    it(
      'does not add cards with an invalid card number',
      replayHttp('v2/payment-method/invalid-card.json', async () => {
        const cardNumber = '1030211999999996';
        const encryptedCardData =
          'iV5vDVaNHLbABGpQUuB2VExI6TVJ0tQaFhQJuUNmutdgRKOLhyQMG0vmLzK3F--e_GNtKyVGWrH_HUcHOX9lI7aT3B9Kv6RDZrIQPDlN9LtaND48RpxW_mwfqN2Z9O5srqInx09JXbS9skd0vTLNClQ41lZccIpmNBP8xS2WYvsOTmLdjVxpgQC5O0m4x1MjxpU_fSyjZW2XplGeQRcOFeKdMEo_Tf1wJ5bW0YZCh0EtBYdN2Rfvj1vlNnFhtW2t0ZiZoRxUJVfMOIsZhqWgy9Gt5_9wGex6-0JwtJK2mXRe1j0MBpsuGmkVEP8w5hsOJDeaoa5Z0XrGA7KVmzTS6A';
        const { cardData, bankAccount, user } = await setup({ cardNumber, encryptedCardData });

        await user.update({
          firstName: 'Jesus',
          lastName: 'Stoltenberg',
          phoneNumber: '+13643057722',
        });

        const result = await request(app)
          .post(`/v2/bank_account/${bankAccount.id}/payment_method`)
          .set('Authorization', `${bankAccount.userId}`)
          .set('X-Device-Id', `${bankAccount.userId}`)
          .set('X-App-Version', '2.6.0')
          .send(cardData);

        expect(result.status).to.equal(400);
        expect(result.body.message).to.match(
          /Please check that you entered the correct card number/,
        );
      }),
    );
  });

  describe('POST /v2/verify_card', () => {
    it('should return success for a valid card', async () => {
      const user = await factory.create('user');
      sandbox.stub(Tabapay, 'verifyCard').resolves({});

      const result = await request(app)
        .post(`/v2/verify_card`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .set('X-App-Version', '2.6.0')
        .send({
          tabapayEncryptedCard: { keyId: 'abc', encryptedCardData: 'def' },
          firstName: 'Thomas',
          lastName: 'the Tank Engine',
          zipCode: '0',
        });

      expect(result.status).to.equal(200);
      expect(result.body).to.deep.equal({ success: true });
    });

    it('should not return success when card validation fails', async () => {
      const user = await factory.create('user');
      sandbox.stub(Tabapay, 'verifyCard').rejects(new InvalidParametersError('no good'));

      const result = await request(app)
        .post(`/v2/verify_card`)
        .set('Authorization', user.id)
        .set('X-Device-Id', user.id)
        .set('X-App-Version', '2.6.0')
        .send({
          tabapayEncryptedCard: { keyId: 'abc', encryptedCardData: 'def' },
          firstName: 'Thomas',
          lastName: 'the Tank Engine',
          zipCode: '0',
        });

      expect(result.status).to.equal(400);
      expect(result.body.message).to.match(/no good/);
      expect(result.body.type).to.equal('invalid_parameters');
    });
  });
});
