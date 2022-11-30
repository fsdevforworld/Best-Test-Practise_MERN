import { AdvanceResponse } from '@dave-inc/wire-typings';

import { Advance } from '../../../../models';
import { getExtras, IAdvanceExtras } from '../../domain/advance';

interface IAdvanceResponse extends AdvanceResponse, IAdvanceExtras {
  paybackForm: string;
}

async function formatAdvanceResponse(advance: Advance): Promise<IAdvanceResponse> {
  const [serializedAdvance, statusesAndFlags] = await Promise.all([
    advance.serializeAdvanceWithTip(),
    getExtras(advance),
  ]);

  return {
    ...advance.toJSON(),
    ...serializedAdvance,
    ...statusesAndFlags,
    paybackForm: advance.getWebPaybackUrl(),
  };
}

export { IAdvanceResponse };
export default formatAdvanceResponse;
