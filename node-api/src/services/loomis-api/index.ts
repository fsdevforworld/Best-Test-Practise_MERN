import './tracer';

import { Express, Router, Request, Response, NextFunction } from 'express';
import * as bodyParser from 'body-parser';
import * as config from 'config';
import * as PromiseRouter from 'express-promise-router';
import { ConnectionError as SequelizeConnectionError } from 'sequelize';

import DaveExpressApp from '../../api/dave-express-app';
import { LoomisUnavailableError } from '../../lib/error';
import logger from '../../lib/logger';

import { moveFundsFromDisburser } from './synapse-move-funds';
import { getDisburserBalance } from './synapsepay-get-balance';

import { createPromotionDisbursement } from './create-promotion-disbursement';

import createPaymentTransaction from './create-payment-transaction';
import findPaymentMethod from './find-payment-method';
import getBankAccountDetails from './get-bank-account-details';
import getPaymentMethods from './get-payment-methods';
import getPaymentStatus from './get-payment-status';
import getPayments from './get-payments';
import { findPaymentDetails, getPaymentDetails } from './get-payment-details';
import getSubscriptionPaymentDetails from './get-subscription-payment-details';
import postPayment from './post-payment';
import fetchTransaction from './fetch-transaction';
import deletePaymentMethod from './delete-payment-method';
import updatePaymentMethod from './update-payment-method';

import reverseTransaction from './reverse-transaction';
import getChargebackStatus from './get-chargeback-status';
import createMobilePayment from './create-mobile-payment';
import { NotFoundError } from '@dave-inc/error-types';

const loomisRouter: Router = PromiseRouter();

// Endpoints for use by Tivan
loomisRouter.post('/payment', postPayment);
loomisRouter.post('/synapse/move_disburser_funds/:targetNode', moveFundsFromDisburser);
loomisRouter.get('/synapse/:targetNode/balance', getDisburserBalance);
loomisRouter.get('/payment_method_details', findPaymentMethod);
loomisRouter.get('/payment_methods/:userId', getPaymentMethods);

// Endpoints for Promotions Service
loomisRouter.post('/disburse_promotion', createPromotionDisbursement);
// Endpoints for Apple and Google Pay Debit Card Funding
loomisRouter.post('/payment/mobile', createMobilePayment);

// Legacy interfaces
loomisRouter.post('/payment_transaction', createPaymentTransaction);
loomisRouter.get('/payment_method_details', findPaymentMethod);
loomisRouter.get('/bank_account/:id', getBankAccountDetails);
loomisRouter.get('/bank_account', getBankAccountDetails);

loomisRouter.get('/payment_status', getPaymentStatus);
loomisRouter.get('/payments', getPayments);
loomisRouter.get('/payment/:id', getPaymentDetails);
loomisRouter.get('/subscription_payment/:id', getSubscriptionPaymentDetails);
loomisRouter.get('/payment', findPaymentDetails);

loomisRouter.delete('/payment_method/:paymentMethodId', deletePaymentMethod);
loomisRouter.patch('/payment_method/:paymentMethodId', updatePaymentMethod);

loomisRouter.get('/transaction/:gateway/:type', fetchTransaction);
loomisRouter.delete('/transaction/:gateway/:type/:externalId', reverseTransaction);
loomisRouter.post('/transaction', createPaymentTransaction);
loomisRouter.get('/chargeback_status', getChargebackStatus);

function configureEndpoints(app: Express) {
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use((req, _, next) => {
    logger.debug(`Received request to ${req.url}`);
    next();
  });

  app.use('/services/loomis_api', loomisRouter);

  app.use(
    '/services/loomis_api/payment',
    (error: Error, _: Request, res: Response, next: NextFunction) => {
      if (error instanceof NotFoundError) {
        res.status(404).send({
          type: error.repr(),
          message: error.message,
          customCode: error.customCode,
          data: error,
        });
      } else {
        return next(error);
      }
    },
  );

  app.use((error: Error, req: Request, _: Response, next: NextFunction) => {
    if (error instanceof SequelizeConnectionError) {
      return next(new LoomisUnavailableError(error.message));
    }
    return next(error);
  });
}

export default DaveExpressApp(
  configureEndpoints,
  'loomisApi',
  config.get<number>('loomisApi.servicePort'),
);
