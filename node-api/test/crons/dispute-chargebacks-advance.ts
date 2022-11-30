import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import * as Sftp from 'ssh2-sftp-client';
import SftpClient from '../../src/lib/sftp-client';
import { clean } from '../test-helpers';
import { run as disputeChargebacks } from '../../src/crons/dispute-chargebacks';
import factory from '../factories';
import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as PDF from 'pdfkit';

describe('DisputeChargebackAdvance', () => {
  const generateFakeData = async (externalId: string, amount: number) => {
    const paymentMethod = await factory.create('payment-method');

    const advance = await factory.create('advance', {
      user: paymentMethod.userId,
      amount,
      fee: 0,
    });

    await Promise.all([
      factory.create('payment', {
        userId: paymentMethod.userId,
        externalId,
        amount,
        advanceId: advance.id,
        paymentMethodId: paymentMethod.id,
      }),
      factory.create('advance-tip', { advanceId: advance.id, amount: 0, percent: 0 }),
    ]);
  };
  const sandbox = sinon.createSandbox();
  beforeEach(() => clean());
  afterEach(() => clean(sandbox));
  describe('advance chargebacks', () => {
    const fakeChargebacksFileData = fs.readFileSync(
      path.join(__dirname, 'dispute-chargebacks') + '/fake-chargebacks.test',
      'utf8',
    );
    const fakeFiles = [
      {
        name: '1000_400001_20190625_transactions_v2-4.csv',
      },
      {
        name: '1000_400001_20190626_transactions_v2-4.csv',
      },
      {
        name: '1000_400001_20190625_chargebacks_v2-4.csv',
      },
      {
        name: '1000_400001_20190626_chargebacks_v2-4.csv',
      },
      {
        name: '4002_20190625_chargebacks_v2-4.csv',
      },
      {
        name: '4002_20190626_chargebacks_v2-4.csv',
      },
    ];
    beforeEach(() => {
      sandbox.stub(SftpClient.prototype, 'connect').resolves();
      sandbox.stub(Sftp.prototype, 'mkdir').resolves();
      sandbox.stub(Sftp.prototype, 'list').returns(fakeFiles);
      sandbox.stub(Sftp.prototype, 'get').returns(fakeChargebacksFileData);
      sandbox.stub(Sftp.prototype, 'put').resolves();
    });
    it('should generate an advance chargeback pdf', async () => {
      sandbox.stub(moment.prototype, 'subtract').returns(moment('2019-06-24', 'YYYY-MM-DD'));
      await generateFakeData('99999991', 79.99);
      await generateFakeData('99999992', 15.0);
      await generateFakeData('99999993', 87.49);
      sandbox.stub(PDF.prototype, 'lineGap');
      sandbox.stub(PDF.prototype, 'text');
      await disputeChargebacks();
      expect(PDF.prototype.text).to.have.calledWith('Advance Details:');
      expect(PDF.prototype.text).to.have.calledWith('Amount: $79.99');
      expect(PDF.prototype.text).to.have.calledWith('Amount: $15.00');
      expect(PDF.prototype.text).to.have.calledWith('Amount: $87.49');
      expect(PDF.prototype.text).to.have.calledWith(
        'This is a screenshot of the screen where the user agreed to allow Dave.com to withdraw the full amount of their advance.\n' +
          'To populate the legal name section, the user typed their full name into a text field.',
      );
    });
  });
});
