import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';
import { AuditLog } from '../../../../models';

const serializeEventName: serialize<AuditLog, IApiResourceObject> = async auditLog => {
  return {
    id: auditLog.type,
    type: 'event-name',
  };
};

export default serializeEventName;
