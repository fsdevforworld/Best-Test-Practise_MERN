import { AdvanceCollectionTrigger } from '../../../../typings';
import { getTivanClient, TivanProcess } from '../../../../lib/tivan-client';
import { createTaskId } from '../../../../domain/repayment';
import {
  Advance,
  DashboardActionLog,
  DashboardAdvanceRepayment,
  sequelize,
} from '../../../../models';
import { CreateActionLogPayload } from '../action-log';

type Params = {
  advance: Advance;
  paymentMethodUniversalId: string;
  amount: number;
  actionLog: CreateActionLogPayload;
};

async function create(params: Params): Promise<DashboardAdvanceRepayment> {
  const { advance, amount, paymentMethodUniversalId, actionLog: actionLogParams } = params;
  const source = AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION;

  const taskId = createTaskId(advance.id, source);

  let advanceRepayment: DashboardAdvanceRepayment;
  await sequelize.transaction(async transaction => {
    const actionLog = await DashboardActionLog.create(actionLogParams, { transaction });

    advanceRepayment = await DashboardAdvanceRepayment.create(
      {
        dashboardActionLogId: actionLog.id,
        advanceId: advance.id,
        tivanTaskId: taskId,
        amount,
        paymentMethodUniversalId,
      },
      { transaction },
    );
  });

  await getTivanClient().createTask(
    {
      process: TivanProcess.AdvanceWithPayment,
      userId: advance.userId,
      advanceId: advance.id,
      source,
      payment: {
        paymentMethodId: paymentMethodUniversalId,
        amount,
        disableFallback: true,
      },
    },
    { taskId, apiTask: true },
  );

  return advanceRepayment.reload();
}

export default create;
