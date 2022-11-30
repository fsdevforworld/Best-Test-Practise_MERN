import { Moment, isMoment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { Transaction } from 'sequelize/types';
import { aggregateBroadcastCalls } from '../../../../domain/user-updates';
import { updateAndGetModifications, Modifications } from '../../../../lib/utils';
import { User, sequelize, DashboardActionLog, DashboardUserModification } from '../../../../models';
import UpdatePayload from './update-payload';

interface IDashboardActionLogParams {
  dashboardActionReasonId: number;
  internalUserId: number;
  zendeskTicketUrl?: string;
  note?: string;
}

interface IUpdateOptions {
  transaction?: Transaction;
}

function serializeMomentOrString(value: Moment | string, format?: MOMENT_FORMATS): string {
  return isMoment(value) ? value.format(format) : value;
}

function serializeModification(modification: Modifications): Modifications {
  const dateFields = ['birthdate'];

  return Object.entries(modification).reduce(
    (serialized, [fieldName, { previousValue, currentValue }]) => {
      let serializedPreviousValue = previousValue;
      let serializedCurrentValue = currentValue;

      if (dateFields.includes(fieldName)) {
        serializedPreviousValue = serializeMomentOrString(
          previousValue,
          MOMENT_FORMATS.YEAR_MONTH_DAY,
        );
        serializedCurrentValue = serializeMomentOrString(
          currentValue,
          MOMENT_FORMATS.YEAR_MONTH_DAY,
        );
      }

      serialized[fieldName] = {
        previousValue: serializedPreviousValue,
        currentValue: serializedCurrentValue,
      };

      return serialized;
    },
    {} as Modifications,
  );
}

async function updateUserTransaction(
  user: User,
  payload: UpdatePayload,
  actionLogParams: IDashboardActionLogParams,
  transaction: Transaction,
): Promise<DashboardUserModification> {
  await user.reload({ transaction, lock: transaction.LOCK.UPDATE, paranoid: false });

  const modification = await updateAndGetModifications(user, payload, { transaction });

  const dashboardActionLog = await DashboardActionLog.create(actionLogParams, { transaction });

  return DashboardUserModification.create(
    {
      userId: user.id,
      dashboardActionLogId: dashboardActionLog.id,
      modification: serializeModification(modification),
    },
    { transaction },
  );
}

async function update(
  user: User,
  payload: UpdatePayload,
  actionLogParams: IDashboardActionLogParams,
  { transaction }: IUpdateOptions = {},
) {
  const userModification = await (transaction
    ? updateUserTransaction(user, payload, actionLogParams, transaction)
    : sequelize.transaction(txn => updateUserTransaction(user, payload, actionLogParams, txn)));

  await Promise.all(
    aggregateBroadcastCalls({
      userId: user.id,
      modifications: userModification.modification,
      updateFields: payload,
      updateSynapse: true,
    }),
  );
}

export default update;
