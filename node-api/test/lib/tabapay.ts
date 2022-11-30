import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as nock from 'nock';
import * as sinon from 'sinon';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import { BaseApiError, PaymentProcessorError } from '../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import {
  agent,
  cancel,
  disburse,
  fetchAccount,
  isNetworkRC,
  retrieve,
  verifyCard,
  handleAVSResult,
  queryCard,
  shouldCreateMobileTransaction,
  TabapayQueryCardResponse,
} from '../../src/lib/tabapay';
import {
  ABTestingEvent,
  AuditLog,
  BankAccount,
  BankConnection,
  User,
  AVSLog,
} from '../../src/models';
import factory from '../factories';
import { ABTestingEventName } from '../../src/typings';
import { clean, replayHttp, TABAPAY_ACCOUNT_ID } from '../test-helpers';
import { CodeAVSResult, TabapayAVSResponse } from '@dave-inc/loomis-client';

describe('Tabapay', () => {
  const userTabapayId = TABAPAY_ACCOUNT_ID;

  const sandbox = sinon.createSandbox();

  afterEach(() => clean(sandbox));

  describe('disburse', () => {
    it(
      'returns a disbursement',
      replayHttp('tabapay/disburse-success.json', async () => {
        const referenceId = 'foo-bar-baz-bop';
        const disbursement = await disburse(referenceId, userTabapayId, 0.11);
        const approvalCode = '178321';
        const settlementNetwork = 'Visa';
        const networkId = '852497327';

        expect(disbursement.id).to.exist;
        expect(disbursement.status).to.equal(ExternalTransactionStatus.Completed);
        expect(disbursement.processor).to.equal(ExternalTransactionProcessor.Tabapay);
        expect(disbursement.network.approvalCode).to.equal(approvalCode);
        expect(disbursement.network.settlementNetwork).to.equal(settlementNetwork);
        expect(disbursement.network.networkId).to.equal(networkId);
      }),
    );

    it(
      'is pending when the resource status is UNKNOWN',
      replayHttp('tabapay/disburse-unknown-status.json', async () => {
        const referenceId = 'unknown-push';
        const disbursement = await disburse(referenceId, userTabapayId, 0.02);
        expect(disbursement.status).to.equal(ExternalTransactionStatus.Pending);
      }),
    );

    it(
      'throws a PaymentProcessorError when the resource status is ERROR',
      replayHttp('tabapay/disburse-error-status.json', async () => {
        use(() => chaiAsPromised);
        const referenceId = 'error-push';
        await expect(disburse(referenceId, userTabapayId, 0.01)).to.be.rejectedWith(
          PaymentProcessorError,
          'Card entry declined. Please check that your debit card information is correct and try again',
        );
      }),
    );
  });

  describe('retrieve', () => {
    it(
      'responds with the formatted payment',
      replayHttp('tabapay/retrieve-success.json', async () => {
        const referenceId = 'test-id-1';
        const payment = await retrieve(referenceId, userTabapayId, 0.11, false);
        expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
        expect(payment.id).to.exist;
      }),
    );

    it(
      'retries 3 times on connection timeouts',
      replayHttp(
        'tabapay/retrieve-success.json',
        async () => {
          const referenceId = 'test-id-1';
          const payment = await retrieve(referenceId, userTabapayId, 0.11, false);
          expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
          expect(payment.id).to.exist;
        },
        {
          before: () => {
            nock('https://api.sandbox.tabapay.net:10443')
              .post('/v1/clients/secret:tabapay-clientId_0001/transactions')
              .times(2)
              .replyWithError({
                code: 'ETIMEDOUT',
                errno: 'ETIMEDOUT',
                message: 'connect ETIMEDOUT 66.171.241.3:443',
                syscall: 'connect',
                hostname: 'tabapay.com',
              });
          },
        },
      ),
    );

    it(
      'is pending when the resource status is UNKNOWN',
      replayHttp('tabapay/retrieve-unknown-status.json', async () => {
        const referenceId = 'unknown-pull';
        const payment = await retrieve(referenceId, userTabapayId, 0.02, false);
        expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
      }),
    );

    // TODO: Remove this when we change subclientId to selectively use Subscription which requires possible account migration
    it(
      'isSubscription handled with recurring = false ',
      replayHttp('tabapay/retrieve-success-subscription.json', async () => {
        const referenceId = 'test-id-1';
        const payment = await retrieve(referenceId, userTabapayId, 0.2, true);
        expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
        expect(payment.id).to.exist;
      }),
    );

    it(
      'throws a PaymentProcessorError when the resource status is ERROR',
      replayHttp('tabapay/retrieve-error-status.json', async () => {
        use(() => chaiAsPromised);
        const referenceId = 'error-pull';
        await expect(retrieve(referenceId, userTabapayId, 0.01, false)).to.be.rejectedWith(
          PaymentProcessorError,
        );
      }),
    );

    it(
      'handles a corresponding push id',
      replayHttp('tabapay/retrieve-corresponding-id.json', async () => {
        const referenceId = 'test-id-3';
        const correspondingId = 'iv0SGbGEwEODctjpqSXvwQ';

        const payment = await retrieve(
          referenceId,
          userTabapayId,
          0.11,
          false,
          null,
          correspondingId,
        );

        expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
        expect(payment.id).to.exist;
      }),
    );

    it(
      'accepts a card token in place of a sourceAccountID',
      replayHttp('tabapay/retrieve-token.json', async () => {
        const referenceId = 'test-wp-1';
        const token =
          '0O6tG8YY9fL33Pi2ZfQobs7aMzx8ghEbuqCNfuiXMdhOwedKbTxfX-tvrxcRHIHYrHSLK6ZVpEsROSSsPGbN2HrCA0fYrje-ziOUMrv7dRpv0wyVX00Qr1tFMa4uxkGz6QZvXrZIWSLZ-Selqaiz8RIYLjvV5EINEMSmMNXk4uIYNcO1Jb_6hSWetgDD4tRCs5i9_tD6u1pz0-jpLuy11tNoe2nF0aLdM7yFN0PJG3AYprIJCl9UD1ZPSk4NT6RjxLfGz8lrqxLxVpXpv1TrNmtan1OKssyIIykEsUQAJRFaUqXnxboa276uFSAnQwUcJpXJM7Ta9hZ6N5BHxf1cAaQ';
        const accountInfo = { card: { token }, owner: { name: { first: 'Jim', last: 'Bob' } } };

        const payment = await retrieve(referenceId, accountInfo, 0.11, false);

        expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
        expect(payment.id).to.exist;
      }),
    );
  });

  describe('cancel', () => {
    it(
      'successfully reverses a pull transaction',
      replayHttp('tabapay/cancel-success.json', async () => {
        const pullTransactionId = 'gHg2F2jU2O3A6jAV4rptSg';
        await expect(cancel(pullTransactionId)).to.be.fulfilled;
      }),
    );

    it(
      'throws an error if there reversal fails',
      replayHttp('tabapay/cancel-error.json', async () => {
        use(() => chaiAsPromised);
        // see sandbox docs on how to create transaction that will return this error on delete
        const pullTransactionId = 'SDQXNe3VUM0ZHOqVduzxug';
        await expect(cancel(pullTransactionId)).to.be.rejectedWith(BaseApiError);
      }),
    );
  });

  describe('Tabapay.verifyCard', () => {
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

    it('records when Tabapay sends a Card Number error', async () => {
      const errorBody = {
        SC: 400,
        EC: '3C3E5261',
        EM: 'Card Number',
      };

      const tabapayCardError = {
        status: 400,
        response: {
          text: JSON.stringify(errorBody),
        },
      };

      sandbox.stub(agent, 'post').throws(tabapayCardError);
      const datadogStub = sandbox.stub(dogstatsd, 'increment');

      const user = await factory.create('user');

      try {
        await verifyCard(
          'bh87t899q8p3498up4guaq',
          '123',
          {
            name: { first: user.firstname, last: user.lastName },
          },
          user,
        );
      } catch {
        expect(datadogStub.callCount).to.equal(1);

        const matchingLog = await AuditLog.findOne({
          where: { userId: user.id, message: errorBody.EM },
        });

        expect(matchingLog).to.not.equal(null);
        expect(matchingLog.extra.data.EC).to.equal('3C3E5261');
      }
    });

    it('handles JSON parse errors', async () => {
      const tabapayCardError = {
        status: 400,
        response: {
          text: '<bacon>cheese<bacon/>',
        },
      };

      sandbox.stub(agent, 'post').throws(tabapayCardError);
      const user = await factory.create('user');

      await expect(
        verifyCard(
          'bh87t899q8p3498up4guaq',
          '123',
          {
            name: { first: user.firstname, last: user.lastName },
          },
          user,
        ),
      ).to.rejectedWith('Error parsing tabapay error json');
    });

    it('handles a not acceptable response from tabapay', async () => {
      const tabapayCardError = {
        message: 'Not Acceptable',
        status: 406,
        response: {
          text: '<cookie>chocolate chip<cookie/>',
        },
      };

      sandbox.stub(agent, 'post').throws(tabapayCardError);
      const user = await factory.create('user');

      await expect(
        verifyCard(
          'bh87t899q8p3498up4guar',
          '456',
          {
            name: { first: user.firstname, last: user.lastName },
          },
          user,
        ),
      ).to.rejectedWith(
        'Our payment processor encountered an error with this card. Please try again or try with another card.',
      );
    });

    it(
      'receives and logs AVS data if the user is in the experiment group',
      replayHttp('tabapay/add-card-avs.json', async () => {
        const cardNumber = '9401121999999998';

        const encryptedCardData =
          'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';

        const { bankAccount, user } = await setup({ cardNumber, encryptedCardData });
        await ABTestingEvent.create({
          userId: bankAccount.userId,
          eventName: ABTestingEventName.TabapayAVSExperiment,
        });

        await verifyCard(
          encryptedCardData,
          tabapayKey.keyId,
          {
            name: { first: user.firstName, last: user.lastName },
            address: { line1: '123 fake st', city: 'fakery', state: 'CA', zipcode: '90006' },
          },
          user,
        );

        const avsLog = await AVSLog.findOne({ where: { userId: user.id } });

        expect(avsLog.addressMatch).to.equal(true);
        expect(avsLog.cvvMatch).to.equal(true);
        expect(avsLog.zipMatch).to.equal(true);
      }),
    );

    it(
      'should be able to verify a card without passing in a user',
      replayHttp('tabapay/verify-card-without-user.json', async () => {
        const encryptedCardData =
          'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';

        const result = await verifyCard(encryptedCardData, tabapayKey.keyId, {
          name: { first: 'Muffin', last: 'Man' },
          address: { line1: '123 Drury Lane', city: 'Bakersfield', state: 'CA', zipcode: '93301' },
        });

        expect(result.network).to.equal('visa');
        expect(result.type).to.equal('debit');
        expect(result.availability).to.equal('immediate');
        expect(result.avsLogId).to.be.undefined;
      }),
    );

    it(
      'should create the correct entry in the AVSLog table for a failed AVS check',
      replayHttp('tabapay/add-card-avs-declined.json', async () => {
        const cardNumber = '9401121999999998';
        const encryptedCardData =
          'bklfQkzlmc-kXNEc-DvDsGW7QUs86jq3DfCgUKVZsj14FFKuDTsgbOi31Zv91hfYIPAQ9ACC2BoQxABdw7L2fe3dUG2sUtTVENJrJqVGM0Y1bxg4uQZX_yrDHAG-bAc0VPKXo-1YLjtbVyCDBakut1GIiG4zjddlhV-F4xRLSu9ddFmKhMk_7bd-y41hMKVbmBBWFU3tOrRgNVVmalDa2fOvG8tpTSqOFDOUwqGquULFC004aAYCICIRabnNSAV6zGu-kZh2CwYumMg71_Sv72XRUIeTLZIMAyf9XG35IBp56pYPQj0ATeD96bHE4Q5BV59VdviFE9_hHAJem4JQCA';

        const { bankAccount, user } = await setup({ cardNumber, encryptedCardData });

        await ABTestingEvent.create({
          userId: bankAccount.userId,
          eventName: ABTestingEventName.TabapayAVSExperiment,
        });

        await verifyCard(
          encryptedCardData,
          tabapayKey.keyId,
          {
            name: { first: user.firstName, last: user.lastName },
            address: { zipcode: '99992' },
          },
          user,
        );

        const avsLog = await AVSLog.findOne({ where: { userId: user.id } });

        expect(avsLog.addressMatch).to.equal(false);
        expect(avsLog.cvvMatch).to.equal(false);
        expect(avsLog.zipMatch).to.equal(false);
      }),
    );
  });

  describe('handleAVSResult', () => {
    it('should handle a successful AVS response', async () => {
      const user = await factory.create('user');
      const avsResponseSuccess: TabapayAVSResponse = {
        networkRC: '85',
        authorizeID: '194510',
        resultText: 'NOT DECLINED',
        codeAVS: CodeAVSResult.ZipAndAddressMatch,
        codeSecurityCode: 'M',
      };

      const avsLogId = await handleAVSResult(avsResponseSuccess, user);
      const avsLog = await AVSLog.findOne({ where: { id: avsLogId } });

      expect(avsLog.addressMatch).to.equal(true);
      expect(avsLog.cvvMatch).to.equal(true);
      expect(avsLog.zipMatch).to.equal(true);
    });

    it('should create the correct entry in the AVSLog table for an unsuccessful AVS response', async () => {
      const user = await factory.create('user');
      const avsResponseFailure: TabapayAVSResponse = {
        networkRC: '05',
        authorizeID: '194511',
        resultText: 'DECLINE',
        codeAVS: CodeAVSResult.NoMatch,
      };

      const avsLogId = await handleAVSResult(avsResponseFailure, user);
      const avsLog = await AVSLog.findOne({ where: { id: avsLogId } });

      expect(avsLog.addressMatch).to.equal(false);
      expect(avsLog.cvvMatch).to.equal(false);
      expect(avsLog.zipMatch).to.equal(false);
    });

    it('should create the correct entry in the AVSLog table for a valid codeAVS and a networkRC failure', async () => {
      const user = await factory.create('user');

      const avsResponseNetworkRCFailure: TabapayAVSResponse = {
        networkRC: '06',
        authorizeID: '194512',
        resultText: 'NOT DECLINED',
        codeAVS: CodeAVSResult.AddressMatch,
        codeSecurityCode: 'M',
      };

      const avsLogId = await handleAVSResult(avsResponseNetworkRCFailure, user);
      const avsLog = await AVSLog.findOne({ where: { id: avsLogId } });

      expect(avsLog.addressMatch).to.equal(true);
      expect(avsLog.cvvMatch).to.equal(true);
      expect(avsLog.zipMatch).to.equal(false);
    });

    it('should create the correct entry in the AVSLog table for an invalid codeAVS and a networkRC success', async () => {
      const user = await factory.create('user');

      const avsResponseCodeAVSInvalid: TabapayAVSResponse = {
        networkRC: '00',
        authorizeID: '194513',
        resultText: 'DECLINED',
        codeAVS: CodeAVSResult.Unknown,
      };

      const avsLogId = await handleAVSResult(avsResponseCodeAVSInvalid, user);
      const avsLog = await AVSLog.findOne({ where: { id: avsLogId } });

      expect(avsLog.addressMatch).to.equal(false);
      expect(avsLog.cvvMatch).to.equal(false);
      expect(avsLog.zipMatch).to.equal(false);
    });
  });

  describe('AVS check', () => {
    it(
      'will handle a successful Debit AVS check',
      replayHttp('lib/tabapay/avs-success.json', async () => {
        const owner = {
          name: { first: 'Pelly', last: 'Pelican' },
          address: {
            line1: '123 Pelican Row',
            city: 'Pelican City',
            state: 'CA',
            zipcode: '90006',
          },
        };

        const accountID = 'AfQW4HBFkSBi-i9r9na3Cw';
        const queryResult = await queryCard({
          owner,
          amount: '75.00',
          account: { accountID },
        });
        const shouldCreate = shouldCreateMobileTransaction(queryResult);
        expect(shouldCreate).to.be.true;
      }),
    );

    it(
      'will handle a "information not available" result',
      replayHttp('lib/tabapay/avs-info-na.json', async () => {
        const owner = {
          name: { first: 'Pelly', last: 'Pelican' },
          address: {
            line1: '123 Pelican Row',
            city: 'Pelican City',
            state: 'CA',
            zipcode: '99990',
          },
        };

        const accountID = 'AfQW4HBFkSBi-i9r9na3Cw';
        const queryResult = await queryCard({
          owner,
          amount: '75.00',
          account: { accountID },
        });
        const shouldCreate = shouldCreateMobileTransaction(queryResult);
        expect(shouldCreate).to.be.false;
      }),
    );

    it(
      'will handle a "AVS not available" result',
      replayHttp('lib/tabapay/avs-na.json', async () => {
        const owner = {
          name: { first: 'Pelly', last: 'Pelican' },
          address: {
            line1: '123 Pelican Row',
            city: 'Pelican City',
            state: 'CA',
            zipcode: '99991',
          },
        };

        const accountID = 'AfQW4HBFkSBi-i9r9na3Cw';
        const queryResult = await queryCard({
          owner,
          amount: '75.00',
          account: { accountID },
        });
        const shouldCreate = shouldCreateMobileTransaction(queryResult);
        expect(shouldCreate).to.be.false;
      }),
    );

    it(
      'will handle a "Zip Code was not matched, but Address was matched" result with a good networkRC',
      replayHttp('lib/tabapay/avs-zip-mismatch.json', async () => {
        const owner = {
          name: { first: 'Pelly', last: 'Pelican' },
          address: {
            line1: '123 Pelican Row',
            city: 'Pelican City',
            state: 'CA',
            zipcode: '99992',
          },
        };

        const accountID = 'AfQW4HBFkSBi-i9r9na3Cw';
        const queryResult = await queryCard({
          owner,
          amount: '75.00',
          account: { accountID },
        });
        const shouldCreate = shouldCreateMobileTransaction(queryResult);
        expect(shouldCreate).to.be.false;
      }),
    );

    it(
      'Will handle an address mismatch result',
      replayHttp('lib/tabapay/avs-address-mismatch.json', async () => {
        const owner = {
          name: { first: 'Pelly', last: 'Pelican' },
          address: {
            line1: '999 Bad Pelican Row',
            city: 'Pelican City',
            state: 'CA',
            zipcode: '99992',
          },
        };

        const accountID = 'AfQW4HBFkSBi-i9r9na3Cw';
        const queryResult = await queryCard({
          owner,
          amount: '75.00',
          account: { accountID },
        });
        const shouldCreate = shouldCreateMobileTransaction(queryResult);
        expect(shouldCreate).to.be.false;
      }),
    );

    it('Will handle a "Zip Code was not matched, but Address was matched" result with good networkRC', async () => {
      const avsResponse = {
        SC: 200,
        AVS: {
          networkRC: '000',
          codeAVS: 'A',
        },
      };

      const result = shouldCreateMobileTransaction(avsResponse as TabapayQueryCardResponse);
      expect(result).to.be.true;
    });

    it('will handle the case where the AVS block is not present in the response', async () => {
      const missingAVSResponse = {
        SC: 200,
      };

      const result = shouldCreateMobileTransaction(missingAVSResponse as TabapayQueryCardResponse);
      expect(result).to.be.false;
    });

    it('will handle the case where the AVS code is an empty string', async () => {
      const missingAVSResponse = {
        SC: 200,
        AVS: {
          networkRC: '00',
          codeAVS: '',
        },
      };

      const result = shouldCreateMobileTransaction(missingAVSResponse as TabapayQueryCardResponse);
      expect(result).to.be.false;
    });

    it('will handle the case where SC=207', async () => {
      const missingAVSResponse = {
        SC: 207,
        AVS: {
          networkRC: '00',
          codeAVS: 'Y',
        },
      };

      const result = shouldCreateMobileTransaction(missingAVSResponse as TabapayQueryCardResponse);
      expect(result).to.be.false;
    });
  });

  describe('fetchAccount', () => {
    it(
      'will try with sub client it if client id fails',
      replayHttp('lib/tabapay/fetch-account.json', async () => {
        const spy = sandbox.spy(agent, 'get');
        const tabapayId = 'QIcVQo9UAKRkIfH5wsHkeQ';
        const accountResponse = await fetchAccount(tabapayId);

        expect(spy.callCount).to.eq(2);

        expect(accountResponse.SC).to.eq(200);
        expect(accountResponse.referenceID).to.eq('eac6bbb49d87c7b');
      }),
    );

    it(
      'will return the correct account if found without trying the sub client',
      replayHttp('lib/tabapay/fetch-account-no-sub-client.json', async () => {
        const spy = sandbox.spy(agent, 'get');
        const tabapayId = 'wEsUcIJUgIodKBunVlAcAg';
        const accountResponse = await fetchAccount(tabapayId);

        expect(spy.callCount).to.eq(1);

        expect(accountResponse.SC).to.eq(200);
        expect(accountResponse.referenceID).to.eq('3cefc9b33345bbd');
      }),
    );

    it(
      'will try both client and sub client and error if account does not exist',
      replayHttp('lib/tabapay/fetch-account-not-found.json', async () => {
        const spy = sandbox.spy(agent, 'get');
        const tabapayId = 'idIDidIDidIDidID';
        const accountResponsePromise = fetchAccount(tabapayId);
        await expect(accountResponsePromise).to.be.rejectedWith('Not Found');
        expect(spy.callCount).to.eq(2);
      }),
    );
  });

  describe('isNetworkRC', () => {
    it('should determine if a string is a network RC', () => {
      expect(isNetworkRC('01')).to.be.true;
      expect(isNetworkRC('123')).to.be.true;
      expect(isNetworkRC('N8')).to.be.true;
      expect(isNetworkRC('-?')).to.be.false;
      expect(isNetworkRC('foobarbazquux')).to.be.false;
      expect(isNetworkRC('1')).to.be.false;
      expect(isNetworkRC('1234')).to.be.false;
    });
  });
});
