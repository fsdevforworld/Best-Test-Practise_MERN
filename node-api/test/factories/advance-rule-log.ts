import * as Faker from 'faker';
import { AdvanceRuleLog } from '../../src/models';

export default function(factory: any) {
  factory.define('advance-rule-log', AdvanceRuleLog, {
    success: Faker.random.boolean,
    ruleName: Faker.random.alphaNumeric,
    nodeName: Faker.random.alphaNumeric,
    advanceApprovalId: factory.assoc('advance-approval', 'id'),
  });
}
