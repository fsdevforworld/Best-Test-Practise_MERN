import * as PromiseRouter from 'express-promise-router';
import reimbursement from './reimbursement';
import plaidDown from './plaid-down';
import fraudRule from './fraud-rule';
import incident from './incident';
import { Router } from 'express';

const router: Router = PromiseRouter();

router.get('/', (req, res) => res.send({ ok: true }));

router.post('/reimbursement', reimbursement.reimburse);

router.put('/plaid-down/show-plaid-down-screen', plaidDown.showPlaidDownScreen);
router.put(
  '/plaid-down/hide-plaid-down-and-send-notifications',
  plaidDown.hidePlaidDownAndSendNotifications,
);

/* fetches a list of affected users that match a set of fraud rules;
 * used as a confirmation step to allow CS to see users affected
 * before they create the rules.
 */
router.get('/fraud-rule/preview', fraudRule.preview);

router.post('/fraud-rule', fraudRule.create);

router.patch('/fraud-rule/:id', fraudRule.update);

router.get('/fraud-rule/search', fraudRule.search);
router.get('/fraud-rule/:id', fraudRule.getById);

router.post('/incidents', incident.create);
router.patch('/incidents/:id', incident.update);
router.post('/incidents/:id/users', incident.createForUsers);
router.delete('/incidents/:id', incident.deleteIncident);

export default router;
