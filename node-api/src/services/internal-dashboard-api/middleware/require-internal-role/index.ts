import { partial } from 'lodash';
import requireInternalRole from './require-internal-role';

export default function configureRequireInternalRole(internalRoleNames: string[]) {
  return partial(requireInternalRole, internalRoleNames);
}

export { requireInternalRole };
