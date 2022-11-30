import loomisClient from '@dave-inc/loomis-client';
import { NotFoundError, UnsupportedPaymentProcessorError } from '../../../lib/error';
import { fetchAccount as fetchTabapayAccount } from '../../../lib/tabapay';
import { IDashboardApiRequest } from '../../../typings';
import { Response } from 'express';
import { NotFoundMessageKey } from '../../../translations';
import { parseLoomisGetPaymentMethod } from '../../../services/loomis-api/helper';

async function deleteById(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const id = req.params.id;

  // Hard delete the payment method
  const loomisResponse = await loomisClient.deletePaymentMethod(id);

  if ('error' in loomisResponse) {
    throw new Error(
      `Loomis gave an error in deleteById, failed to delete payment method ${loomisResponse.error.message}`,
    );
  }
  return res.send(loomisResponse.data);
}

async function getAccountById(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const response: any = {};

  const loomisResponse = await loomisClient.getPaymentMethod({ id: req.params.id });
  const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);
  if (!paymentMethod) {
    throw new NotFoundError(NotFoundMessageKey.PaymentMethodNotFound);
  }

  if (paymentMethod.risepayId) {
    throw new UnsupportedPaymentProcessorError('Risepay is no longer supported');
  }
  if (paymentMethod.tabapayId) {
    response.tabapay = await fetchTabapayAccount(paymentMethod.tabapayId);
  }
  return res.send(response);
}

export default {
  deleteById,
  getAccountById,
};
