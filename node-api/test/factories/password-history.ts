import { PasswordHistory } from '../../src/models';

export default function(factory: any) {
  factory.define('password-history', PasswordHistory, {
    userId: factory.assoc('user', 'id'),
    password: '',
  });
}
