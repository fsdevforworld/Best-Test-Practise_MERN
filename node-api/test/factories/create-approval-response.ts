import { IStaticExtended, ObjectAdapter } from 'factory-girl';
import { moment } from '@dave-inc/time-lib';

export default function(factory: IStaticExtended) {
  const failureName = 'create-approval-failure';
  factory.define(failureName, Object, {
    advanceEngineRuleDescriptions: null,
    id: factory.assoc('advance-approval', 'id'),
    advanceType: undefined,
    isExperimental: false,
    microAdvanceApproved: false,
    normalAdvanceApproved: false,
    recurringTransactionId: null,
    recurringTransactionUuid: null,
    userId: 0,
    approved: false,
    approvedAmounts: [],
    primaryRejectionReason: {
      type: 'bad-advance',
      message: 'Cheese',
    },
    rejectionReasons: [
      {
        type: 'bad-advance',
        message: 'Cheese',
      },
    ],
    defaultPaybackDate: moment()
      .add(7, 'day')
      .ymd(),
  });

  const successName = 'create-approval-success';
  factory.define(successName, Object, {
    id: factory.assoc('advance-approval', 'id'),
    advanceEngineRuleDescriptions: null,
    advanceType: undefined,
    isExperimental: false,
    microAdvanceApproved: false,
    normalAdvanceApproved: true,
    recurringTransactionId: null,
    recurringTransactionUuid: null,
    userId: 0,
    approved: true,
    approvedAmounts: [75, 50, 25],
    defaultPaybackDate: moment()
      .add(7, 'day')
      .ymd(),
  });

  const adapter = new ObjectAdapter();
  factory.setAdapter(adapter, failureName);
  factory.setAdapter(adapter, successName);
}
