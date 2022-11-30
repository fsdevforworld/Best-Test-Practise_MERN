import * as Bluebird from 'bluebird';
import { Op } from 'sequelize';
import { Advance, BankAccount, PaymentMethod } from '../../src/models';

export enum ConflictResolutionState {
  'KeepTabapayInvalidateRisepay' = 'Tabapay card kept, Risepay card marked deleted',
  'KeepRisepayInvalidateTabapay' = 'Risepay card kept, Tabapay card marked deleted',
}

async function addTabapayIdSuffixAndInvalidate(
  paymentMethod: PaymentMethod,
  tabapayId: string = paymentMethod.tabapayId,
): Promise<void> {
  if (tabapayId) {
    const suffix = '_duplicate'; // risepay_id and tabapay_id db columns are 256 length
    const suffixedTabapayId = `${tabapayId}${suffix}`;

    await paymentMethod.update({
      tabapayId: suffixedTabapayId,
    });
  }

  await invalidateCard;
}

export async function invalidateCard(paymentMethod: PaymentMethod) {
  if (!paymentMethod.deleted) {
    await paymentMethod.destroy();
  }
}

export async function handleCardConflict(
  tabapayCard: PaymentMethod,
  risepayCard: PaymentMethod,
  tabapayId: string,
): Promise<{ cardConflictResolution: ConflictResolutionState; cardConflictScenario: string }> {
  const isRisepayCardValid = !risepayCard.deleted && !risepayCard.invalid;
  const isTabapayCardValid = !tabapayCard.deleted && !tabapayCard.invalid;

  let scenario: string;
  let resolution: ConflictResolutionState;

  if (isRisepayCardValid && !isTabapayCardValid) {
    scenario = '1 - Risepay valid + Tabapay invalid';
    resolution = ConflictResolutionState.KeepRisepayInvalidateTabapay;
  } else if (!isRisepayCardValid && isTabapayCardValid) {
    scenario = '2 - Risepay invalid + Tabapay valid';
    resolution = ConflictResolutionState.KeepTabapayInvalidateRisepay;
  } else if (!isRisepayCardValid && !isTabapayCardValid) {
    scenario = '3 - Risepay invalid + Tabapay invalid';
    resolution = ConflictResolutionState.KeepTabapayInvalidateRisepay;
  } else if (isRisepayCardValid && isTabapayCardValid) {
    scenario = '4 - Risepay & Tabapay both valid';

    // Check for cards marked as default payment method for bank account
    const [tabapayBankAccount, risepayBankAccount] = await Bluebird.all([
      BankAccount.findOne({
        where: { id: tabapayCard.bankAccountId, defaultPaymentMethodId: tabapayCard.id },
      }),
      BankAccount.findOne({
        where: { id: risepayCard.bankAccountId, defaultPaymentMethodId: risepayCard.id },
      }),
    ]);

    // Get open advances on these cards
    const [tabapayAdvance, risepayAdvance] = await Bluebird.all([
      Advance.findOne({
        where: {
          paymentMethodId: tabapayCard.id,
          outstanding: { [Op.gt]: 0 },
        },
      }),
      Advance.findOne({
        where: { paymentMethodId: risepayCard.id, outstanding: { [Op.gt]: 0 } },
      }),
    ]);

    const isTabapayCardInUse = tabapayBankAccount || tabapayAdvance;
    const isRisepayCardInUse = risepayBankAccount || risepayAdvance;

    if (isTabapayCardInUse && !isRisepayCardInUse) {
      scenario += ' - tabapay card in use - keeping tabapay';
      resolution = ConflictResolutionState.KeepTabapayInvalidateRisepay;
    } else if (isRisepayCardInUse && !isTabapayCardInUse) {
      scenario += ' - risepay card in use - keeping risepay';
      resolution = ConflictResolutionState.KeepRisepayInvalidateTabapay;
    } else if (!isRisepayCardInUse && !isTabapayCardInUse) {
      scenario += ' - neither risepay nor tabapay card in use - keeping tabapay';
      // Pick one: Tabapay
      resolution = ConflictResolutionState.KeepTabapayInvalidateRisepay;
    } else {
      // Situation: Both cards in use -- Either one is tied to advance, one is tied to bank, or (potentially more rare) both are tied to different advances (one advance was chargeback later on)
      // Solution: Change defaults to one card and invalidate other -- since same card technically. Choose existing tabapay instead of risepay for simplicity.

      scenario += 'Both risepay and tabapay cards are in use.';

      let resolutionDetails: string;
      if (risepayAdvance) {
        if (risepayAdvance.userId === tabapayCard.userId) {
          await risepayAdvance.update({ paymentMethodId: tabapayCard.id });
          resolutionDetails += `Advance ID: ${risepayAdvance.id} changed payment method ID from ${risepayCard.id} (Risepay) to ${tabapayCard.id} (Tabapay).`;
        } else {
          resolutionDetails +=
            'Advance linked to Risepay Card has different user than existing Tabapay Card, no change made to Advance.';
        }
      }

      if (risepayBankAccount) {
        // Same user -> Delete card for now
        if (risepayBankAccount.userId === tabapayCard.userId) {
          await risepayBankAccount.update({ defaultPaymentMethodId: tabapayCard.id });
          resolutionDetails += `Same user so -> bank Account ID: ${risepayBankAccount.id} changed default payment method ID from ${risepayCard.id} (Risepay) to ${tabapayCard.id} (Tabapay).`;
        } else {
          resolutionDetails +=
            'Bank account linked to Risepay Card has different user than existing Tabapay Card, no change made to Bank Account';
        }
      }

      scenario += '.' + resolutionDetails;
      resolution = ConflictResolutionState.KeepTabapayInvalidateRisepay;
    }
  }

  // Handle Resolution
  if (resolution === ConflictResolutionState.KeepRisepayInvalidateTabapay) {
    await addTabapayIdSuffixAndInvalidate(tabapayCard);
    await risepayCard.update({ tabapayId });
  } else if (resolution === ConflictResolutionState.KeepTabapayInvalidateRisepay) {
    await addTabapayIdSuffixAndInvalidate(risepayCard, tabapayId);
  } else {
    throw new Error('Missing or invalid state in getCardConflictResolution()');
  }

  return { cardConflictScenario: scenario, cardConflictResolution: resolution };
}
