import * as PromiseRouter from 'express-promise-router';
import { User } from '../../../../models';
import { ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES } from '../../../../models/internal-role';
import addResourceInternal from '../../middleware/add-resource-internal';
import requireInternalRole from '../../middleware/require-internal-role';
import closeAccount from './close-account';
import createEmailVerification from './create-email-verification';
import getAdvanceApprovals from './get-advance-approvals';
import getBankAccounts from './get-bank-accounts';
import getEmailVerifications from './get-email-verifications';
import getMembershipChangelog from './get-membership-changelog';
import getPaymentMethods from './get-payment-methods';
import getPayments from './get-payments';
import getProfileChangelog from './get-profile-changelog';
import getPromotions from './get-promotions';
import getSubscriptionBillings from './get-subscription-billings';
import goals from './goals';
import pauseAccount from './pause-account';
import notes from './notes';
import recurringGoalsTransfers from './recurring-goals-transfers';
import unpauseAccount from './unpause-account';
import updateAddress from './update-address';
import updateBirthdate from './update-birthdate';
import updateDefaultBankAccount from './update-default-bank-account';
import updateFirstName from './update-first-name';
import updateLastName from './update-last-name';
import updatePhoneNumber from './update-phone-number';
import waiveCoolOffPeriod from './waive-cool-off-period';
import getGoalsAccount from './get-goals-account';
import getEvents from './get-events';
import getEventNames from './get-event-names';
import getReferrals from './get-referrals';
import getRoles from './get-roles';
import getSpendingAccounts from './get-spending-accounts';
import getOverdrafts from './get-overdrafts';

const router = PromiseRouter();

router.use(requireInternalRole(ALL_CUSTOMER_SUPPORT_INTERNAL_ROLES));

router.use('/:id/notes', notes);
router.use('/:id/recurring-goals-transfers', recurringGoalsTransfers);
router.use('/:id/goals', goals);

router.param('id', addResourceInternal(User));

router.get('/:id/advance-approvals', getAdvanceApprovals);
router.get('/:id/bank-accounts', getBankAccounts);
router.get('/:id/email-verifications', getEmailVerifications);
router.get('/:id/events', getEvents);
router.get('/:id/event-names', getEventNames);
router.get('/:id/goals-account', getGoalsAccount);
router.get('/:id/membership-changelog', getMembershipChangelog);
router.get('/:id/overdrafts', getOverdrafts);
router.get('/:id/payment-methods', getPaymentMethods);
router.get('/:id/payments', getPayments);
router.get('/:id/profile-changelog', getProfileChangelog);
router.get('/:id/promotions', getPromotions);
router.get('/:id/referrals', getReferrals);
router.get('/:id/roles', getRoles);
router.get('/:id/subscription-billings', getSubscriptionBillings);
router.get('/:id/spending-accounts', getSpendingAccounts);

router.patch('/:id/address', updateAddress);
router.patch('/:id/birthdate', updateBirthdate);
router.patch('/:id/default-bank-account', updateDefaultBankAccount);
router.patch('/:id/first-name', updateFirstName);
router.patch('/:id/last-name', updateLastName);
router.patch('/:id/phone-number', updatePhoneNumber);

router.post('/:id/close-account', closeAccount);
router.post('/:id/email-verifications', createEmailVerification);
router.post('/:id/pause-account', pauseAccount);
router.post('/:id/unpause-account', unpauseAccount);
router.post('/:id/waive-cool-off-period', waiveCoolOffPeriod);

export default router;
