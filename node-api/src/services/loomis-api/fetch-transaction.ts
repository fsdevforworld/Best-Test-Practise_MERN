import { has, get } from 'lodash';
import { Request, Response } from 'express';
import {
  FetchTransactionOptions,
  PaymentGateway,
  PaymentProcessor,
  IPaymentGateway,
} from '@dave-inc/loomis-client';
import { getGateway } from '../../domain/payment-provider';
import { InvalidParametersError } from '../../lib/error';

function extractOptionsFromRequest(req: Request): FetchTransactionOptions {
  const stringKeys = [
    'correspondingId',
    'externalId',
    'ownerId',
    'referenceId',
    'secret',
    'sourceId',
  ];
  const integerKeys = ['daveUserId'];
  const boolKeys = ['withoutFullDehydrate'];

  const { type } = req.params;
  const result: { [key: string]: any } = { type };
  stringKeys.forEach(key => {
    if (has(req.query, key)) {
      result[key] = get(req.query, key) as string;
    }
  });

  integerKeys.forEach(key => {
    if (has(req.query, key)) {
      result[key] = parseInt(get(req.query, key), 10);
    }
  });

  boolKeys.forEach(key => {
    if (has(req.query, key)) {
      result[key] = (req.query[key] as string).toUpperCase() === 'TRUE';
    }
  });

  if (has(req.query, 'processor')) {
    result.processor = req.query.processor as PaymentProcessor;
  }

  return result as FetchTransactionOptions;
}

export default async function fetchTransaction(req: Request, res: Response) {
  let options: FetchTransactionOptions;
  let gateway: IPaymentGateway;

  try {
    options = extractOptionsFromRequest(req);
    const gatewayName = req.params.gateway as PaymentGateway;
    gateway = getGateway(gatewayName);
  } catch (error) {
    throw new InvalidParametersError(error.message);
  }

  const result = await gateway.fetchTransaction(options);
  return res.json(result);
}
