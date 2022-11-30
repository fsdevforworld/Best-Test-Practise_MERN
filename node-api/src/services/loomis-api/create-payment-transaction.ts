import { Request, Response } from 'express';
import {
  CreateTransactionOptions,
  PaymentGateway,
  PaymentProviderTransaction,
} from '@dave-inc/loomis-client';
import { InvalidParametersError } from '../../lib/error';

import { getGateway } from '../../domain/payment-provider';

type RequestBody = {
  gatewayName: PaymentGateway;
  options: CreateTransactionOptions;
};

export default async function createPaymentTransaction(req: Request, res: Response) {
  const request: RequestBody = req.body;

  if (!request || !request.gatewayName || !request.options) {
    throw new InvalidParametersError('Missing gateway or required options');
  }

  const { gatewayName, options } = request;
  const gateway = getGateway(gatewayName);
  const transaction: PaymentProviderTransaction = await gateway.createTransaction(options);

  res.json(transaction);
}
