import { FraudAlert, User } from '../../../models';
import { moment } from '@dave-inc/time-lib';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';

async function patch(
  req: IDashboardApiRequest<{ resolved: string }>,
  res: Response,
): Promise<void> {
  const { id } = req.params;
  const { resolved } = req.body;

  const alert = await FraudAlert.findByPk(id);

  if (!alert.resolved) {
    await alert.update({ resolved: moment(resolved).format('YYYY-MM-DD HH:mm:ss') });
  }

  const userAlerts = await FraudAlert.findAll({ where: { userId: alert.userId } });
  const hasActiveAlerts = userAlerts.some(fraudAlert => !fraudAlert.resolved);

  if (!hasActiveAlerts) {
    await User.update({ fraud: false }, { where: { id: alert.userId } });
  }

  res.status(200).send();
}

export default {
  patch,
};
