import { IApiResourceObject } from '../../../../typings';
import { AccountStatus } from '@dave-inc/banking-goals-internal-api-client';

interface IGoalAccountResource extends IApiResourceObject {
  type: 'goals-account';
  attributes: {
    status: AccountStatus;
  };
}

export default IGoalAccountResource;
