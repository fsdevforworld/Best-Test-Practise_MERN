import { TabapayNetworkRCMapping } from '@dave-inc/loomis-client';
import { Reimbursement } from '../../../models';

function serializeReimbursementError(reimbursement: Reimbursement) {
  const networkRC = reimbursement.extra?.transactionResult?.data?.networkRC;

  if (networkRC) {
    const networkRCIndex = `Code_${networkRC}` as keyof typeof TabapayNetworkRCMapping;

    const message = TabapayNetworkRCMapping[networkRCIndex];

    return {
      code: networkRCIndex,
      message,
    };
  }

  return null;
}

export default serializeReimbursementError;
