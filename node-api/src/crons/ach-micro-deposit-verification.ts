import * as Bluebird from 'bluebird';

import { moment } from '@dave-inc/time-lib';
import SynapsepayNodeLib from '../domain/synapsepay/node';
import * as Notification from '../domain/notifications';
import { AuditLog, BankAccount, User } from '../models';
import { get } from 'lodash';
import { MicroDepositType } from '../models/bank-account';
import { dogstatsd } from '../lib/datadog-statsd';
import { Op } from 'sequelize';
import { Cron, DaveCron } from './cron';
import logger from '../lib/logger';

export const NO_SMS_THRESHOLD_DAYS = 10;

export async function getBankAccountsForMicroDepositValidation(): Promise<BankAccount[]> {
  const microDeposit = MicroDepositType.Required;
  return await BankAccount.findAll({
    where: {
      microDeposit,
      microDepositCreated: { [Op.lt]: moment().format('YYYY-MM-DD') },
    },
  });
}

export async function setMicroDepositStatus(bankAccount: BankAccount, status: MicroDepositType) {
  if (status === MicroDepositType.Completed) {
    await Notification.sendACHMicroDepositVerified(bankAccount);
  } else {
    // micro-deposit failed. send failed SMS
    await Notification.sendACHMicroDepositNotFound(bankAccount);
  }
  await bankAccount.update({ microDeposit: status });
  await AuditLog.create({
    userId: bankAccount.userId,
    type: 'ACH_MICRO_DEPOSIT_VALIDATION',
    message: null,
    successful: status === MicroDepositType.Completed,
    eventUuid: bankAccount.id,
  });
}

async function verifyMicroDeposits(deposits: number[][], bankAccount: BankAccount) {
  const user = await User.findByPk(bankAccount.userId);
  for (const depositSet of deposits) {
    if (depositSet && depositSet.length === 2) {
      const verified = await SynapsepayNodeLib.verifyMicroDeposit(
        user,
        bankAccount,
        depositSet[0],
        depositSet[1],
      );
      if (verified) {
        dogstatsd.increment('ach_micro_deposit.succeeded');
        return setMicroDepositStatus(bankAccount, MicroDepositType.Completed);
      }
    }
  }

  dogstatsd.increment('ach_micro_deposit.failed.no_match');
  return setMicroDepositStatus(bankAccount, MicroDepositType.Failed);
}

export async function main() {
  const smsThresholdDate = moment().subtract(NO_SMS_THRESHOLD_DAYS, 'day');
  const thresholdDate = moment().subtract(5, 'day');
  const bankAccounts = await getBankAccountsForMicroDepositValidation();
  logger.info(`Running micro-deposit verification task on ${bankAccounts.length} accounts`);
  await Bluebird.each(bankAccounts, async (bankAccount: BankAccount) => {
    try {
      const deposits = await bankAccount.findACHMicroDeposit();
      const hasMatchingDeposits = deposits.length > 0;
      if (hasMatchingDeposits) {
        await verifyMicroDeposits(deposits, bankAccount);
      } else if (bankAccount.microDepositCreated <= smsThresholdDate) {
        dogstatsd.increment('ach_micro_deposit.failed.too_long_ago');
        await setMicroDepositStatus(bankAccount, MicroDepositType.Failed);
      } else if (bankAccount.microDepositCreated <= thresholdDate) {
        dogstatsd.increment('ach_micro_deposit.failed.not_found');
        await Notification.sendACHMicroDepositNotFound(bankAccount);
      }
    } catch (error) {
      const msg = get(error, 'response.body.error.en', '');
      if (msg.match(/Unable to verify node since node permissions are CREDIT-AND-DEBIT/)) {
        dogstatsd.increment('ach_micro_deposit.failed.credit_and_debit');
        await bankAccount.update({ microDeposit: MicroDepositType.Completed });
      } else if (msg.match(/Unable to verify node since node permissions are LOCKED/)) {
        dogstatsd.increment('ach_micro_deposit.failed.locked');
        await bankAccount.update({ microDeposit: MicroDepositType.Failed });
      }

      logger.error(`Error finding ACH micro-deposit ${bankAccount.id}`, { error });
    }
  });
}

export const AchMicroDepositVerification: Cron = {
  name: DaveCron.AchMicroDepositVerification,
  process: main,
  schedule: '0 15,19,23 * * *',
};
