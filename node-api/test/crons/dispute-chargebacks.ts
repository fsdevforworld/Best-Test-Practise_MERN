import { expect } from 'chai';
import { factory } from 'factory-girl';
import * as fs from 'fs';
import * as path from 'path';
// @ts-ignore: Rewire doesn't seem to import correctly with DefinitelyTyped type definitions
import * as rewire from 'rewire';
import * as sinon from 'sinon';
import * as Sftp from 'ssh2-sftp-client';
import { moment } from '@dave-inc/time-lib';
import SftpClient from '../../src/lib/sftp-client';
import { clean } from '../test-helpers';

describe('DisputeChargebacksTask', () => {
  const getSpyForRewiredObjFn = (rewiredObj: any, fnName: string) => {
    const rewiredObjWithFn = { [fnName]: rewiredObj.__get__(fnName) };
    const spy = sinon.spy(rewiredObjWithFn, fnName);
    rewiredObj.__set__(fnName, spy);

    return spy;
  };

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

  describe('#run', () => {
    const disputeChargebackTask = rewire('../../src/crons/dispute-chargebacks');

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

    const fakeChargebacksFileData = fs.readFileSync(
      path.join(__dirname, 'dispute-chargebacks') + '/fake-chargebacks.test',
      'utf8',
    );

    const fakeSftpConfig = {
      host: 'fakeHost',
      port: 1337,
      username: 'fakeUsername',
      privateKey: 'fakePrivateKey',
      directory: 'fakeDirectory',
    };

    beforeEach(() => {
      sandbox.stub(SftpClient.prototype, 'connect').resolves();
      sandbox.stub(Sftp.prototype, 'mkdir').resolves();
      sandbox.stub(Sftp.prototype, 'list').returns(fakeFiles);
      sandbox.stub(Sftp.prototype, 'get').returns(fakeChargebacksFileData);
      sandbox.stub(Sftp.prototype, 'put').resolves();
    });

    it('successfully runs using rewire', async () => {
      // Allow us to keep time constant for this test
      sandbox.stub(moment.prototype, 'subtract').returns(moment('2019-06-24', 'YYYY-MM-DD'));

      const getChargebacksFileSpy = getSpyForRewiredObjFn(
        disputeChargebackTask,
        'getChargebacksFile',
      );
      const processFileContentsSpy = getSpyForRewiredObjFn(
        disputeChargebackTask,
        'processFileContents',
      );
      const handleChargebackExceptionSpy = getSpyForRewiredObjFn(
        disputeChargebackTask,
        'handleChargebackException',
      );

      await generateFakeData('99999991', 79.99);
      await generateFakeData('99999992', 15.0);
      await generateFakeData('99999993', 87.49);

      const runFn = disputeChargebackTask.__get__('run');
      await runFn(fakeSftpConfig);

      // Test getChargebacksFile()
      expect(getChargebacksFileSpy).to.have.callCount(2);
      expect(getChargebacksFileSpy).to.have.not.thrown();

      // Test processFileContents()
      expect(processFileContentsSpy).to.have.callCount(2);
      expect(processFileContentsSpy).to.be.calledWith(sinon.match.object, {
        fileName: '4002_20190626_chargebacks_v2-4.csv',
        fileContents: sinon.match.string,
        fileSelectionRuleTitle: '4002_',
      });
      expect(processFileContentsSpy).to.be.calledWith(sinon.match.object, {
        fileName: '1000_400001_20190626_chargebacks_v2-4.csv',
        fileContents: sinon.match.string,
        fileSelectionRuleTitle: '1000_400001',
      });
      expect(processFileContentsSpy).to.have.not.thrown();

      // Test handleChargebackException() -- Should be the same 3 exceptions in each of two files
      expect(handleChargebackExceptionSpy).to.have.callCount(6);
      expect(handleChargebackExceptionSpy).to.be.calledWith(
        sinon.match({
          'Original Transaction ID': 'x100000000000000000001',
          'Merchant Reference ID': '99999992',
        }),
        sinon.match.object,
      );
      expect(handleChargebackExceptionSpy).to.be.calledWith(
        sinon.match({
          'Original Transaction ID': 'x100000000000000000002',
          'Merchant Reference ID': '99999993',
        }),
        sinon.match.object,
      );
      expect(handleChargebackExceptionSpy).to.be.calledWith(
        sinon.match({
          'Original Transaction ID': 'x100000000000000000000',
          'Merchant Reference ID': '99999991',
        }),
        sinon.match.object,
      );
      expect(handleChargebackExceptionSpy).to.have.not.thrown();
    });
  });
});
