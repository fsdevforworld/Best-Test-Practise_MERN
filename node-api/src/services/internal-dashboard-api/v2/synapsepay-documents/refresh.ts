import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { SynapsepayDocument } from '../../../../models';
import { refreshDocument } from '../../../../domain/synapsepay';
import { synapsepaySerializers } from '../../serializers';

async function refresh(
  req: IDashboardApiResourceRequest<SynapsepayDocument>,
  res: IDashboardV2Response<synapsepaySerializers.ISynapsepayDocumentResource>,
) {
  const document = req.resource;

  await refreshDocument(document);

  await document.reload({ paranoid: false });

  const serializedDocument = await synapsepaySerializers.serializeSynapsepayDocument(document);

  return res.send({ data: serializedDocument });
}

export default refresh;
