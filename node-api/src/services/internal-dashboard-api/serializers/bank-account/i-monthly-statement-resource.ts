import { IApiResourceObject } from '../../../../typings';

interface IMonthlyStatementResource extends IApiResourceObject {
  type: 'monthly-statement';
  attributes: {
    month: string;
    year: string;
  };
}

export default IMonthlyStatementResource;
