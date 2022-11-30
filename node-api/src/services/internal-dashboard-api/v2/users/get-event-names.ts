import { AuditLog, User } from '../../../../models';
import {
  IApiResourceObject,
  IDashboardApiResourceRequest,
  IDashboardV2Response,
} from '../../../../typings';
import { serializeMany, eventSerializers } from '../../serializers';

async function getEventNames(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<IApiResourceObject[]>,
) {
  const user = req.resource;

  const auditLogs = await AuditLog.findAll({
    attributes: ['type'],
    where: { userId: user.id },
    group: 'type',
    order: [['type', 'ASC']],
  });

  const data = await serializeMany(auditLogs, eventSerializers.serializeEventName);

  const response = {
    data,
  };

  return res.send(response);
}

export default getEventNames;
