import { clean } from '../test-helpers';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { dateInTimezone, DEFAULT_TIMEZONE, moment } from '@dave-inc/time-lib';
import factory from '../factories';
import sendgrid from '../../src/lib/sendgrid';
import * as Task from '../../src/crons/notify-pending-advances';

describe('Task: notify pending advances', () => {
  const sandbox = sinon.createSandbox();

  let sendgridStub: any;
  before(() => clean());

  afterEach(() => clean(sandbox));

  beforeEach(() => {
    sendgridStub = sandbox.stub(sendgrid, 'send').resolves();
  });

  it('should send an alert when there are stale pending advances', async () => {
    const created = dateInTimezone('2019-04-04', DEFAULT_TIMEZONE)
      .utc()
      .format();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-05')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
    expect(sendgridStub).to.have.been.calledWith(
      'Pending Advances',
      'd-8798c380a2764908b7c698b1918d4013',
      undefined,
      'pending.advances@dave.com',
      undefined,
      'no-reply@dave.com',
      undefined,
      'Dave',
    );
  });

  it('should not send an alert when there are no stale pending advances', async () => {
    await Task.run(
      moment('2019-04-05')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should not run the job on a Saturday, even if there are pending advances', async () => {
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created: dateInTimezone('2019-04-05', DEFAULT_TIMEZONE),
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-06')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should not run the job on a Sunday, even if there are pending advances', async () => {
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created: dateInTimezone('2019-04-06', DEFAULT_TIMEZONE),
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-07')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should not run the job on a holiday, even if there are pending advances', async () => {
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created: dateInTimezone('2019-07-03', DEFAULT_TIMEZONE),
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-07-04')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should capture advances created during the weekend/holiday when running on a business day following a weekend/holiday', async () => {
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created: dateInTimezone('2019-04-06', DEFAULT_TIMEZONE),
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-09')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
    expect(sendgridStub).to.have.been.calledWith(
      'Pending Advances',
      'd-8798c380a2764908b7c698b1918d4013',
      undefined,
      'pending.advances@dave.com',
      undefined,
      'no-reply@dave.com',
      undefined,
      'Dave',
    );
  });

  it('should capture advances created on a Friday before 4pm when the report is run on Monday', async () => {
    const created = dateInTimezone('2019-04-05', DEFAULT_TIMEZONE)
      .add(15, 'hours')
      .add('59', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-08')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
    expect(sendgridStub).to.have.been.calledWith(
      'Pending Advances',
      'd-8798c380a2764908b7c698b1918d4013',
      undefined,
      'pending.advances@dave.com',
      undefined,
      'no-reply@dave.com',
      undefined,
      'Dave',
    );
  });

  it('should NOT capture advances created on a Friday AFTER 4pm when the report is run on Monday', async () => {
    const created = dateInTimezone('2019-04-05', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-08')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should NOT capture advances created on a Friday AFTER 4pm when the report is run on Monday', async () => {
    const created = dateInTimezone('2019-04-05', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-08')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should capture advances created on a Friday AFTER 4pm when the report is run on Monday', async () => {
    const created = dateInTimezone('2019-04-05', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-04-08')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(0);
  });

  it('should capture advances created between Thursday 4pm and Friday 4pm when the report is run on a Tuesday following a Monday holiday', async () => {
    const created = dateInTimezone('2019-05-23', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-05-28')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
  });

  it('should capture advances created between Friday 4pm and Tuesday 4pm when the report is run on a Wednesday following a Monday holiday', async () => {
    const created = dateInTimezone('2019-05-24', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-05-29')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
  });

  it('should capture advances created between Tuesday 4pm and Wednesday 4pm when the report is run on a Friday following a Thursday holiday', async () => {
    const created = dateInTimezone('2019-07-02', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-07-05')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
  });

  it('should capture advances created between Wednesday 4pm and Friday 4pm when the report is run on a Monday following a Thursday holiday', async () => {
    const created = dateInTimezone('2019-07-03', DEFAULT_TIMEZONE)
      .add(16, 'hours')
      .add('1', 'minutes')
      .utc();
    await factory.create('advance', {
      amount: 75,
      disbursementStatus: 'PENDING',
      // April 6th is a Saturday
      created,
      delivery: 'STANDARD',
    });
    await Task.run(
      moment('2019-07-08')
        .subtract(1, 'days')
        .format('YYYY-MM-DD'),
    );
    expect(sendgridStub).to.have.callCount(1);
  });
});
