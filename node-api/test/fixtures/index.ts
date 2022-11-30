import userFixture from './user';
import userSessionFixture from './user-session';
import institutionFixture from './institution';
import bankConnectionFixture from './bank-connection';
import bankAccountFixture from './bank-account';
import paymentMethodFixture from './payment-method';
import advanceFixture from './advance';
import paymentFixture from './payment';
import alertFixture from './alert';
import subscriptionPaymentFixture from './subscription-payment';
import dailyBalanceLogFixture from './daily-balance-log';
import synapsepayDocumentFixture from './synapsepay-document';
import adminPaycheckOverrideFixture from './admin-paycheck-override';
import onboardingStepFixture from './onboarding-step';
import recurringTransactionFixture from './recurring-transaction';
import expectedTransactionFixture from './expected-transaction';
import transactionSettlementFixture from './transaction-settlement';

const Exports: {
  [name: string]: { upSql?: string; tableName: string; up?: () => PromiseLike<any> };
} = {
  userFixture,
  userSessionFixture,
  institutionFixture,
  bankConnectionFixture,
  bankAccountFixture,
  paymentMethodFixture,
  advanceFixture,
  paymentFixture,
  alertFixture,
  subscriptionPaymentFixture,
  dailyBalanceLogFixture,
  synapsepayDocumentFixture,
  adminPaycheckOverrideFixture,
  onboardingStepFixture,
  recurringTransactionFixture,
  expectedTransactionFixture,
  transactionSettlementFixture,
};

export default Exports;

export {
  userFixture,
  userSessionFixture,
  institutionFixture,
  bankConnectionFixture,
  bankAccountFixture,
  paymentMethodFixture,
  advanceFixture,
  paymentFixture,
  alertFixture,
  subscriptionPaymentFixture,
  dailyBalanceLogFixture,
  synapsepayDocumentFixture,
  adminPaycheckOverrideFixture,
  onboardingStepFixture,
  recurringTransactionFixture,
  expectedTransactionFixture,
  transactionSettlementFixture,
};
