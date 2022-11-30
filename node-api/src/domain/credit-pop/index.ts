import { isEmpty } from 'lodash';
import { BankConnection, CreditPopCode, User } from '../../models';
import { NotFoundError } from '../../lib/error';
import logger from '../../lib/logger';
import { dogstatsd } from '../../lib/datadog-statsd';
import amplitude from '../../lib/amplitude';
import { AnalyticsEvent, RecurringTransactionStatus } from '../../typings';
import { BankingDataSource } from '@dave-inc/wire-typings';
import * as RecurringTransactionDomain from '../recurring-transaction';
import AdvanceApprovalClient from '../../lib/advance-approval-client';

export default class CreditPopUser {
  private user: User;

  constructor(user: User) {
    this.user = user;
  }

  /**
   * Checks eligibility based on several conditions:
   *  - Check if Dave Bank account.
   *  - Check has direct deposit setup
   *  - Income of over 200
   *
   * @returns {Boolean}
   *  */
  public async isEligible(): Promise<boolean> {
    const bankConnection = await BankConnection.findOne({
      where: {
        userId: this.user.id,
        bankingDataSource: BankingDataSource.BankOfDave,
      },
    });
    if (isEmpty(bankConnection)) {
      logger.error(`No bank connection found for ${this.user.id}`);
      return false;
    }
    const recurringTransactions = await RecurringTransactionDomain.getUserIncomesByStatus(
      this.user.id,
      bankConnection.primaryBankAccountId,
      [RecurringTransactionStatus.VALID],
    );
    const hasMinRecurringIncome = recurringTransactions.some(
      t => t.userAmount >= AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT,
    );
    if (!hasMinRecurringIncome) {
      logger.info(
        `No recurring income of $${AdvanceApprovalClient.MINIMUM_PAYCHECK_AMOUNT} found for ${this.user.id}`,
      );
    }
    return hasMinRecurringIncome;
  }

  public async assign(): Promise<CreditPopCode> {
    let unassignedCode: CreditPopCode;

    try {
      await CreditPopCode.update(
        {
          userId: this.user.id,
        },
        {
          where: {
            userId: null,
          },
          limit: 1,
        },
      );

      unassignedCode = await CreditPopCode.findOne({
        where: {
          userId: this.user.id,
        },
      });

      if (!unassignedCode) {
        const errorMsg = 'All current Credit Pop codes have been claimed. Need to request more';
        logger.error(errorMsg);
        dogstatsd.event('credit_pop.out_of_codes', errorMsg);
        throw new NotFoundError();
      }

      amplitude.track({
        userId: this.user.id,
        eventType: AnalyticsEvent.CreditPopCodeAssigned,
        eventProperties: {
          code: unassignedCode.code,
        },
      });
      dogstatsd.increment('credit_pop.code_assign_success');
    } catch (error) {
      dogstatsd.increment('credit_pop.code_assign_fail');
      throw error;
    }

    return unassignedCode;
  }
}
