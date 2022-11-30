import { AdvanceApproval } from '../../src/models';
import { moment } from '@dave-inc/time-lib';

export default function(factory: any) {
  factory.define(
    'advance-approval',
    AdvanceApproval,
    {
      userId: factory.assoc('bank-account', 'userId'),
      bankAccountId: factory.assoc('bank-account', 'id'),
      defaultPaybackDate: moment()
        .add(1, 'week')
        .format('YYYY-MM-DD'),
      approvedAmounts: [25, 50, 75],
      approved: true,
    },
    {
      afterBuild: (model: AdvanceApproval) => {
        if (Math.max(...model.approvedAmounts) > 20) {
          model.normalAdvanceApproved = true;
          model.microAdvanceApproved = false;
        } else {
          model.normalAdvanceApproved = false;
          model.microAdvanceApproved = true;
        }

        return model;
      },
    },
  );

  factory.extend('advance-approval', 'big-money-advance-approval', {
    approvedAmounts: [25, 50, 75],
  });

  factory.extend('advance-approval', 'tiny-money-advance-approval', {
    approvedAmounts: [10, 15, 20],
    microAdvanceApproved: true,
  });
}
