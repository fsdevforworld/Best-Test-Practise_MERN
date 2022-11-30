import { DashboardActionLog } from '../models';
import { Moment } from '@dave-inc/time-lib';
import { BelongsToGetAssociationMixin } from 'sequelize/types';

interface IDashboardBaseModification {
  id: number;
  modification: IDashboardModification;
  created: Moment;
  dashboardActionLog: DashboardActionLog;

  getModifiedEntityType: () => string;
  getModifiedEntityId: () => number | string;
  getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;
}

interface IDashboardModification {
  [columnName: string]: {
    previousValue: unknown;
    currentValue: unknown;
  };
}

export { IDashboardBaseModification, IDashboardModification };
