import { IStaticExtended } from 'factory-girl';
import * as Faker from 'faker';

import { AdvancePaybackDatePrediction } from '../../src/models';

export default function(factory: IStaticExtended) {
  factory.define('advance-payback-date-prediction', AdvancePaybackDatePrediction, {
    advanceApprovalId: factory.assoc('advance-approval', 'id'),
    score: Faker.finance.amount(0, 1, 10),
    predictedDate: Faker.date.between('1970-01-01', new Date()),
  });
}
