import { InternalRole } from '../../src/models';

export default function(factory: any) {
  factory.define('internal-role', InternalRole, {
    name: factory.sequence('InternalRole.name', (i: number) => `Role ${i}`),
  });
}
