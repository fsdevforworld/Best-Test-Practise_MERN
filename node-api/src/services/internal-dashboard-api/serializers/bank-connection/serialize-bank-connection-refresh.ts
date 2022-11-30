import { BankConnectionRefresh } from '../../../../models';

import { IApiResourceObject } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';
import { serializeDate } from '../../../../serialization';

interface IBankConnectionRefreshResource extends IApiResourceObject {
  type: 'bank-connection-refresh';
  attributes: {
    created: string;
    completedAt: string;
    errorAt: string;
    errorCode: string;
    processingAt: string;
    receivedAt: string;
    requestedAt: string;
    status: BankConnectionRefresh['status'][number];
    updated: string;
  };
}

const serializeBankConnectionRefresh: serialize<
  BankConnectionRefresh,
  IBankConnectionRefreshResource
> = async (connectionRefresh, relationships) => {
  return {
    type: 'bank-connection-refresh',
    id: `${connectionRefresh.id}`,
    attributes: {
      created: serializeDate(connectionRefresh.created),
      updated: serializeDate(connectionRefresh.updated),
      completedAt: serializeDate(connectionRefresh.completedAt),
      errorAt: serializeDate(connectionRefresh.errorAt),
      errorCode: connectionRefresh.errorCode,
      processingAt: serializeDate(connectionRefresh.processingAt),
      receivedAt: serializeDate(connectionRefresh.receivedAt),
      requestedAt: serializeDate(connectionRefresh.requestedAt),
      status: connectionRefresh.status,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IBankConnectionRefreshResource };
export default serializeBankConnectionRefresh;
