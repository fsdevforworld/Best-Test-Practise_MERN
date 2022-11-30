import { AuditLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import serialize from '../serialize';
import IUserEventResource from './i-user-event-resource';

const serializeAuditLog: serialize<AuditLog, IUserEventResource> = async (auditLog: AuditLog) => {
  return {
    id: `audit-log-${auditLog.id}`,
    type: 'user-event',
    attributes: {
      created: serializeDate(auditLog.created),
      extra: auditLog.extra,
      message: auditLog.message,
      name: auditLog.type,
      successful: auditLog.successful,
    },
  };
};

export default serializeAuditLog;
