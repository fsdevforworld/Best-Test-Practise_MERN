import {
  IApiToOneRelationshipObject,
  IApiToManyRelationshipObject,
  IApiRelationshipObjects,
  IApiResourceObject,
  IRawRelationships,
} from '../../../typings';

function serializeToOneRelationship(resource: IApiResourceObject): IApiToOneRelationshipObject {
  if (!resource) {
    return { data: null };
  }

  return { data: { id: resource.id, type: resource.type } };
}

function serializeToManyRelationship(
  resources: IApiResourceObject[],
): IApiToManyRelationshipObject {
  if (resources.length === 0) {
    return { data: null };
  }

  return { data: resources.map(resource => ({ id: resource.id, type: resource.type })) };
}

function serializeRelationships(relationships: IRawRelationships): IApiRelationshipObjects {
  if (!relationships) {
    return {};
  }

  return Object.keys(relationships).reduce((acc: IApiRelationshipObjects, relationshipKey) => {
    const resource = relationships[relationshipKey];

    const serializedRelationship = Array.isArray(resource)
      ? serializeToManyRelationship(resource)
      : serializeToOneRelationship(resource);

    return {
      ...acc,
      [relationshipKey]: serializedRelationship,
    };
  }, {});
}

export default serializeRelationships;
