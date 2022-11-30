import { IInternalOverdraftResponse } from '@dave-inc/overdraft-internal-client';
import serialize from '../serialize';
import IOverdraftResource from './i-overdraft-resource';

const serializeOverdraft: serialize<
  IInternalOverdraftResponse,
  IOverdraftResource
> = async overdraft => {
  const {
    id,
    accountId,
    approvalId,
    approvedAmount,
    created,
    disbursements,
    screenshotUrl,
    settlementDate,
    settlements,
    status,
  } = overdraft;

  const disbursementRelationships = disbursements.map(disbursement => ({
    id: disbursement.id,
    type: 'overdraft-disbursement',
  }));

  const settlementRelationships = settlements.map(settlement => ({
    id: settlement.id,
    type: 'overdraft-settlement',
  }));

  return {
    id: `${id}`,
    type: 'overdraft',
    attributes: {
      approvedAmount,
      created,
      screenshotUrl,
      settlementDate,
      status,
    },
    relationships: {
      approval: { data: { id: `${approvalId}`, type: 'advance-approval' } },
      overdraftAccount: { data: { id: accountId, type: 'overdraft-account' } },
      overdraftDisbursements: { data: disbursementRelationships },
      overdraftSettlements: { data: settlementRelationships },
    },
  };
};

export default serializeOverdraft;
