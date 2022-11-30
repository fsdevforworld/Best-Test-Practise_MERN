import serialize from '../serialize';

import { IApiBankAccountMonthlyStatement } from '@dave-inc/banking-internal-api-client';
import IMonthlyStatementResource from './i-monthly-statement-resource';
import serializeRelationships from '../serialize-relationships';

const serializer: serialize<
  IApiBankAccountMonthlyStatement,
  IMonthlyStatementResource
> = async function serializeMonthlyStatement(statement, relationships) {
  const { id, month, year } = statement;

  return {
    id,
    type: 'monthly-statement',
    attributes: {
      month,
      year,
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializer;
