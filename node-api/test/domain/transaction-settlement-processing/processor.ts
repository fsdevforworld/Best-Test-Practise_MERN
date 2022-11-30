import { expect } from 'chai';
import * as sinon from 'sinon';
import { FileInfo } from 'ssh2-sftp-client';
import { moment } from '@dave-inc/time-lib';
import {
  ExternalTransactionProcessor,
  ExternalTransactionStatus,
  TransactionSettlementType,
} from '@dave-inc/wire-typings';
import { processChargebackData } from './processing-chargebacks';
import { genChargebackData, genDisbursementData } from './test-helpers';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import * as Jobs from '../../../src/jobs/data';
import {
  paymentUpdateEvent,
  tabapayChargebackEvent,
  transactionSettlementUpdateEvent,
} from '../../../src/domain/event';
import * as Notification from '../../../src/domain/notifications';
import { Chargebacks, Processor } from '../../../src/domain/transaction-settlement-processing';
import { TransactionSettlementProcesingMetrics } from '../../../src/domain/transaction-settlement-processing/metrics';
import {
  ITransactionSettlementParser,
  SettlementParserType,
} from '../../../src/domain/transaction-settlement-processing/interface';
import logger from '../../../src/lib/logger';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import {
  Advance,
  TransactionSettlement,
  TransactionSettlementProcessedFile,
} from '../../../src/models';
import { TransactionSettlementStatus } from '@dave-inc/wire-typings';
import { ParsedCSVRow } from '../../../src/typings';

describe('Processor', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean(sandbox));
  afterEach(() => clean(sandbox));

  const chargebacks = new Chargebacks();
  const chargebackProcessor = new Processor(chargebacks);

  function createMockParser({
    amount = '75',
    externalId = 'blah',
    settlementType,
    status = TransactionSettlementStatus.Completed,
    approvalCode: approvalCodeParam = null,
    network: networkParam = null,
    networkId: networkIdParam = null,
  }: {
    amount?: string;
    externalId?: string;
    settlementType: TransactionSettlementType;
    status?: TransactionSettlementStatus;
    approvalCode?: string;
    network?: string;
    networkId?: string;
  }): ITransactionSettlementParser {
    return {
      settlementParserType: SettlementParserType.TabapayDirect,
      sftpConfig: { host: 'blah', port: 0, username: 'foo', directory: 'bar' },
      externalTransactionProcessor: ExternalTransactionProcessor.Tabapay,
      saveToDatabase: true,
      saveToGcloud: false,
      filterFileNames: (f: FileInfo[]) => Promise.resolve(f),
      convert: () => {
        return {
          externalId,
          status,
          originalDate: moment(),
          amount,
          settlementType,
          fullName: 'Fooh Bear',
          lastFour: '5555',
          approvalCode: approvalCodeParam,
          network: networkParam,
          networkId: networkIdParam,
        };
      },
      markFileAsProcessed: () => {
        return;
      },
    };
  }
  const fileDate = '20191015';
  const createFile = (fileName: string = `1000_400001_${fileDate}_chargebacks_v2-4.csv`) => {
    return {
      type: 'blah',
      name: fileName,
      size: 123,
      modifyTime: 123,
      accessRights: 1,
      accessTime: 1,
      rights: { user: 'ellie', group: 'badasses', other: 'darealest' },
      owner: 1,
      group: 1,
    } as FileInfo;
  };

  const file = createFile();

  const approvalCode = genDisbursementData({})['Approval Code'];
  const network = genDisbursementData({})['Settlement Network'];
  const networkId = genDisbursementData({})['Network ID'];

  beforeEach(() => {
    sandbox.stub(Jobs, 'broadcastPaymentChangedTask');
    sandbox.stub(paymentUpdateEvent, 'publish');
    sandbox.stub(tabapayChargebackEvent, 'publish');
    sandbox.stub(transactionSettlementUpdateEvent, 'publish');
    sandbox.stub(Processor.prototype, 'isTransactionFileDataStale').returns(false);
  });

  describe('#processData', () => {
    context('functionality that is independent of data type', () => {
      it('adds an entry for the transaction if it does not exist', async () => {
        const transactionData = genChargebackData({
          'Merchant Reference ID': 'foo-bop',
          'Action-Status': 'Documentation received',
          'Original Creation Date': '5/31/2018',
          'Original Settled Amount': '55.74',
          'Exception Type': 'REPRESENTMENT',
          Firstname: 'John',
          Lastname: 'Smith',
          'Last 4': '1234',
          MID: '0005',
          'Original Processed Date': '5/31/2021',
          'Original Transaction ID': 'SdsHxYMVqYGjN0KVDxGaiw',
        });

        const datadogStub = sandbox.stub(dogstatsd, 'increment');

        const payment = await factory.create('payment', {
          externalId: 'foo-bop',
          status: ExternalTransactionStatus.Completed,
        });
        await factory.create('advance-tip', { advanceId: payment.advanceId });

        await chargebackProcessor.processData(transactionData, createFile());

        const transaction = await TransactionSettlement.findOne({
          where: { externalId: 'foo-bop' },
        });

        expect(transaction.type).to.equal(TransactionSettlementType.Payment);
        expect(transaction.status).to.equal(TransactionSettlementStatus.Representment);
        expect(transaction.amount).to.equal(55.74);
        expect(transaction.processed.format('YYYY-MM-DD')).to.equal('2018-05-31');
        expect(transaction.sourceId).to.eq(payment.id);
        expect(transaction.sourceType).to.eq('PAYMENT');
        expect(transaction.processor).to.eq('TABAPAY');
        expect(transaction.raw).to.exist;
        expect(tabapayChargebackEvent.publish).to.be.calledWith({
          actionStatus: 'Documentation received',
          exceptionDate: '07/23/2018',
          exceptionType: 'REPRESENTMENT',
          firstName: 'John',
          last4: '1234',
          lastName: 'Smith',
          merchantReferenceId: 'foo-bop',
          subClientId: '0005',
          originalCreationDate: '5/31/2018',
          originalProcessedDate: '5/31/2021',
          originalSettledAmount: '55.74',
          originalTransactionId: 'SdsHxYMVqYGjN0KVDxGaiw',
          statusDate: '07/23/2018',
        });
        expect(transactionSettlementUpdateEvent.publish).to.be.calledWith({
          externalId: 'foo-bop',
          status: 'REPRESENTMENT',
          settlementType: 'PAYMENT',
          originalDate: 1527724800000,
          amount: '55.74',
          fullName: 'John Smith',
          lastFour: '1234',
          approvalCode: undefined,
          network: undefined,
          networkId: undefined,
          operation: 'create',
        });
        expect(datadogStub.getCall(4).args[0]).to.be.equal(
          'transaction_settlement.update_published',
        );
        expect(datadogStub.getCall(4).args[1]).to.deep.equal({
          processor: 'TABAPAY',
          settlement_parser_type: 'chargebacks',
        });
      });

      it('populates the raw field on the transactionSettlement record ', async () => {
        const transactionData = genChargebackData({
          'Merchant Reference ID': 'testing',
          'Action-Status': 'Documentation received',
          'Original Creation Date': '5/31/2018',
          'Original Settled Amount': '55.74',
        });

        await chargebackProcessor.processData(transactionData, file);

        const transaction = await TransactionSettlement.findOne({
          where: { externalId: 'testing' },
        });

        expect(transaction.raw['Merchant Reference ID']).to.exist;
        expect(transaction.raw['Action-Status']).to.exist;
        expect(transaction.raw['Original Creation Date']).to.exist;
        expect(transaction.raw['Original Settled Amount']).to.exist;
      });

      it('populates the fullName and lastFour fields from raw data', async () => {
        const transactionData = genChargebackData({
          'Merchant Reference ID': 'testing',
          'Action-Status': 'Documentation received',
          'Original Creation Date': '5/31/2018',
          'Original Settled Amount': '55.74',
          Firstname: 'Dave',
          Lastname: 'DaBear',
          'Last 4': '1111',
        });

        await chargebackProcessor.processData(transactionData, file);

        const transaction = await TransactionSettlement.findOne({
          where: { externalId: 'testing' },
        });

        expect(transaction.fullName).to.equal('Dave DaBear');
        expect(transaction.lastFour).to.equal('1111');
      });

      it('updates an entry if it exists', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Completed,
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Open',
        });

        const payment = await factory.create('payment', {
          externalId: 'tester-1',
          status: ExternalTransactionStatus.Completed,
        });
        await factory.create('advance-tip', { advanceId: payment.advanceId });
        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Chargeback);
        expect(transaction.modifications.length).to.eq(1);
        expect(transaction.modifications[0].metadata.fileName).to.eq(
          '1000_400001_20191015_chargebacks_v2-4.csv',
        );
        expect(transactionSettlementUpdateEvent.publish).to.be.calledWith({
          externalId: 'tester-1',
          status: 'CHARGEBACK',
          settlementType: 'PAYMENT',
          originalDate: 1527724800000,
          amount: '80.74',
          fullName: 'undefined undefined',
          lastFour: undefined,
          approvalCode: undefined,
          network: undefined,
          networkId: undefined,
          operation: 'update',
        });
      });

      it('do not update if status is the same', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Completed,
          representmentEnd: '2021-01-15',
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Representment - merchant paid',
          'Status Date': '01/15/2021',
        });

        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Completed);
        expect(transaction.modifications).to.eq(null);
      });

      it('do not update representmentStart if it is the same', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Representment,
          representmentStart: '2021-01-15',
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Documentation Received',
          'Status Date': '01/15/2021',
        });

        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Representment);
        expect(transaction.modifications).to.eq(null);
      });

      it('do not update representmentEnd if it is the same', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Completed,
          representmentEnd: '2021-01-15',
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Representment - merchant paid',
          'Status Date': '01/15/2021',
        });

        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Completed);
        expect(transaction.modifications).to.eq(null);
      });

      it('update representmentStart if it is different', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Representment,
          representmentStart: '2021-01-15',
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Documentation Received',
          'Status Date': '01/16/2021',
        });

        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Representment);
        expect(transaction.modifications.length).to.equal(1);
        expect(transaction.modifications[0].new.representmentStart).to.equal(
          '2021-01-16T00:00:00.000Z',
        );
      });

      it('update representmentEnd if it is different', async () => {
        const transaction = await factory.create('transaction-settlement', {
          externalId: 'tester-1',
          type: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Completed,
          representmentEnd: '2021-01-15',
        });

        const data = genChargebackData({
          'Merchant Reference ID': 'tester-1',
          'Action-Status': 'Representment - merchant paid',
          'Status Date': '01/16/2021',
        });

        await chargebackProcessor.processData(data, file);
        await transaction.reload();
        expect(transaction.status).to.equal(TransactionSettlementStatus.Completed);
        expect(transaction.modifications.length).to.equal(1);
        expect(transaction.modifications[0].new.representmentEnd).to.equal(
          '2021-01-16T00:00:00.000Z',
        );
      });
    });

    context('when a matching record cannot be found', () => {
      it('creates a transaction settlement without a source id and source type', async () => {
        const referenceId = 'bearsbeetsbattlestargalactica';
        const data = genChargebackData({ 'Merchant Reference ID': referenceId });
        await chargebackProcessor.processData(data, file);
        const transactionSettlement = await TransactionSettlement.findOne({
          where: { externalId: referenceId },
        });
        expect(transactionSettlement.sourceId).to.eq(null);
        expect(transactionSettlement.sourceType).to.eq(null);
        expect(transactionSettlement.externalId).to.eq(referenceId);
      });
    });

    context('when processing disbursement records', () => {
      it('updates the disbursement status and network data of an advance', async () => {
        const externalId = 'test-foo';

        const advance = await factory.create('advance', {
          disbursementStatus: ExternalTransactionStatus.Pending,
          externalId,
          disbursementProcessor: ExternalTransactionProcessor.Tabapay,
          approvalCode: null,
          network: null,
          networkId: null,
        });

        const mockImplementor = createMockParser({
          externalId: advance.externalId,
          amount: `${advance.amount}`,
          settlementType: TransactionSettlementType.Disbursement,
          approvalCode,
          network,
          networkId,
        });

        const p = new Processor(mockImplementor);

        await p.processData(genDisbursementData({}), file);

        await advance.reload();

        expect(advance.disbursementStatus).to.equal(ExternalTransactionStatus.Completed);
        expect(advance.approvalCode).to.equal(approvalCode);
        expect(advance.network).to.equal(network);
        expect(advance.networkId).to.equal(networkId);
      });

      context('updating advance network', () => {
        it('does not update if raw is null', async () => {
          const advance = await factory.create<Advance>('advance', {
            disbursementStatus: ExternalTransactionStatus.Pending,
            disbursementProcessor: ExternalTransactionProcessor.Tabapay,
            externalId: 'some-external-id',
          });

          const parser = createMockParser({
            externalId: advance.externalId,
            amount: `${advance.amount}`,
            settlementType: TransactionSettlementType.Disbursement,
          });

          const processor = new Processor(parser);
          const updateAdvanceNetworkSpy = sandbox.spy(processor, 'updateAdvanceNetwork');
          await processor.processData(null, file);
          await advance.reload();

          expect(updateAdvanceNetworkSpy).not.to.be.called;
          expect(advance.approvalCode).not.to.exist;
          expect(advance.network).not.to.exist;
          expect(advance.networkId).not.to.exist;
        });

        it('does not update when transaction status is not completed', async () => {
          sandbox.stub(Notification, 'sendAdvanceDisbursementFailed').resolves();
          const testStatuses = [
            TransactionSettlementStatus.Pending,
            TransactionSettlementStatus.Canceled,
          ];
          for await (const status of testStatuses) {
            const advance = await factory.create<Advance>('advance', {
              disbursementStatus: ExternalTransactionStatus.Pending,
              disbursementProcessor: ExternalTransactionProcessor.Tabapay,
              externalId: `external-id-${status}`,
            });
            const parser = createMockParser({
              externalId: advance.externalId,
              amount: `${advance.amount}`,
              status,
              settlementType: TransactionSettlementType.Disbursement,
            });
            const processor = new Processor(parser);
            const updateAdvanceNetworkSpy = sandbox.spy(processor, 'updateAdvanceNetwork');
            await processor.processData(genDisbursementData({}), file);

            expect(updateAdvanceNetworkSpy).not.to.be.called;
            expect(advance.approvalCode).not.to.exist;
            expect(advance.network).not.to.exist;
            expect(advance.networkId).not.to.exist;
          }
        });

        it('updates advance disbursement status even if update network has errors', async () => {
          const advance = await factory.create<Advance>('advance', {
            disbursementStatus: ExternalTransactionStatus.Pending,
            disbursementProcessor: ExternalTransactionProcessor.Tabapay,
            externalId: 'some-external-id',
          });

          const parser = createMockParser({
            externalId: advance.externalId,
            amount: `${advance.amount}`,
            settlementType: TransactionSettlementType.Disbursement,
            approvalCode,
            network,
            networkId,
          });

          const processor = new Processor(parser);
          const updateStub = sandbox.stub(Advance.prototype, 'update');
          updateStub
            .onFirstCall()
            .rejects()
            .onSecondCall()
            .callsFake(async args => {
              updateStub.restore();
              return advance.update(args);
            });

          await processor.processData(null, file);
          await advance.reload();

          expect(advance.disbursementStatus).to.equal(ExternalTransactionStatus.Completed);
          expect(advance.approvalCode).not.to.exist;
          expect(advance.network).not.to.exist;
          expect(advance.networkId).not.to.exist;
        });
      });
    });

    context('when processing payment records', () => {
      it('updates the status of a payment and the advance outstanding balance', async () => {
        const externalId = 'test-foo';

        const advance = await factory.create<Advance>('advance', {
          amount: 10,
          fee: 0,
          outstanding: 0,
          disbursementStatus: ExternalTransactionStatus.Completed,
        });

        const [payment] = await Promise.all([
          factory.create('payment', {
            advanceId: advance.id,
            amount: advance.amount,
            externalId,
            status: ExternalTransactionStatus.Pending,
            externalProcessor: ExternalTransactionProcessor.Tabapay,
          }),
          factory.create('advance-tip', { advanceId: advance.id, amount: 0 }),
        ]);

        const mockProcessor = createMockParser({
          settlementType: TransactionSettlementType.Payment,
          status: TransactionSettlementStatus.Canceled,
          externalId,
          amount: `${advance.amount}`,
        });

        const p = new Processor(mockProcessor);

        await p.processData(genChargebackData({}), file);

        await Promise.all([advance.reload(), payment.reload()]);

        expect(payment.status).to.equal(ExternalTransactionStatus.Canceled);
        expect(advance.outstanding).to.equal(10);
      });
    });

    context('when processing chargeback records', () => {
      processChargebackData(chargebackProcessor, 'payment');
      processChargebackData(chargebackProcessor, 'subscription-payment');
    });

    context('check preventing overwriting newer data', () => {
      it('does not process outdated data (from a file whose timestamp is older than the updated timestamp in the database)', async () => {
        sandbox.restore();
        sandbox.stub(transactionSettlementUpdateEvent, 'publish');
        const externalId = 'test-foo';

        const advance = await factory.create('advance', {
          disbursementStatus: ExternalTransactionStatus.Pending,
          externalId,
          disbursementProcessor: ExternalTransactionProcessor.Tabapay,
          updated: '2019-10-24',
        });

        const mockProcessor = {
          settlementParserType: SettlementParserType.TabapayDirect,
          sftpConfig: {
            host: 'blah',
            port: 0,
            username: 'foo',
            directory: 'bar',
          },
          externalTransactionProcessor: ExternalTransactionProcessor.Tabapay,
          saveToDatabase: true,
          saveToGcloud: false,
          filterFileNames: (f: FileInfo[]) => Promise.resolve(f),
          convert: () => {
            return {
              externalId,
              status: TransactionSettlementStatus.Completed,
              originalDate: moment(),
              amount: advance.amount,
              settlementType: TransactionSettlementType.Disbursement,
              fullName: 'Fooh Bear',
              lastFour: '5555',
            };
          },
          markFileAsProcessed: () => {
            return;
          },
        };

        const p = new Processor(mockProcessor);

        await p.processData(genChargebackData({}), file);

        await advance.reload();

        expect(advance.disbursementStatus).to.equal(ExternalTransactionStatus.Pending);
      });

      it('does update network data when the file is stale compared to advance updated', async () => {
        sandbox.restore();
        sandbox.stub(transactionSettlementUpdateEvent, 'publish');
        const externalId = 'test-foo';

        const advance = await factory.create('advance', {
          created: moment(fileDate, 'YYYYMMDD').subtract(1, 'day'),
          disbursementStatus: ExternalTransactionStatus.Completed,
          externalId,
          disbursementProcessor: ExternalTransactionProcessor.Tabapay,
          approvalCode: null,
          network: null,
          networkId: null,
          updated: moment(fileDate, 'YYYYMMDD').add(12, 'hour'),
        });

        const mockImplementor = createMockParser({
          externalId: advance.externalId,
          amount: `${advance.amount}`,
          settlementType: TransactionSettlementType.Disbursement,
          status: TransactionSettlementStatus.Completed,
          approvalCode,
          network,
          networkId,
        });

        const p = new Processor(mockImplementor);

        await p.processData(genDisbursementData({}), file);
        await advance.reload();

        expect(advance.approvalCode).to.equal(approvalCode);
        expect(advance.network).to.equal(network);
        expect(advance.networkId).to.equal(networkId);
      });
    });
  });

  describe('#saveFileAsProcessed', () => {
    it('stores the file name in database', async () => {
      const fileName = 'test.csv';
      let isInSet = !(await TransactionSettlementProcessedFile.isFileUnprocessed(fileName));
      expect(isInSet).to.eq(false);
      await Processor.saveFileAsProcessed(fileName, 2000, 2);
      isInSet = !(await TransactionSettlementProcessedFile.isFileUnprocessed(fileName));
      expect(isInSet).to.eq(true);
    });
  });

  describe('#updateAdvanceNetwork', () => {
    const parser = createMockParser({
      settlementType: TransactionSettlementType.Disbursement,
    });
    const processor = new Processor(parser);
    let updateSpy: sinon.SinonSpy;

    beforeEach(() => {
      updateSpy = sandbox.spy(Advance.prototype, 'update');
    });

    it('updates network data for an advance if different', async () => {
      const advance = await factory.create<Advance>('advance', {
        approvalCode: null,
        network: 'VisaFF',
        networkId: null,
      });
      const data: ParsedCSVRow = { approvalCode, network, networkId } as ParsedCSVRow;
      await processor.updateAdvanceNetwork(data, advance);
      await advance.reload();

      expect(updateSpy).to.be.calledOnce;
      expect(advance.approvalCode).to.equal(approvalCode);
      expect(advance.network).to.equal(network);
      expect(advance.networkId).to.equal(networkId);
    });

    it('does not update network data for an advance if the same', async () => {
      const advance = await factory.create<Advance>('advance', {
        approvalCode,
        network,
        networkId,
      });
      const data: ParsedCSVRow = { approvalCode, network, networkId } as ParsedCSVRow;
      await processor.updateAdvanceNetwork(data, advance);
      expect(updateSpy).to.not.be.called;
    });

    it('does not update if raw does not contain network, networkId, or approvalCode properties', async () => {
      const advance = await factory.create<Advance>('advance', {
        approvalCode,
        network,
        networkId,
      });
      const data: ParsedCSVRow = {} as ParsedCSVRow;
      await processor.updateAdvanceNetwork(data, advance);
      await advance.reload();

      expect(updateSpy).to.not.be.called;
      expect(advance.approvalCode).to.equal(approvalCode);
      expect(advance.network).to.equal(network);
      expect(advance.networkId).to.equal(networkId);
    });

    it('does not propogate errors', async () => {
      sandbox.restore();
      sandbox.stub(transactionSettlementUpdateEvent, 'publish');
      const loggerStub = sandbox.stub(logger, 'error');
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      sandbox.stub(Advance.prototype, 'update').rejects();

      const advance = await factory.create<Advance>('advance');
      const data: ParsedCSVRow = { approvalCode, network, networkId } as ParsedCSVRow;

      await expect(processor.updateAdvanceNetwork(data, advance)).not.to.be.rejected;

      expect(loggerStub).to.be.calledWithMatch(/Error/);
      expect(datadogStub).to.be.calledWith(
        TransactionSettlementProcesingMetrics.ERROR_UPDATING_ADVANCE_NETWORK,
      );
    });
  });
});
