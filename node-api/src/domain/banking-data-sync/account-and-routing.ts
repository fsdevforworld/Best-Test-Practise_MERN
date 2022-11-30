import { AuditLog, BankAccount, User } from '../../models';
import { BankAccountAndRouting } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import SynapsepayNodeLib from '../synapsepay/node';
import { isStagingEnv } from '../../lib/utils';
import { ConflictError } from '../../lib/error';

export async function addAccountAndRouting(
  bankAccount: BankAccount,
  auth?: BankAccountAndRouting,
): Promise<BankAccount> {
  dogstatsd.increment('bank_account.add_account_and_routing.called');
  const { userId, externalId } = bankAccount;

  // Throws error if illegal duplicate is found.
  const accountWithSameNumber = await findDuplicateAccount(bankAccount, auth);

  if (!accountWithSameNumber && auth) {
    const encrypted = await BankAccount.encryptAccountNumber(auth.account, auth.routing);
    const hashed = BankAccount.hashAccountNumber(auth.account, auth.routing);
    bankAccount.accountNumber = hashed;
    bankAccount.accountNumberAes256 = encrypted;

    if (auth.account) {
      bankAccount.lastFour = auth.account.slice(-4);
    }

    if (!bankAccount.microDepositComplete()) {
      // Plaid's account/routing is infallible and should always override microdeposit's.
      //
      // For some institutions, Plaid can't retrieve account/routing
      // even though the institution is "officially" supported. We let
      // these users verify via microdeposits, and then we override that
      // verification when Plaid starts working again.
      const [institution, user] = await Promise.all([
        bankAccount.getInstitution(),
        User.findByPk(userId),
      ]);

      dogstatsd.increment('bank_account.override_micro_deposit_with_plaid_auth');

      await Promise.all([
        // Microdeposit SynapsePay nodes' permissions can be degraded
        // pre-verification. Deletion now allows creation later with
        // fresh and elevated credit+debit permissions.
        bankAccount.synapseNodeId
          ? SynapsepayNodeLib.deleteSynapsePayNode(user, bankAccount)
          : null,
        AuditLog.create({
          userId,
          type: 'ACH_MICRO_DEPOSIT_OVERRIDDEN',
          successful: true,
          eventUuid: externalId,
          extra: {
            bankAccountId: bankAccount.id,
            institutionName: institution.displayName,
            plaidInstitutionId: institution.plaidInstitutionId,
          },
        }),
      ]);

      bankAccount.microDeposit = null;
      bankAccount.microDepositCreated = null;
      bankAccount.synapseNodeId = null;
    }

    await bankAccount.save();
  }

  return bankAccount;
}

export async function findDuplicateAccount(
  bankAccount: BankAccount,
  auth?: BankAccountAndRouting,
): Promise<BankAccount> {
  const { bankConnectionId, userId } = bankAccount;

  let accountWithSameNumber: BankAccount;

  if (auth) {
    const hashed = BankAccount.hashAccountNumber(auth.account, auth.routing);
    accountWithSameNumber = await BankAccount.findOne({ where: { accountNumber: hashed } });
    // We have to check if the bank connection IDs are the same, because `values.id` won't exist
    if (accountWithSameNumber && accountWithSameNumber.bankConnectionId !== bankConnectionId) {
      // Checks if the same user tried to login into the same bank account
      if (accountWithSameNumber.userId !== userId && !isStagingEnv()) {
        dogstatsd.increment('bank_account.find_duplicate_account.dupe_found');
        // leave for CS
        await AuditLog.create({
          userId,
          type: 'DUPLICATE_BANK_ACCOUNT',
          successful: true,
          eventUuid: bankConnectionId,
          extra: {
            duplicateAccount: accountWithSameNumber.toJSON(),
            newAccount: bankAccount.toJSON(),
          },
        });
        throw new ConflictError('Duplicate accounts found', {
          data: { accountWithSameNumber },
        });
      } else {
        accountWithSameNumber = null;
        dogstatsd.increment('bank_account.find_duplicate_account.user_re_added_account');
      }
    }
  }

  dogstatsd.increment('bank_account.find_duplicate_account.none_found');
  return accountWithSameNumber;
}
