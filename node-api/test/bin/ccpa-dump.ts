import 'mocha';
import * as sinon from 'sinon';
import { SinonStub } from 'sinon';
import * as fs from 'fs';
import factory from '../factories';
import sendmail from '../../src/lib/sendgrid';
import { ccpaDataRequest, PII_USER_COLUMNS } from '../../bin/scripts/ccpa-dump-user-data';
import { expect } from 'chai';

describe('CCPA dump user data request', () => {
  let userId: number;
  let mkdirStub: SinonStub;
  let writeFileStub: SinonStub;
  let sendmailStub: SinonStub;
  const email = 'tswiftfan420@gmail.com';
  const sandbox = sinon.createSandbox();

  before(async () => {
    const bankAccount = await factory.create('bank-account');
    userId = bankAccount.userId;
  });

  beforeEach(() => {
    mkdirStub = sandbox.stub(fs, 'mkdirSync');
    writeFileStub = sandbox.stub(fs, 'writeFileSync');
    sendmailStub = sandbox.stub(sendmail, 'sendHtml');
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('should send an email', async () => {
    await ccpaDataRequest(userId, email);
    expect(sendmailStub.callCount).to.eq(1);
    expect(sendmailStub.firstCall.args[2]).to.eq(email);
  });

  it('should create 30 files', async () => {
    await ccpaDataRequest(userId, email);
    expect(writeFileStub.callCount).to.eq(42);
  });

  it('should create a directory', async () => {
    await ccpaDataRequest(userId, email);
    expect(mkdirStub.callCount).to.eq(1);
    expect(mkdirStub.firstCall.args).to.deep.eq([`./${userId}-ccpa`]);
  });

  it('should filter out pii in user columns', async () => {
    await ccpaDataRequest(userId, email);
    const userCall = writeFileStub
      .getCalls()
      .find(call => call.args[0] === `./${userId}-ccpa/user.csv`);
    expect(userCall).not.to.be.undefined;
    const columns = userCall.args[1]
      .split('\n')[0]
      .split(',')
      .map((c: string) => JSON.parse(c));
    PII_USER_COLUMNS.forEach(piiCol => {
      expect(columns.includes(piiCol)).to.eq(false);
    });
  });
});
