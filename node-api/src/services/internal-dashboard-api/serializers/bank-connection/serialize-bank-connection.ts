import { BankConnection } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import * as LoomisDomain from '../../../../services/loomis-api/domain/delete-bank-account';
import { IApiResourceObject } from '../../../../typings';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface IBankConnectionResource extends IApiResourceObject {
  type: 'bank-connection';
  attributes: {
    bankingDataSource: string;
    bankingDataSourceErrorAt: string;
    bankingDataSourceErrorCode: string;
    canBeArchived: boolean;
    created: string;
    deleted: string;
    externalId: string;
    hasValidCredentials: boolean;
    historicalPull: string;
    initialPull: string;
    institutionLogo: string;
    institutionName: string;
    lastPull: string;
  };
}

const serializeBankConnection: serialize<BankConnection, IBankConnectionResource> = async (
  connection,
  relationships,
) => {
  const institution = connection.institution || (await connection.getInstitution());

  const deletionRestrictions = await LoomisDomain.getDeletionRestrictions(connection);
  const hasLoomisDeletionRestrictions = deletionRestrictions.some(restriction => restriction);
  const isDaveSpending = connection.bankingDataSource === 'BANK_OF_DAVE';
  const isDeleted = !!connection.deleted;

  return {
    type: 'bank-connection',
    id: `${connection.id}`,
    attributes: {
      bankingDataSource: connection.bankingDataSource,
      bankingDataSourceErrorAt: serializeDate(connection.bankingDataSourceErrorAt),
      bankingDataSourceErrorCode: connection.bankingDataSourceErrorCode,
      canBeArchived: !isDeleted && !hasLoomisDeletionRestrictions && !isDaveSpending,
      created: serializeDate(connection.created),
      deleted: serializeDate(connection.deleted),
      externalId: connection.externalId,
      hasValidCredentials: connection.hasValidCredentials,
      historicalPull: serializeDate(connection.historicalPull),
      initialPull: serializeDate(connection.initialPull),
      institutionLogo: institution?.logo,
      institutionName: institution?.displayName,
      lastPull: serializeDate(connection.lastPull),
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IBankConnectionResource };
export default serializeBankConnection;
