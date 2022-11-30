import { IApiResourceObject, IRawRelationships } from 'src/typings';

type serialize<M, T extends IApiResourceObject> = (
  data: M,
  relationships?: IRawRelationships,
) => Promise<T>;

export default serialize;
