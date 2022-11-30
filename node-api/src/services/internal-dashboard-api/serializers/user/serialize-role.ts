import serialize from '../serialize';
import { IApiResourceObject } from '../../../../typings';
import { Role } from '../../../../models';

interface IRoleResource extends IApiResourceObject {
  type: 'role';
  attributes: {
    name: string;
  };
}

const serializer: serialize<Role, IRoleResource> = async function serializeRole(role) {
  return {
    id: `${role.id}`,
    type: 'role',
    attributes: {
      name: role.name || null,
    },
  };
};

export { IRoleResource };
export default serializer;
