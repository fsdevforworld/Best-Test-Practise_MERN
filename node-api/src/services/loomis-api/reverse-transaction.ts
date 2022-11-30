import { Request, Response } from 'express';
import { isNil } from 'lodash';
import {
  ReverseTransactionOptions,
  PaymentGateway,
  IPaymentGateway,
  PaymentProviderTransactionType,
} from '@dave-inc/loomis-client';
import { getGateway } from '../../domain/payment-provider';
import { InvalidParametersError } from '../../lib/error';

function extractOptionsFromRequest(req: Request): ReverseTransactionOptions {
  const { type, externalId } = req.params;
  if (isNil(type) || !Object.values(PaymentProviderTransactionType).includes(type)) {
    throw new Error(`Invalid transaction type: ${type}`);
  }

  if (isNil(externalId)) {
    throw new Error('Missing external ID');
  }

  const result: ReverseTransactionOptions = {
    type,
    externalId,
    ...req.body,
  };

  return result;
}

export default async function reverseTransaction(req: Request, res: Response) {
  let options: ReverseTransactionOptions;
  let gateway: IPaymentGateway;

  try {
    options = extractOptionsFromRequest(req);
    const gatewayName = req.params.gateway as PaymentGateway;
    gateway = getGateway(gatewayName);
  } catch (error) {
    throw new InvalidParametersError(error.message);
  }

  const result = await gateway.reverseTransaction(options);
  return res.json(result);
}
