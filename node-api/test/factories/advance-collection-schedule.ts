import * as Faker from 'faker';

import { moment } from '@dave-inc/time-lib';

import { AdvanceCollectionSchedule } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'advance-collection-schedule',
    AdvanceCollectionSchedule,
    {
      advanceId: factory.assoc('advance', 'id'),
      windowStart: Faker.date.future(1),
    },
    {
      afterBuild: (model: AdvanceCollectionSchedule, attrs: any, buildOptions: any) => {
        if (!model.windowEnd) {
          model.windowEnd = moment(model.windowStart).add(1, 'days');
        }

        return model;
      },
    },
  );
}
