import ErrorHelper from '@dave-inc/error-helper';
import { AnalyticsEvent } from '../../typings';
import { AuditLog, BankAccount, Notification, User, UserNotification } from '../../models';
import { dogstatsd } from '../../lib/datadog-statsd';
import logger from '../../lib/logger';
import { BroadcastAdvanceApprovalData } from '../data';
import { recordEvent } from '../../domain/event';
import { moment } from '@dave-inc/time-lib';
import {
  AdvanceApprovalCreateResponse,
  AdvanceApprovalTrigger,
} from '../../services/advance-approval/types';
import AdvanceApprovalClient from '../../lib/advance-approval-client';
import { getTimezone } from '../../domain/user-setting';
import { NotificationType } from '../../models/notification';
import { get } from 'lodash';
import braze from '../../lib/braze';
import { getAdvanceSummary } from '../../domain/advance-approval-request';

export async function broadcastAdvanceApproval(
  data: BroadcastAdvanceApprovalData,
): Promise<boolean> {
  try {
    const bankAccount = await BankAccount.findByPk(data.bankAccountId, {
      include: [User],
    });

    if (bankAccount) {
      const user = bankAccount.user;
      const advanceApproval = await AdvanceApprovalClient.createAdvanceApproval({
        userTimezone: await getTimezone(user.id),
        userId: user.id,
        bankAccountId: bankAccount.id,
        advanceSummary: await getAdvanceSummary(user.id),
        trigger: AdvanceApprovalTrigger.PreApproval,
        auditLog: false,
        mlUseCacheOnly: true,
      });

      // publish to record event for snowflake table
      await recordEvent.publish({
        table: 'advance_approval_event',
        data: {
          user_id: user.id,
          bank_account_id: advanceApproval[0].bankAccountId,
          approval_amounts: advanceApproval[0].approvedAmounts,
          timestamp: moment().format(),
          requester: 'auto',
        },
      });

      // Braze handles SMS/push notifications
      const isTracked = await trackEventNotification(user.id, advanceApproval[0], {
        auditLogType: 'AUTO_APPLY_ADVANCE_APPROVED',
        analyticsEvent: AnalyticsEvent.AutoAdvanceApproved,
      });

      logger.info(`Advance approval successfully broadcasted`, {
        bankAccountId: data.bankAccountId,
        notified: isTracked,
      });
      dogstatsd.increment('auto_advance_approval.user_notified');
      return isTracked;
    }
  } catch (err) {
    dogstatsd.increment('auto_advance_approval.error', 1, [`error:${err.name}`]);
    const formattedError = ErrorHelper.logFormat(err);
    logger.error('Advance approval failed to be broadcasted', {
      bankAccountId: data.bankAccountId,
      ...formattedError,
    });
    return false;
  }
}

type Options = {
  additionalEventProperties?: any;
  auditLogType: string;
  analyticsEvent: AnalyticsEvent;
};

export async function trackEventNotification(
  userId: number,
  approvalResponse: AdvanceApprovalCreateResponse,
  { additionalEventProperties = {}, auditLogType, analyticsEvent }: Options,
) {
  // We do not want to send a notification event if user is not approved.
  if (!approvalResponse.approved) {
    return false;
  }

  const notification = await Notification.findOne({
    where: { type: NotificationType.AUTO_ADVANCE_APPROVAL },
  });
  const userNotification = await UserNotification.findOne({
    where: { userId, notificationId: notification.id },
  });
  const approvedAmount = Math.max(...approvalResponse.approvedAmounts);
  const properties = {
    ...additionalEventProperties,
    amount: approvedAmount,
    paycheckDate: moment(approvalResponse.defaultPaybackDate).format('MM/DD/YY, ddd'),
    pushEnabled: get(userNotification, 'pushEnabled'),
    smsEnabled: get(userNotification, 'smsEnabled'),
  };

  // Braze handles SMS/push notification logic.
  const brazeNotificationEvent = braze.track({
    events: [
      {
        name: analyticsEvent,
        externalId: `${userId}`,
        properties,
        time: moment(),
      },
    ],
  });

  const auditLog = AuditLog.create({
    userId,
    type: auditLogType,
    message: `Pre-approved for advance and ${analyticsEvent} event sent.`,
    successful: true,
    extra: { approvalResponse },
  });

  await Promise.all([brazeNotificationEvent, auditLog]);

  return true;
}
