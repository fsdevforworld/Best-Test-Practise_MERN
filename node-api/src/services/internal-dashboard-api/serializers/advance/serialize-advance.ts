import { Advance } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import {
  ExternalTransactionStatus,
  DonationOrganizationCode,
  AdvanceNetwork,
  AdvanceDelivery,
} from '@dave-inc/wire-typings';

import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import { getExtras, BillingStatus, RepaymentStatus } from '../../domain/advance';
import { serializeUniversalId } from '../payment-method';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

export interface IAdvanceResource extends IApiResourceObject {
  type: 'advance';
  attributes: {
    amount: number;
    approvalCode: string;
    billingStatus: BillingStatus;
    canEditPaybackDate: boolean;
    canEditTip: boolean;
    canEditFee: boolean;
    created: string;
    delivery: AdvanceDelivery;
    destinationUniversalId: string;
    disbursementProcessor: string;
    disbursementStatus: ExternalTransactionStatus;
    donationOrganization: DonationOrganizationCode;
    externalId: string;
    fee: number;
    network: AdvanceNetwork;
    outstanding: number;
    paybackDate: string;
    paybackForm: string;
    paybackFrozen: boolean;
    referenceId: string;
    repaymentStatus: RepaymentStatus;
    screenshotImage: string;
    tip: number;
    tipPercent: number;
    userId: string;
    updated: string;
  };
}

const serializeAdvance: serialize<Advance, IAdvanceResource> = async (
  advance: Advance,
  relationships?: IRawRelationships,
) => {
  const [
    { repaymentStatus, billingStatus, canEditPaybackDate, canEditTip, canEditFee },
    advanceTip,
  ] = await Promise.all([getExtras(advance), advance.lazyGetAdvanceTip(true)]);

  return {
    type: 'advance',
    id: `${advance.id}`,
    attributes: {
      amount: advance.amount,
      approvalCode: advance.approvalCode,
      billingStatus,
      canEditPaybackDate,
      canEditTip,
      canEditFee,
      created: serializeDate(advance.created),
      delivery: advance.delivery,
      destinationUniversalId: serializeUniversalId(advance),
      disbursementProcessor: advance.disbursementProcessor,
      disbursementStatus: advance.disbursementStatus,
      donationOrganization: advanceTip.donationOrganization?.code,
      externalId: advance.externalId,
      fee: advance.fee,
      network: advance.getNetwork(),
      outstanding: advance.outstanding,
      paybackDate: serializeDate(advance.paybackDate, 'YYYY-MM-DD'),
      paybackForm: advance.getWebPaybackUrl(),
      paybackFrozen: advance.paybackFrozen,
      referenceId: advance.referenceId,
      repaymentStatus,
      screenshotImage: advance.screenshotImage,
      tip: advanceTip.amount,
      tipPercent: advanceTip.percent,
      userId: `${advance.userId}`,
      updated: serializeDate(advance.updated),
    },
    relationships: serializeRelationships(relationships),
  };
};

export default serializeAdvance;
