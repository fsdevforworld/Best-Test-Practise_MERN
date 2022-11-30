import { TransferType } from '@dave-inc/banking-goals-internal-api-client';
import { BankAccount } from '../../../../models';

async function getFundingSource(targetAccountId: string, transferType: TransferType) {
  let fundingSourceId: string = null;
  let fundingSourceType: string;

  switch (transferType) {
    case TransferType.Ach: {
      fundingSourceId = targetAccountId;
      fundingSourceType = 'bank-account';
      break;
    }
    case TransferType.Intrabank: {
      const bankAccount = await BankAccount.findOne({
        where: { externalId: targetAccountId },
        paranoid: false,
      });
      fundingSourceId = bankAccount?.id?.toString();
      fundingSourceType = 'bank-account';
      break;
    }
    // Right now, card funding does not have a way to associate a payment method.
    // https://trydave.slack.com/archives/C01PUBM90GY/p1614727715001700
    case TransferType.CardFunding: {
      fundingSourceId = null;
      fundingSourceType = 'payment-method';
      break;
    }
    default: {
      fundingSourceId = null;
    }
  }

  return { fundingSourceId, fundingSourceType };
}

export default getFundingSource;
