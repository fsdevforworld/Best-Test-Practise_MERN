import loomisClient, {
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { MIN_AVAILABLE_BALANCE, DAVE_BANKING_DD_ELIGIBILITY_MINIMUM, NodeNames } from '../common';
import { DecisionNode, getDecisionCaseError } from '../decision-node';
import { formatCurrency } from '../../../../lib/utils';
import UserHelper from '../../../../helper/user';
import RecurringTransactionClient from '../../recurring-transaction-client';
import {
  AdvanceApprovalResult,
  ApprovalDict,
  DecisionCaseError,
  DecisionNodeType,
  IDecisionCaseResponse,
  NodeRuleDescriptionInfo,
} from '../../types';
import { AdvanceFailureMessageKey } from '../../../../translations';
import { RecurringTransactionStatus } from '@dave-inc/wire-typings';

export const AWAITING_INITIAL_PULL_ERROR = 'awaiting-initial-pull';
export const BALANCE_TOO_LOW_ERROR = 'balance-too-low';

export default class EligibilityNode extends DecisionNode {
  public static async bankDisconnected(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!approvalDict.bankAccount.hasValidCredentials) {
      return {
        error: getDecisionCaseError(
          'bank-disconnected',
          'Please reconnect your bank so I can advance you money and continue to keep your balance safe.',
        ),
      };
    }
  }

  public static async numOutstandingAdvances(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (approvalDict.advanceSummary.outstandingAdvance) {
      const outstandingAdvance = approvalDict.advanceSummary.outstandingAdvance;

      const outstandingAmount = formatCurrency(outstandingAdvance.outstanding, 2);

      return {
        error: getDecisionCaseError(
          'one-advance',
          `I need to get paid back the ${outstandingAmount} you owe before I can advance you anymore.`,
          {
            extra: {
              outstandingAdvance,
            },
          },
        ),
      };
    }
  }

  public static async hasRecentPayment(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    const coolOffStatus = await UserHelper.getCoolOffStatus(approvalDict.userId);
    if (coolOffStatus.isCoolingOff) {
      const timezone = approvalDict.userTimezone;
      const date = coolOffStatus.coolOffDate
        .clone()
        .tz(timezone)
        .startOf('hour')
        .add(1, 'hour');
      const formatted = `${date.format('ddd, MMM DD')} at ${date.format('h:ss A')}`;
      const template =
        'Your payment is pending. Check back on {coolOffDate} to try and get another advance.';
      return {
        error: getDecisionCaseError(
          'has-recent-payment',
          template.replace('{coolOffDate}', formatted),
          {
            extra: {
              // Allows client to format date locally.
              coolOffDate: coolOffStatus.coolOffDate.format(),
              template,
            },
          },
        ),
      };
    }
  }

  public static async hasPendingPayment(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    const paymentResponse = await loomisClient.findTransactionDetails(
      PaymentProviderTransactionType.AdvancePayment,
      { daveUserId: approvalDict.userId, status: PaymentProviderTransactionStatus.Pending },
    );
    if ('error' in paymentResponse) {
      throw paymentResponse.error;
    }

    if (paymentResponse.data !== null) {
      return {
        error: getDecisionCaseError(
          'has-pending-payment',
          AdvanceFailureMessageKey.HasPendingPayment,
          {
            displayMessage: AdvanceFailureMessageKey.HasPendingPayment,
          },
        ),
      };
    }
  }

  public static async microDepositsAreComplete(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!approvalDict.bankAccount.microDepositComplete) {
      return {
        error: getDecisionCaseError(
          'micro-deposit-incomplete',
          AdvanceFailureMessageKey.MicroDepositFourDays,
          {
            displayMessage: AdvanceFailureMessageKey.MicroDepositFourDays,
          },
        ),
      };
    }
  }

  public static async hasEnoughBankAccountBalance(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (approvalDict.bankAccount.current < MIN_AVAILABLE_BALANCE) {
      return {
        error: getDecisionCaseError(BALANCE_TOO_LOW_ERROR, AdvanceFailureMessageKey.BalanceTooLow, {
          displayMessage: AdvanceFailureMessageKey.BalanceTooLow,
        }),
      };
    }
  }

  public static async hasInitialPull(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (approvalDict.bankAccount.initialPull === null) {
      return {
        error: getDecisionCaseError(
          AWAITING_INITIAL_PULL_ERROR,
          "I'm still waiting on your bank to send me the data I need to qualify you.",
        ),
      };
    }
  }

  /**
   * This is temporarily duplicating some logic from our income validation node
   * Previously, dave banking users without direct deposit setup would fail our income validation node,
   * but will then sometimes get approved from our ML models, or get tiny money.
   * But we don't want to give these users any money at all until they setup direct deposit (these advances are unprofitable, and we’re losing money on them)
   *
   * For now we will completely reject these users and kick them out of the engine as a short-term fix to prevent us from losing money
   * The long-term solution is to re-train our ml models to handle these type of dave banking users,
   * who have no direct deposit & very little bank transaction data.
   *
   * @param {ApprovalDict} approvalDict
   * @returns {Promise<IDecisionCaseResponse<AdvanceApprovalResult>>}
   */
  public static async daveBankingHasDirectDepositSetup(
    approvalDict: ApprovalDict,
  ): Promise<IDecisionCaseResponse<AdvanceApprovalResult>> {
    if (!approvalDict.bankAccount.isDaveBanking || approvalDict.incomeOverride) {
      return;
    }

    const hasValidPaycheck = (
      await RecurringTransactionClient.getIncomes({
        userId: approvalDict.userId,
        bankAccountId: approvalDict.bankAccount.id,
        status: [RecurringTransactionStatus.VALID, RecurringTransactionStatus.SINGLE_OBSERVATION],
      })
    ).some(({ userAmount }) => userAmount >= DAVE_BANKING_DD_ELIGIBILITY_MINIMUM);

    if (!hasValidPaycheck) {
      return {
        error: getDecisionCaseError(
          'dave-banking-no-income',
          'You must have a valid income greater than $200.',
        ),
      };
    }
  }

  public cases = [
    EligibilityNode.bankDisconnected,
    EligibilityNode.numOutstandingAdvances,
    EligibilityNode.hasRecentPayment,
    EligibilityNode.hasPendingPayment,
    EligibilityNode.microDepositsAreComplete,
    EligibilityNode.hasEnoughBankAccountBalance,
    EligibilityNode.hasInitialPull,
    EligibilityNode.daveBankingHasDirectDepositSetup,
  ];
  public name = NodeNames.EligibilityNode;
  public type = DecisionNodeType.Static;

  public getNodeRuleDescriptionInfo = (): NodeRuleDescriptionInfo[] => [
    {
      nodeName: NodeNames.EligibilityNode,
      matchingCases: [EligibilityNode.hasInitialPull.name],
      explicitDescription: 'I get paid in the account I connected',
      vagueDescription: 'I get paid in the account I connected',
    },
    {
      nodeName: NodeNames.EligibilityNode,
      matchingCases: [EligibilityNode.hasEnoughBankAccountBalance.name],
      explicitDescription: 'My account currently has a positive balance',
      vagueDescription: 'My account currently has a positive balance',
    },
  ];

  protected onError(
    errors: DecisionCaseError[],
    dict: ApprovalDict,
    prev: AdvanceApprovalResult,
  ): AdvanceApprovalResult {
    return {
      ...prev,
      approvedAmounts: [],
      rejectionReasons: errors,
    };
  }
}
