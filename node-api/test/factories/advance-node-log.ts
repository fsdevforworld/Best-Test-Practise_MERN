import * as Faker from 'faker';
import { AdvanceNodeLog } from '../../src/models';

export default function(factory: any) {
  factory.define('advance-node-log', AdvanceNodeLog, {
    success: Faker.random.boolean,
    name: Faker.random.alphaNumeric,
    advanceApprovalId: factory.assoc('advance-approval', 'id'),
    approvalResponse: {},
  });
}
