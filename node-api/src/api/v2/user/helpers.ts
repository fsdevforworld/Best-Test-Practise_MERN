import { Request, Response } from 'express';
import { QueryTypes } from 'sequelize';
import { isDevEnv, isProdEnv } from '../../../lib/utils';
import { FraudAlert, User, sequelize } from '../../../models';
import { FraudAlertReason } from '../../../typings';

export function setCookies(
  req: Request,
  res: Response,
  token: string,
  deviceId: string,
  deviceType: string,
) {
  // Dev/automated test envs sometimes run on ngrok or other users that do not include dave.com domain
  // In order to support authentication in these cases, we set the cookie on the request host
  // We should ONLY do this for dev.  Production ENVs need to set cookie to dave.com
  if (isDevEnv()) {
    const host = req.get('host');
    res.cookie(
      'user',
      { authorization: token, deviceId, deviceType },
      { path: '/', domain: host, signed: true },
    );
  }

  res.cookie(
    'user',
    { authorization: token, deviceId, deviceType },
    { path: '/', domain: 'dave.com', signed: true },
  );

  res.cookie(
    'user',
    { authorization: token, deviceId, deviceType },
    { maxAge: 1000 * 60 * 60 * 24 * 365, path: '/', domain: 'trydave.com', signed: true },
  );
}

export async function flagTooManyUsersOnDevice(user: User, deviceId: string) {
  const [{ userCount }] = await sequelize.query(
    `
  SELECT
    count(DISTINCT user.id) as userCount
  FROM user_session
  INNER JOIN user ON user.id = user_session.user_id
  WHERE
    device_id = ?
`,
    {
      replacements: [deviceId],
      type: QueryTypes.SELECT,
    },
  );

  if (isProdEnv() && userCount > 4) {
    await FraudAlert.createFromUserAndReason(user, FraudAlertReason.TooManyUsersOnDevice, {
      deviceId,
    });
  }
}
