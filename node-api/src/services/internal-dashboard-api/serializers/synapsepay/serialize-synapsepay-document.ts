import { SynapsepayDocument } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';
import { serializeDate } from '../../../../serialization';
import serialize from '../serialize';

interface ISynapsepayDocumentResource extends IApiResourceObject {
  attributes: {
    userId: number;
    synapsepayUserId: string;
    permission: string;
    phoneNumber: string;
    ssnStatus: string;
    licenseStatus: string;
    created: string;
    updated: string;
    deleted: string;
    sanctionsScreeningMatch: boolean;
    watchlists: string;
    permissionCode: string;
  };
}

const serializeSynapsepayDocument: serialize<
  SynapsepayDocument,
  ISynapsepayDocumentResource
> = async (document: SynapsepayDocument) => {
  return {
    id: `${document.id}`,
    type: `synapsepay-document`,
    attributes: {
      userId: document.userId,
      synapsepayUserId: document.synapsepayUserId,
      permission: document.permission,
      phoneNumber: document.phoneNumber,
      ssnStatus: document.ssnStatus,
      licenseStatus: document.licenseStatus,
      created: serializeDate(document.created),
      updated: serializeDate(document.updated),
      deleted: serializeDate(document.deleted),
      sanctionsScreeningMatch: document.sanctionsScreeningMatch,
      watchlists: document.watchlists,
      permissionCode: document.permissionCode,
    },
  };
};

export { ISynapsepayDocumentResource };
export default serializeSynapsepayDocument;
