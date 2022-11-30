import { IApiResourceObject } from '../../../typings';

function serializeMany<T, S = IApiResourceObject>(
  collection: T[],
  serializer: (item: T, options?: {}) => Promise<S>,
  options?: {},
): Promise<S[]> {
  return Promise.all(collection.map(col => serializer(col, options)));
}

export default serializeMany;
