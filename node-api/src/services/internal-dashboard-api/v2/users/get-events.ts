import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { AuditLog, User } from '../../../../models';
import { eventSerializers, serializeMany } from '../../serializers';
import { Op, WhereOptions } from 'sequelize';
import { moment } from '@dave-inc/time-lib';
import { Request } from 'express';

const buildWhereClause = (query: Request['query'], user: User): WhereOptions => {
  const { name = {}, created = {} } = query.filter || {};
  const { in: nameIn = [] } = name;
  const { lte, gte, lt, gt } = created;

  const whereClause: WhereOptions = { userId: user.id };

  if (nameIn.length) {
    whereClause.type = nameIn;
  }

  if (lte || gte || lt || gt) {
    let whereCreated: WhereOptions = {};

    if (lte) {
      whereCreated = {
        [Op.lte]: moment(lte),
      };
    }

    if (gte) {
      whereCreated = {
        ...whereCreated,
        [Op.gte]: moment(gte),
      };
    }

    if (lt) {
      whereCreated = {
        ...whereCreated,
        [Op.lt]: moment(lt),
      };
    }

    if (gt) {
      whereCreated = {
        ...whereCreated,
        [Op.gt]: moment(gt),
      };
    }

    whereClause.created = whereCreated;
  }

  return whereClause;
};

async function getEvents(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<eventSerializers.IUserEventResource[]>,
) {
  const { resource: user, query } = req;

  const where = buildWhereClause(query, user);

  const { order = 'DESC' } = query;
  const { limit = '200', offset = '0' } = query.page || {};

  const auditLogs = await AuditLog.findAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [['created', order]],
  });

  const data = await serializeMany(auditLogs, eventSerializers.serializeAuditLog);

  const payload = { data };

  return res.send(payload);
}

export default getEvents;
