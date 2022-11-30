import { UserRole } from '../../src/models';

export default function(factory: any) {
  factory.define('user-role', UserRole, {
    userId: factory.assoc('user', 'id'),
    roleId: factory.assoc('role', 'id'),
  });
}
