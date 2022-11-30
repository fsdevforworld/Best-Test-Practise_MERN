import * as Bluebird from 'bluebird';
import { ValidationError } from 'sequelize';
import logger from '../../src/lib/logger';

Bluebird.config({
  cancellation: true,
});

export const devSeeds = [
  'side-hustle-jobs',
  'normal',
  'dashboard-data',
  'eligibility-engine-fail',
  'micro-advance-pass',
  'micro-advance-fail',
  'multiple-bank-accounts',
  'payday-solvency-fail-micro-advance-pass',
  'payday-solvency-fail-micro-advance-fail',
  'income-engine-fail',
  'donation-organization',
  'non-first-advance-identity-fail',
  'non-first-advance-identity-pass',
  'bypass-ml-identity-fail',
  'bypass-ml-identity-pass',
  'admin-overrides',
  'previous-paid-advances-solvency-fail-normal-advance',
  'payday-solvency',
  'payday-solvency-fail-paid-back-admin-override-pass',
  'payday-solvency-fail-too-many-returned',
  'gig-economy-income-node',
  'synapsepay-send-and-receive-identity-fail',
  'email-verified',
  'onboarding',
  'tinymoney',
  'secondary-income',
  'config',
  'disconnected-bank',
  'zero-tip',
  'unverified',
  'previous-advances',
  'deleted-user',
  'sixty-days-fail',
  'subscription-billing-promotion',
  'micro-deposit-required',
  'multiple-paychecks',
  'users-with-settings',
  'user-email-password',
  'double-charge',
  'rewards',
  'sanctions-screening-match',
  'bod-connected-user',
  'plaid-sandbox',
  'help-center',
  'help-center-incident',
  'pending-advance-disbursement',
  'phone-number-change-request',
  'create-fraud-rule',
  'create-fraud-user',
  'pending-advance-payment',
  'referrals',
  'disbursed-advance-with-advance-network',
  'deleted-advance-disbursement',
  'paused-user',
  'covid-19-jobloss',
  'claimed-free-months',
  'reimbursement',
  'budgeting',
  'transaction-settlement',
  'payday-soon',
  'negative-balance',
  'bank-kyc-refer-flow',
  'bank-onboard',
  'bank-kyc-fail-flow',
  'open-advance',
  'add-debit-card',
  'missed-paycheck',
];

export async function main(direction: string, seeds: string[] = [], phoneNumSeed?: number) {
  const phoneNumberSeed =
    process.env.PHONE_NUMBER_SEED || phoneNumSeed || process.argv[3] || undefined;

  if (direction === 'down' || direction === 'up') {
    try {
      await Bluebird.map(devSeeds, async (seed: string) => {
        try {
          if (seeds && seeds.length) {
            if (seeds.indexOf(seed) !== -1) {
              logger.info(`seed: ${seed} ${direction}`);
              const func = require(`./${seed}`);
              if (func && func[direction]) {
                await func[direction]();
              }
            }
          } else {
            logger.info(`seed: ${seed} ${direction}`);
            const func = require(`./${seed}`);
            if (func && func[direction]) {
              await func[direction](phoneNumberSeed);
            }
          }
        } catch (ex) {
          logger.error(`Error in: ${seed}`, { seedErr: ex });
          throw ex;
        }
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        throw (error as ValidationError).errors[0];
      }

      throw error;
    }
  } else {
    throw new Error('Direction must be either up or down.');
  }
}

export async function runAllSeeds(direction: string, phoneNumSeed?: number) {
  await main(direction, undefined, phoneNumSeed);
}
