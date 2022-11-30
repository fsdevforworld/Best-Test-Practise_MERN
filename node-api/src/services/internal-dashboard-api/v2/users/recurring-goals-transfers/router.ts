import * as PromiseRouter from 'express-promise-router';
import cancel from './cancel';
import getAll from './get-all';
import getChangelog from './get-changelog';
import updateAmount from './update-amount';
import updateGoal from './update-goal';
import updateRecurrence from './update-recurrence';

const router = PromiseRouter();

router.get('/', getAll);
router.get('/:recurringTransferId/changelog', getChangelog);

router.patch('/:recurringTransferId/amount', updateAmount);
router.patch('/:recurringTransferId/goal', updateGoal);
router.patch('/:recurringTransferId/recurrence', updateRecurrence);

router.post('/:recurringTransferId/cancel', cancel);

export default router;
