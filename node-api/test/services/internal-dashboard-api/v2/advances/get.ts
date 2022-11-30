import * as request from 'supertest';
import app from '../../../../../src/services/internal-dashboard-api';
import {
  clean,
  TABAPAY_ACCOUNT_ID,
  validateRelationships,
  withInternalUser,
} from '../../../../test-helpers';
import factory from '../../../../factories';
import {
  Advance,
  AdvanceApproval,
  AdvanceRefund,
  DashboardActionLog,
  PaymentMethod,
} from '../../../../../src/models';
import { ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import { IApiRelationshipData, IApiResourceObject } from '../../../../../src/typings';
import { advanceSerializers } from '../../serializers';

describe('GET /v2/advances/:id', () => {
  before(() => clean());

  afterEach(() => clean());

  let advanceApproval: AdvanceApproval;
  let advance: Advance;
  let advanceRefund: AdvanceRefund;
  let dashboardActionLog: DashboardActionLog;

  beforeEach(async () => {
    const debitCard = await factory.create<PaymentMethod>('payment-method', {
      tabapayId: TABAPAY_ACCOUNT_ID,
    });

    advanceApproval = await factory.create('advance-approval', { userId: debitCard.userId });

    advance = await factory.create<Advance>('advance', {
      userId: debitCard.userId,
      amount: 50,
      fee: 5,
      outstanding: 0,
      chosenAdvanceApprovalId: advanceApproval.id,
    });

    await factory.create('payment', {
      advanceId: advance.id,
      userId: debitCard.userId,
      paymentMethodId: debitCard.id,
      amount: 110,
      status: ExternalTransactionStatus.Completed,
    });

    await factory.create('advance-tip', {
      advanceId: advance.id,
      percent: 10,
      amount: 5,
    });

    await factory.create('dashboard-action', {
      code: 'create-advance-refund',
      name: 'Create advance refund',
    });

    dashboardActionLog = await factory.create('dashboard-action-log');

    const reimbursement = await factory.create('reimbursement', {
      advanceId: advance.id,
      amount: 60,
      dashboardActionLogId: dashboardActionLog.id,
    });

    advanceRefund = await factory.create('advance-refund', {
      advanceId: advance.id,
      reimbursementId: reimbursement.id,
    });

    const lineItems = [
      {
        reason: 'tip',
        amount: 5,
      },
      {
        reason: 'fee',
        amount: 5,
      },
      {
        reason: 'overpayment',
        amount: 50,
      },
    ];

    await Promise.all(
      lineItems.map(lineItem => {
        factory.create('advance-refund-line-item', {
          advanceRefundId: advanceRefund.id,
          reason: lineItem.reason,
          amount: lineItem.amount,
          adjustOutstanding: lineItem.reason === 'overpayment',
        });
      }),
    );
  });

  it('responds with advance and included data', async () => {
    const req = request(app)
      .get(`/v2/advances/${advance.id}`)
      .expect(200);

    const {
      body: { data, included },
    }: {
      body: { data: advanceSerializers.IAdvanceResource; included: IApiResourceObject[] };
    } = await withInternalUser(req);

    validateRelationships(
      { data, included },
      {
        advancePayments: 'advance-payment',
        advanceRefunds: 'advance-refund',
        advanceRefundLineItems: 'advance-refund-line-item',
      },
    );

    expect(data.attributes.amount).to.equal(50);
    expect(data.attributes.outstanding).to.equal(0);
    expect((data.relationships.chosenAdvanceApproval.data as IApiRelationshipData).id).to.equal(
      advanceApproval.id.toString(),
    );
  });

  it('responds ok with no chosen advance approval', async () => {
    const user = await factory.create('user');
    const advanceNoApproval = await factory.create<Advance>('advance', {
      userId: user.id,
      amount: 50,
      fee: 5,
      outstanding: 0,
    });

    await factory.create('advance-tip', {
      advanceId: advanceNoApproval.id,
      percent: 10,
      amount: 5,
    });

    const req = request(app)
      .get(`/v2/advances/${advanceNoApproval.id}`)
      .expect(200);

    const {
      body: { data },
    } = await withInternalUser(req);

    expect(data.relationships.chosenAdvanceApproval.data).to.be.null;
  });

  it('includes legacy reimbursements without duplicating', async () => {
    const internalUser = await factory.create('internal-user');
    const legacyReimbursement = await factory.create('reimbursement', {
      advanceId: advance.id,
      amount: 5,
      reimburserId: internalUser.id,
    });

    const req = request(app)
      .get(`/v2/advances/${advance.id}`)
      .expect(200);

    const {
      body: { included },
    } = await withInternalUser(req);

    const refunds: advanceSerializers.IAdvanceRefundResource[] = included.filter(
      (item: IApiResourceObject) => item.type === 'advance-refund',
    );

    expect(refunds).to.have.length(2);
    expect(refunds.some(refund => refund.id === `${advanceRefund.id}`)).to.be.true;
    expect(refunds.some(refund => refund.id === `legacy-${legacyReimbursement.id}`)).to.be.true;
  });

  it('action log id for legacy and new reimbursements', async () => {
    const internalUser = await factory.create('internal-user');

    const legacyReimbursement = await factory.create('reimbursement', {
      advanceId: advance.id,
      amount: 5,
      reimburserId: internalUser.id,
    });

    const req = request(app)
      .get(`/v2/advances/${advance.id}`)
      .expect(200);

    const {
      body: { included },
    } = await withInternalUser(req);

    const advanceRefunds: advanceSerializers.IAdvanceRefundResource[] = included.filter(
      (item: IApiResourceObject) => item.type === 'advance-refund',
    );

    const [legacyAdvanceRefund] = advanceRefunds.filter(
      refund => refund.id === `legacy-${legacyReimbursement.id}`,
    );

    const [newAdvanceRefund] = advanceRefunds.filter(refund => refund.id === `${advanceRefund.id}`);

    expect(legacyAdvanceRefund.attributes.actionLogId).to.equal(
      `legacy-refund-action-${legacyReimbursement.id}`,
    );
    expect(newAdvanceRefund.attributes.actionLogId).to.equal(dashboardActionLog.id);
  });
});
