import * as sinon from 'sinon';
import { moment } from '@dave-inc/time-lib';
import sendgrid from '../../src/lib/sendgrid';
import { Advance } from '../../src/models';
import { unableToCollectAlert } from '../../src/crons/unable-to-collect-alert';
import { expect } from 'chai';
import {
  advanceFixture,
  alertFixture,
  bankAccountFixture,
  bankConnectionFixture,
  institutionFixture,
  paymentMethodFixture,
  userFixture,
} from '../fixtures';
import { clean, stubBankTransactionClient, up } from '../test-helpers';

describe('Unable to Collect Alert', () => {
  const fixtures = [
    userFixture,
    institutionFixture,
    bankConnectionFixture,
    bankAccountFixture,
    paymentMethodFixture,
    advanceFixture,
    alertFixture,
  ];

  const sandbox = sinon.createSandbox();

  let sendgridStub: any;

  before(() => clean());

  beforeEach(async () => {
    sendgridStub = sandbox.stub(sendgrid, 'send');
    stubBankTransactionClient(sandbox);
    return up(fixtures);
  });

  afterEach(() => clean(sandbox));

  xit('sends an email to users that have invalid credentials on their payback date', async () => {
    await Advance.update({ paybackDate: moment().format('YYYY-MM-DD') }, { where: { id: 15 } });

    await unableToCollectAlert();

    expect(sendgridStub).to.be.calledWith(
      'Something went wrong with your payment',
      sinon.match.string,
      { FIRSTNAME: 'David' },
      '5@dave.com',
    );
  });
});
