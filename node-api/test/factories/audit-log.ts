import { AuditLog } from '../../src/models';
import * as Faker from 'faker';

export default function(factory: any) {
  factory.define('audit-log', AuditLog, {
    type: Faker.hacker.phrase,
  });
}
