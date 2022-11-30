import { Response } from 'express';
import { IDaveRequest, IDaveResponse } from '../../typings/dave-request-response';
import { UserNotificationResponse } from '@dave-inc/wire-typings';
import { Notification, UserNotification } from '../../models';
import { updateById } from '../../domain/user-notification';

export async function getNotifications(
  req: IDaveRequest,
  res: IDaveResponse<UserNotificationResponse[]>,
): Promise<Response> {
  const userId = req.user.id;

  const notifications = await UserNotification.findAll({
    where: { userId },
    include: [Notification],
  });

  return res.send(
    notifications.map(n => ({ ...n.serialize(), notificationType: n.notification.type })),
  );
}

/*
 * Update user notification settings. Mainly used to toggle on or off.
 */
export async function updateNotification(
  req: IDaveRequest,
  res: IDaveResponse<UserNotificationResponse>,
): Promise<Response> {
  const userNotificationId = parseInt(req.params.id, 10);
  const userNotification = await updateById(req.user.id, userNotificationId, req.body);
  return res.send(userNotification.serialize());
}
