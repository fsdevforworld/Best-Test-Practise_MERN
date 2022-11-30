import logger from '../../../src/lib/logger';
import { dashboardActions, dashboardNotePriorities, internalRoles } from './initial-seeds';
import {
  advanceApproval,
  advanceChangelog,
  advanceRefund,
  advanceWithPendingPayment,
  cooledOffUser,
  debitCards,
  deletedUser,
  frozenAdvance,
  internalUsers,
  multipleAdvances,
  multipleTransactions,
  multipleEmailVerifications,
  overpaidAdvance,
  refreshPayment,
  pendingAdvanceDisbursement,
  savingsAccount,
  userEvents,
  userChangelog,
  userSearch,
  userNotes,
  waivableAdvance,
  userRoles,
} from './user-seeds';

async function up(phoneNumberSeed: string = '123') {
  await Promise.all([internalRoles.up(), dashboardActions.up(), dashboardNotePriorities.up()]);

  await Promise.all([
    advanceApproval.up(phoneNumberSeed),
    advanceChangelog.up(phoneNumberSeed),
    advanceRefund.up(phoneNumberSeed),
    advanceWithPendingPayment.up(phoneNumberSeed),
    cooledOffUser.up(phoneNumberSeed),
    debitCards.up(phoneNumberSeed),
    deletedUser.up(phoneNumberSeed),
    frozenAdvance.up(phoneNumberSeed),
    internalUsers.up(phoneNumberSeed),
    multipleAdvances.up(phoneNumberSeed),
    multipleEmailVerifications.up(phoneNumberSeed),
    multipleTransactions.up(phoneNumberSeed),
    overpaidAdvance.up(phoneNumberSeed),
    refreshPayment.up(phoneNumberSeed),
    pendingAdvanceDisbursement.up(phoneNumberSeed),
    savingsAccount.up(phoneNumberSeed),
    userChangelog.up(phoneNumberSeed),
    userEvents.up(phoneNumberSeed),
    userSearch.up(phoneNumberSeed),
    userNotes.up(phoneNumberSeed),
    userRoles.up(phoneNumberSeed),
    waivableAdvance.up(phoneNumberSeed),
  ]);
}

async function down(phoneNumberSeed: string = '123') {
  await Promise.all([
    advanceApproval.down(phoneNumberSeed),
    advanceChangelog.down(phoneNumberSeed),
    advanceRefund.down(phoneNumberSeed),
    advanceWithPendingPayment.down(phoneNumberSeed),
    cooledOffUser.down(phoneNumberSeed),
    debitCards.down(phoneNumberSeed),
    deletedUser.down(phoneNumberSeed),
    frozenAdvance.down(phoneNumberSeed),
    internalUsers.down(phoneNumberSeed),
    multipleAdvances.down(phoneNumberSeed),
    multipleEmailVerifications.down(phoneNumberSeed),
    multipleTransactions.down(phoneNumberSeed),
    overpaidAdvance.down(phoneNumberSeed),
    refreshPayment.down(phoneNumberSeed),
    pendingAdvanceDisbursement.down(phoneNumberSeed),
    savingsAccount.down(phoneNumberSeed),
    userEvents.down(phoneNumberSeed),
    userChangelog.down(phoneNumberSeed),
    userSearch.down(phoneNumberSeed),
    userNotes.down(phoneNumberSeed),
    userRoles.down(phoneNumberSeed),
    waivableAdvance.down(phoneNumberSeed),
  ]);
}

export { up, down };

if (require.main === module) {
  up()
    .then(() => process.exit())
    .catch(ex => {
      logger.error('Dashboard seeds failed', { error: ex });
      process.exit(1);
    });
}
