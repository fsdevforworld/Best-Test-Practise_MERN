import * as PromiseRouter from 'express-promise-router';

import emailEvents from './email-events';
import institutionAccount from './institution-account';
import { requireAuth } from '../../middleware';
import { Router } from 'express';

const router: Router = PromiseRouter();

// health
router.get('/ping', (req, res) => res.status(200).send('pong'));

router.get('/bank/:connectionId/token', requireAuth, institutionAccount.getToken);
router.get('/bank/:connectionId/validate', requireAuth, institutionAccount.setCredentialsValid);

router.post('/bank/plaid_webhook', institutionAccount.webhook);

router.post('/sendgrid_webhook', emailEvents.sendgridWebhook);

// temporarily keep endpoint until app is updated
router.post('/campaign_info', (req, res) => res.send({ ok: true }));

export default router;
