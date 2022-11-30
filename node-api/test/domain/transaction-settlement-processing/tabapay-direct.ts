import { expect } from 'chai';
import { TabapayDirect } from '../../../src/domain/transaction-settlement-processing';
import { FileInfo } from 'ssh2-sftp-client';
import { TransactionSettlementStatus } from '@dave-inc/wire-typings';
import { TabapayTransactionCSVRow } from '../../../src/typings/external-transaction';
import TransactionSettlementProcessedFile from '../../../src/models/transaction-settlement-processed-file';
import { clean } from '../../test-helpers';

describe('TabapayDirect', () => {
  before(() => clean());

  const processor = new TabapayDirect();

  const createFile = (fileName: string = '4002_20191010_transactions_v2-4.csv') => {
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

  describe('#filterFileNames', () => {
    afterEach(() => clean());

    it('returns a list of transaction file names', async () => {
      const file = createFile();
      const result = await processor.filterFileNames([file]);
      expect(result.length).to.eq(1);
      expect(result[0].name).to.equal(file.name);
    });

    it('filters non transaction files', async () => {
      const file = createFile();
      const result = await processor.filterFileNames([
        {
          ...file,
          name: '4002_20191015_chargebacks_v2-4.csv',
        },
      ]);
      expect(result).to.deep.eq([]);
    });

    it('filters risepay gateway files', async () => {
      const file = createFile();
      const result = await processor.filterFileNames([
        {
          ...file,
          name: '1000_400001_20191015_transactions_v2-4.csv',
        },
      ]);
      expect(result).to.deep.eq([]);
    });

    it('checks processed file list to see if the file has already been downloaded', async () => {
      const file = createFile();
      await TransactionSettlementProcessedFile.create({
        fileName: file.name,
        rowsProcessed: 2000,
        processTimeSeconds: 1,
      });
      const result = await processor.filterFileNames([file]);
      expect(result).to.deep.eq([]);
    });
  });

  describe('#convert', () => {
    it('sets the externalId based on the Transaction ID field', () => {
      const transactionCSVRow = {
        'Transaction ID': 'foo-bar-baz',
        'Reference ID': 'blah',
        Status: 'Complete',
        Type: 'Purchase',
        'Processed Date': '08/26/2018',
        'Transaction Amount': '75',
      } as TabapayTransactionCSVRow;

      const result = processor.convert(transactionCSVRow);
      expect(result.externalId).to.eq('foo-bar-baz');
    });

    it('sets the settlement type to disbursement', () => {
      const disbursementCSVRow = {
        'Reference ID': 'blah',
        Status: 'Complete',
        Type: 'Disbursement',
        'Processed Date': '08/26/2018',
        'Transaction Amount': '75',
      } as TabapayTransactionCSVRow;

      const result = processor.convert(disbursementCSVRow);
      expect(result.settlementType).to.eq('DISBURSEMENT');
    });

    it('sets the settlement type to payment', () => {
      const transactionCSVRow = {
        'Reference ID': 'blah',
        Status: 'Complete',
        Type: 'Purchase',
        'Processed Date': '08/26/2018',
        'Transaction Amount': '75',
      } as TabapayTransactionCSVRow;

      const result = processor.convert(transactionCSVRow);
      expect(result.settlementType).to.eq('PAYMENT');
    });

    it('sets the fullName and lastFour fields correctly', () => {
      const transactionCSVRow: TabapayTransactionCSVRow = {
        'Transaction ID': 'foo-bar-baz',
        'Reference ID': 'blah',
        Status: 'Complete',
        Type: 'Purchase',
        'Processed Date': '08/26/2018',
        'Transaction Amount': '75',
        'First Name': 'Fooh',
        'Last Name': 'Bear',
        'Last 4': '5555',
        'Approval Code': '1234',
        'Settlement Network': 'Visa',
        'Network ID': '5678',
      };

      const result = processor.convert(transactionCSVRow);
      expect(result.fullName).to.eq('Fooh Bear');
      expect(result.lastFour).to.eq('5555');
      expect(result.approvalCode).to.eq('1234');
      expect(result.network).to.eq('Visa');
      expect(result.networkId).to.eq('5678');
    });

    it('handles null or undefined network fields', async () => {
      const transactionCSVRow: TabapayTransactionCSVRow = {
        'Transaction ID': 'foo-bar-baz',
        'Reference ID': 'blah',
        Status: 'Complete',
        Type: 'Purchase',
        'Processed Date': '08/26/2018',
        'Transaction Amount': '75',
        'First Name': 'Fooh',
        'Last Name': 'Bear',
        'Last 4': '5555',
        'Approval Code': null,
        'Settlement Network': undefined,
        'Network ID': null,
      };

      const result = processor.convert(transactionCSVRow);
      expect(result.approvalCode).to.not.exist;
      expect(result.network).to.not.exist;
      expect(result.networkId).to.not.exist;
    });

    it('filters out files that are before 2019-10-09', async () => {
      const files = [
        createFile('4002_20190315_transactions_v2-4.csv'),
        createFile('4002_20191008_transactions_v2-4.csv'),
      ];
      const result = await processor.filterFileNames(files);

      expect(result.length).to.eq(0);
    });

    it('does not filter out files that are on or after 2019-10-09', async () => {
      const files = [
        createFile('4002_20191022_transactions_v2-5.csv'),
        createFile('4002_20191009_transactions_v2-5.csv'),
      ];
      const result = await processor.filterFileNames(files);

      expect(result.length).to.eq(2);
    });

    [
      { csvStatus: 'Error', settlementStatus: TransactionSettlementStatus.Canceled },
      { csvStatus: 'Unknown-Failed', settlementStatus: TransactionSettlementStatus.Canceled },
      { csvStatus: 'Complete', settlementStatus: TransactionSettlementStatus.Completed },
      { csvStatus: 'Unknown-Posted', settlementStatus: TransactionSettlementStatus.Completed },
      { csvStatus: 'Rando', settlementStatus: TransactionSettlementStatus.Pending },
    ].forEach(({ csvStatus, settlementStatus }) => {
      it(`maps csvStatus: ${csvStatus} to settlement status: ${settlementStatus}`, () => {
        const transactionCSVRow = {
          'Reference ID': 'blah',
          Status: csvStatus,
          Type: 'Purchase',
          'Processed Date': '08/26/2018',
          'Transaction Amount': '75',
        } as TabapayTransactionCSVRow;

        const result = processor.convert(transactionCSVRow);
        expect(result.status).to.eq(settlementStatus);
      });
    });
  });
});
