import { expect } from 'chai';
import { map } from 'lodash';
import {
  IApiResourceObject,
  IApiToManyRelationshipObject,
  IApiToOneRelationshipObject,
} from '../typings';

function isToManyRelationship(
  relationship: IApiToOneRelationshipObject | IApiToManyRelationshipObject,
): relationship is IApiToManyRelationshipObject {
  return Array.isArray(relationship.data);
}

function validateRelationships(
  response: { data: IApiResourceObject; included?: IApiResourceObject[] },
  types: { [key: string]: string },
) {
  const {
    data: { relationships },
    included = [],
  } = response;

  Object.keys(types).forEach(key => {
    const relationship = relationships[key];
    if (relationship.data !== null) {
      const ids = isToManyRelationship(relationship)
        ? map(relationship.data, 'id')
        : [relationship.data.id];

      ids.forEach((id: string) => {
        const hasMatch = included.some(
          (includedResource: IApiResourceObject) =>
            includedResource.type === types[key] && includedResource.id === id,
        );

        expect(hasMatch).to.equal(true, `Missing relationship`);
      });
    }
  });
}

export default validateRelationships;
