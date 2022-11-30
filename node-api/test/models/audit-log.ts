import { AuditLog } from '../../src/models';
import { expect } from 'chai';
import { clean } from '../test-helpers';
import * as sinon from 'sinon';
import ErrorHelper from '@dave-inc/error-helper';

class SomeError extends Error {
  constructor(message: string, public data: any) {
    super(message);
    this.data = data;
  }
}

describe('AuditLog', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  it('uses ErrorHelper to format errors stored in the extra field', async () => {
    const err = new Error('something happened!');

    const auditLog = await AuditLog.create({
      userId: 1,
      type: 'audit-log-test',
      message: 'that thing happened again',
      extra: err,
    });

    const extra = auditLog.extra;
    expect(extra).to.have.all.keys('errorName', 'errorMessage', 'stackTrace', 'info');
    expect(extra.errorName).to.eq('Error');
    expect(extra.errorMessage).to.eq('something happened!');
    expect(extra.stackTrace).to.match(/^Error: something happened!\n/);
  });

  it('uses ErrorHelper to format errors properties in the extra field', async () => {
    const err = new Error('something happened!');

    const auditLog = await AuditLog.create({
      userId: 1,
      type: 'audit-log-test',
      message: 'that thing happened again',
      extra: { err, someValue: 'value' },
    });

    const extra = auditLog.extra;
    expect(extra).to.have.all.keys('err', 'someValue');
    expect(extra.someValue).to.eq('value');

    expect(extra.err).to.have.all.keys('errorName', 'errorMessage', 'stackTrace', 'info');
    expect(extra.err.errorName).to.eq('Error');
    expect(extra.err.errorMessage).to.eq('something happened!');
    expect(extra.err.stackTrace).to.match(/^Error: something happened!\n/);
  });

  it('keeps data field', async () => {
    const err = new SomeError('some failure happened', { requestId: 123 });

    const auditLog = await AuditLog.create({
      userId: 1,
      type: 'audit-log-test',
      message: 'that API thing happened again',
      extra: err,
    });

    const extra = auditLog.extra;
    expect(extra).to.have.all.keys('errorName', 'errorMessage', 'stackTrace', 'data', 'info');
    expect(extra.data).to.deep.eq({ requestId: 123 });
  });

  it('does no formatting on non-error objects', async () => {
    const formatterStub = sandbox.stub(ErrorHelper, 'logFormat');

    const auditLog = await AuditLog.create({
      userId: 1,
      type: 'audit-log-test',
      message: 'that thing happened again',
      extra: { someValue: 'value' },
    });

    sandbox.assert.notCalled(formatterStub);
    expect(auditLog.extra).to.deep.eq({ someValue: 'value' });
  });

  it('does no formatting on string values', async () => {
    const formatterStub = sandbox.stub(ErrorHelper, 'logFormat');

    const auditLog = await AuditLog.create({
      userId: 1,
      type: 'audit-log-test',
      message: 'that thing happened again',
      extra: 'value',
    });

    sandbox.assert.notCalled(formatterStub);
    expect(auditLog.extra).to.deep.eq('value');
  });
});
