import { expect } from 'chai';
import factory from '../../factories';
import { genChargebackData } from './test-helpers';
import { TransactionSettlement } from '../../../src/models';
import { Processor } from '../../../src/domain/transaction-settlement-processing';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { FileInfo } from 'ssh2-sftp-client';
import { Chargebacks } from '../../../src/domain/transaction-settlement-processing/tabapay/chargebacks';

export function processChargebackData(processor: Processor, name: string) {
  const createFile = (fileName: string = '1000_400001_20191015_chargebacks_v2-4.csv') => {
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

  describe(`updates the status of the ${name}`, () => {
    ['Open', 'Open - Merchant debited'].forEach(actionStatus => {
      it(`when chargeback is new and Action-Status is: ${actionStatus}`, async () => {
        const payment = await factory.create(name, {
          externalProcessor: ExternalTransactionProcessor.Tabapay,
          status: ExternalTransactionStatus.Completed,
          externalId: 'foo-bar',
        });

        if (name === 'payment') {
          await factory.create('advance-tip', { advanceId: payment.advanceId });
        }

        const data = genChargebackData({
          'Merchant Reference ID': 'foo-bar',
          'Action-Status': actionStatus,
        });

        await processor.processData(data, file);

        await payment.reload();

        expect(payment.status).to.equal(ExternalTransactionStatus.Chargeback);
      });
    });

    it('when chargeback enters representment', async () => {
      const payment = await factory.create(name, {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Chargeback,
        externalId: 'foo-bar',
      });

      if (name === 'payment') {
        await factory.create('advance-tip', { advanceId: payment.advanceId });
      }

      const data = genChargebackData({
        'Merchant Reference ID': 'foo-bar',
        'Action-Status': 'Documentation Received',
      });

      await processor.processData(data, file);

      await payment.reload();

      expect(payment.status).to.equal(ExternalTransactionStatus.Pending);
    });

    it('when representment is won', async () => {
      const payment = await factory.create(name, {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Pending,
        externalId: 'foo-bar',
        updated: '2019-10-01',
      });

      if (name === 'payment') {
        await factory.create('advance-tip', { advanceId: payment.advanceId });
      }

      const data = genChargebackData({
        'Merchant Reference ID': 'foo-bar',
        'Action-Status': 'Representment - merchant paid',
      });

      await processor.processData(data, file);

      await payment.reload();

      expect(payment.status).to.equal(ExternalTransactionStatus.Completed);
    });

    // representments (dispute chargebacks)
    it('sets the representment start timestamp', async () => {
      const payment = await factory.create('payment', {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Chargeback,
        externalId: 'foo-bar',
      });

      await factory.create('advance-tip', { advanceId: payment.advanceId });

      const data = genChargebackData({
        'Merchant Reference ID': 'foo-bar',
        'Action-Status': 'Documentation Received',
        'Status Date': '07/01/2018',
      });

      await processor.processData(data, file);

      const transaction = await TransactionSettlement.findOne({
        where: { externalId: 'foo-bar' },
      });

      expect(transaction.representmentStart.format('YYYY-MM-DD')).to.equal('2018-07-01');
    });

    it('sets the representment end timestamp on successful representment', async () => {
      const payment = await factory.create('payment', {
        externalProcessor: ExternalTransactionProcessor.Tabapay,
        status: ExternalTransactionStatus.Chargeback,
        externalId: 'foo-bar',
      });
      await factory.create('advance-tip', { advanceId: payment.advanceId });

      const data = genChargebackData({
        'Merchant Reference ID': 'foo-bar',
        'Action-Status': 'Representment - merchant paid',
        'Status Date': '07/01/2018',
      });

      await processor.processData(data, file);

      const transaction = await TransactionSettlement.findOne({
        where: { externalId: 'foo-bar' },
      });

      expect(transaction.representmentEnd.format('YYYY-MM-DD')).to.equal('2018-07-01');
    });

    it('does not filter out old 1000_40002 files (as these were never processed) (when we cleared redis keys)', async () => {
      const files = [
        createFile('1000_400001_20190315_chargebacks_v2-4.csv'),
        createFile('1000_400001_20191015_chargebacks_v2-5.csv'),
      ];
      const result = await new Chargebacks().filterFileNames(files);
      expect(result.length).to.eq(2);
    });

    it('filters out 4002 files that are on or before 10/22 (when we cleared redis keys)', async () => {
      const files = [
        createFile('4002_20191015_chargebacks_v2-5.csv'),
        createFile('4002_20190515_chargebacks_v2-4.csv'),
      ];
      const result = await new Chargebacks().filterFileNames(files);

      expect(result.length).to.eq(0);
    });

    it('does not filter out 4002 files that are after 10/22 (when we cleared redis keys)', async () => {
      const files = [
        createFile('4002_20191023_chargebacks_v2-5.csv'),
        createFile('4002_20191028_chargebacks_v2-5.csv'),
      ];
      const result = await new Chargebacks().filterFileNames(files);

      expect(result.length).to.eq(2);
    });
  });
}
