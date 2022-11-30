import { SynapsepayDocument } from '../../../../models';
import { IApiResourceObject } from '../../../../typings';

type DuplicateDocumentStatus = 'CLOSED' | 'LOCKED' | 'OPEN';

interface IDuplicateSynapsepayDocumentResource extends IApiResourceObject {
  attributes: {
    userId: number;
    synapsepayUserId: string;
    status: DuplicateDocumentStatus;
  };
}

const serializeDuplicateSynapsepayDocument = (status: DuplicateDocumentStatus) => async (
  synapsepayUserId: string,
): Promise<IDuplicateSynapsepayDocumentResource> => {
  const document = await SynapsepayDocument.findOne({
    where: { synapsepayUserId },
    paranoid: false,
  });

  return {
    id: `${document?.id}`,
    type: `duplicate-synapsepay-document`,
    attributes: {
      status,
      synapsepayUserId,
      userId: document?.userId || null,
    },
  };
};

export { IDuplicateSynapsepayDocumentResource };
export default serializeDuplicateSynapsepayDocument;
