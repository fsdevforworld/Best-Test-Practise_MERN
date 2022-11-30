import { StatsD, Tags } from 'hot-shots';
import * as config from 'config';
import logger from './logger';

const host: string = config.get('datadog.traceAgentHostname');

export const dogstatsd = new StatsD({
  host,
  prefix: 'node-api.',
  globalTags: [`env:${process.env.NODE_ENV}`],
});

dogstatsd.socket.on('error', e => {
  logger.error(`Error in Datadog StatsD socket`, { e });
});

export const DATADOG_METRIC_LABELS = {
  SUBSCRIPTION_COLLECTION: 'subscription_collection',
};

export enum PAYMENT_CHARGE_ERRORS {
  CODE_19_PROVIDER_DENIAL_ERROR = 'Code 19: PROVIDER DENIAL  ERROR',
  CODE_19_PROVIDER_DENIAL_SOURCE_DISABLED = 'Code 19: PROVIDER DENIAL  Source Disabled',
  CODE_19_PROVIDER_DENIAL_ACCOUNTS = 'Code 19: PROVIDER DENIAL  accounts',
  ERROR_OCCURRED_WHILE_PROCESSING_TRANSACTION = 'An error occurred while processing this transaction',
  COULD_NOT_FIND_SYNAPSEPAY_NODE_BECAUSE_SYNAPSENODEID_MISSING = 'Could not find SynapsePay Node because synapseNodeId is missing for Bank Account',
  CONNECT_ETIMEDOUT = 'connect ETIMEDOUT',
  BAD_REQUEST = 'Bad Request',
  VALIDATION_ERROR = 'Validation error',
  CONFLICT = 'Conflict',
  INVALID_FIELD_VALUE_SUPPLIED = 'Invalid field value supplied.',
  DEBIT_CARD_NOT_VALID = 'Debit card is not valid',
  NODE_IS_LOCKED = 'Node is locked',
  BANK_ACCOUNT_ADDED_DOESNT_HAVE_ENOUGH_TRANSACTIONS_FOR_INSTANT_VERIFICATION = "The bank account you added doesn't have enough transactions for instant verification",
  INTERNAL_SERVER_ERROR = 'Internal Server Error',
  SUBSCRIPTION_HAS_BEEN_PAID = 'Subscription has already been paid',
  UNHANDLED_EXCEPTION_INTERNAL_SYSTEM_ISSUE = 'Unhandled exception. We are unable to process the request',
  DEADLOCK_FOUND = 'Deadlock found when trying to get lock',
  USER_SUSPECTED_OF_FRAUD = 'Transaction not allowed: user suspected of fraud',
  SERVICE_UNAVAILABLE = 'Service Unavailable',
  UNPROCESSED_ENTITY = 'Unprocessable Entity',
}

export const getChargeFailureErrorTag = (ex: any) => {
  const DEFAULT_CHANGE_ERROR = 'unclassified error no metric';
  const chargeErrorTags: Tags & {
    charge_error: string;
    charge_error_provider_denial_code?: string;
    charge_error_provider_denial_card?: string;
  } = { charge_error: DEFAULT_CHANGE_ERROR };

  if (ex.message && typeof ex.message === 'string') {
    const errorMessage: string = ex.message.toLowerCase();

    for (const chargeErrorCode of Object.values(PAYMENT_CHARGE_ERRORS)) {
      if (errorMessage.startsWith(chargeErrorCode.toLowerCase())) {
        chargeErrorTags.charge_error = chargeErrorCode;

        // Special case
        if (chargeErrorCode === PAYMENT_CHARGE_ERRORS.CODE_19_PROVIDER_DENIAL_ERROR) {
          const messageParts = errorMessage.split(' ');
          chargeErrorTags.charge_error_provider_denial_code = messageParts[messageParts.length - 2];
          chargeErrorTags.charge_error_provider_denial_card = messageParts[messageParts.length - 1];
        }
        break;
      }
    }
  }

  return chargeErrorTags;
};

export const executeAndRecordSuccessToDatadog = async <T>(
  datadogMetricLabel: string,
  actionFn: () => Promise<T>,
  tags?: Tags,
): Promise<T> => {
  let isSuccess: boolean = false;
  try {
    const result = await actionFn();
    isSuccess = true;
    return result;
  } finally {
    dogstatsd.increment(datadogMetricLabel, { ...tags, is_success: isSuccess.toString() });
  }
};

export interface IMetricsReporter<T> {
  increment: (metric: T, arg0?: number | Tags, arg1?: Tags) => void;
  gauge: (metric: T, value: number, tags?: Tags) => void;
  histogram: (metric: T, value: number, tags?: Tags) => void;
}

export function wrapMetrics<T>(): IMetricsReporter<T> {
  return {
    increment: (metric: T, arg0?: number | Tags, arg1?: Tags) => {
      if (typeof arg0 === 'number') {
        const count = arg0 as number;
        const tags = arg1 as Tags;
        dogstatsd.increment(String(metric), count, tags);
      } else {
        const tags = arg0 as Tags;
        dogstatsd.increment(String(metric), tags);
      }
    },
    gauge: (metric: T, value: number, tags?: Tags) => {
      dogstatsd.gauge(String(metric), value, tags);
    },
    histogram: (metric: T, value: number, tags?: Tags) => {
      dogstatsd.histogram(String(metric), value, tags);
    },
  };
}
