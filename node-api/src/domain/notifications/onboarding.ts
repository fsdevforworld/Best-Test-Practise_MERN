import * as config from 'config';

import sendgrid from '../../lib/sendgrid';
import * as analyticsClient from '../../services/analytics/client';

import { BankAccount, BankConnection, Institution, User } from '../../models';

import { sendSMS, SEND_LIMIT_ONCE, SEND_LIMIT_DAILY } from './direct-alert';
export async function sendVerificationCode(email: string, message: string) {
  const template: string = 'fb4efe7b-f91c-4d48-9e00-07ae24e0fe8f';
  const substitutions: object = { MESSAGE: message };
  const subject = 'Dave | Verification Code';

  await sendgrid.send(subject, template, substitutions, email);
}

/*
 * Send a notification that duplicate accounts are not supported
 */
export async function sendMultipleAccounts(userId: number) {
  await analyticsClient.track({
    userId: String(userId),
    event: 'shared accounts unsupported',
  });
}

/*
 * Send a notification that we have historical data for the connection
 * Rules:
 * - Only once per connection
 */
export async function sendHistorical(connectionId: number) {
  const connection = await BankConnection.findByPk(connectionId);

  const message =
    'I just got transaction data from your bank. You can pick back up where you left off: dave.com/m/open';

  await sendSMS(
    connection.userId,
    'HISTORICAL',
    connection.id,
    'bank_connection',
    message,
    null,
    SEND_LIMIT_ONCE,
  );
}

/*
 * Send an SMS when bank connection isn't supportable and Plaid Item has been deleted
 */
export async function sendUnsupportedBankConnection(bankConnection: BankConnection) {
  const institution = await Institution.findByPk(bankConnection.institutionId);
  const link = 'https://dave.com/m/unsupported';
  const message = `Bad news bears, your ${institution.displayName} account won’t let us connect. Please try again with a supported checking account ${link}`;
  await sendSMS(
    bankConnection.userId,
    'BANK_CONNECTION_UNSUPPORTED',
    bankConnection.id,
    'bank_connection',
    message,
  );
}

/*
 * Send an SMS when micro deposit has been verified
 */
export async function sendACHMicroDepositVerified(bankAccount: BankAccount) {
  const message = 'Good news! Your account has been verified, come on in: dave.com/m/verified';

  await sendSMS(
    bankAccount.userId,
    'ACH_MICRO_DEPOSIT_VALID',
    bankAccount.id,
    'bank_account',
    message,
    null,
    SEND_LIMIT_ONCE,
  );
}

/*
 * Send an SMS when micro deposit has failed
 */
export async function sendACHMicroDepositNotFound(bankAccount: BankAccount) {
  const message =
    'I haven’t been able to verify your account with the info you gave me. Check carefully and try again: dave.com/m/verify';

  await sendSMS(
    bankAccount.userId,
    'ACH_MICRO_DEPOSIT_NOT_FOUND',
    bankAccount.id,
    'bank_account',
    message,
    null,
    SEND_LIMIT_ONCE,
  );
}

/*
 * Send an SMS forty minutes after sign up if they have not connected a bank account
 */
export async function sendFortyMinuteReEngagement(user: User): Promise<void> {
  const message =
    'Hey friend, join over 500,000 other Dave members by securely connecting your bank account: Dave.com/m/connect';

  await sendSMS(
    user.id,
    'FORTY_MINUTE_RE_ENGAGEMENT',
    user.id,
    'user',
    message,
    null,
    SEND_LIMIT_ONCE,
  );
}

/*
 * Send an SMS next day after sign up if they have not connected a bank account
 */
export async function sendNextDayReEngagement(user: User): Promise<void> {
  const message = 'If you’d like to know a little more about me first: https://bit.ly/2L0WQfF';

  await sendSMS(user.id, 'NEXT_DAY_RE_ENGAGEMENT', user.id, 'user', message, null, SEND_LIMIT_ONCE);
}

export function sendUploadLicense(userId: number) {
  const licenseUploadDeepLink = `${config.get('dave.website.url')}/app/upload-license`;
  const message = `I'm having trouble verifying your account. Please upload your license here: ${licenseUploadDeepLink}`;

  return sendSMS(userId, 'UPLOAD_LICENSE', userId, null, message, null, SEND_LIMIT_DAILY);
}
