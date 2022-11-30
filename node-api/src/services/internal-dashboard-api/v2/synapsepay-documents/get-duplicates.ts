import * as Bluebird from 'bluebird';
import { flatten } from 'lodash';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { SynapsepayDocument } from '../../../../models';
import { getDuplicateSynapsepayUserIds } from '../../../../domain/synapsepay';
import { synapsepaySerializers } from '../../serializers';

const { serializeDuplicateSynapsepayDocument } = synapsepaySerializers;

async function getDuplicates(
  req: IDashboardApiResourceRequest<SynapsepayDocument>,
  res: IDashboardV2Response<synapsepaySerializers.IDuplicateSynapsepayDocumentResource[]>,
) {
  const document = req.resource;

  const { closedUserIds, lockedUserIds, openUserIds } = await getDuplicateSynapsepayUserIds(
    document,
  );

  const serializedDocuments = await Promise.all([
    Bluebird.map(closedUserIds, serializeDuplicateSynapsepayDocument('CLOSED')),
    Bluebird.map(lockedUserIds, serializeDuplicateSynapsepayDocument('LOCKED')),
    Bluebird.map(openUserIds, serializeDuplicateSynapsepayDocument('OPEN')),
  ]);

  return res.send({ data: flatten(serializedDocuments) });
}

export default getDuplicates;
