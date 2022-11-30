import { getEventGenerator } from '@dave-inc/pubsub';
import pubsub from '../../lib/pubsub';
import { ITransactionSettlementUpdateEventData } from '@dave-inc/wire-typings';

import {
  EventTopic,
  IBankConnectionUpdateCompletedEventData,
  IBankConnectionUpdatedEventData,
  ICollectAdvanceDailyAutoRetrieveEventData,
  IDaveBankingAccountClosed,
  INewRecurringTransactionData,
  IUnderwritingMLScoreEventData,
  IUnderwritingMLScorePreprocessEventData,
  IUserUpdatedEventData,
  IRecordCreatedEvent,
  IDeleteBalanceLogFromSnowflakeData,
  ITivanAdvanceProcessed,
  IBankTransactionBackfillEventData,
  IPaymentUpdateEventData,
  IPaymentMethodUpdateEventData,
  IPaymentEventData,
  IPaymentMethodEventData,
  ITabapayChargebackEventData,
} from '../../typings';
import { TransactionWebhookData } from 'synapsepay';

const generateEvent = getEventGenerator(pubsub);

export const bankConnectionUpdateEvent = generateEvent<IBankConnectionUpdatedEventData>(
  EventTopic.BankConnectionUpdate,
);

export const bankConnectionInitialUpdateEvent = generateEvent<IBankConnectionUpdatedEventData>(
  EventTopic.BankConnectionInitialUpdate,
);

export const bankTransactionBackfillEvent = generateEvent<IBankTransactionBackfillEventData>(
  EventTopic.BankTransactionBackfill,
);

export const bankConnectionUpdateCompletedEvent = generateEvent<
  IBankConnectionUpdateCompletedEventData
>(EventTopic.BankConnectionUpdateCompleted);

export const bankConnectionUpdateTivan = generateEvent<IBankConnectionUpdatedEventData>(
  EventTopic.BankConnectionUpdate,
);

export const collectAdvanceDailyAutoRetrieveEvent = generateEvent<
  ICollectAdvanceDailyAutoRetrieveEventData
>(EventTopic.CollectAdvanceDailyAutoRetrieve);

export const collectAdvanceNoOverdraftEvent = generateEvent<
  ICollectAdvanceDailyAutoRetrieveEventData
>(EventTopic.CollectAdvanceNoOverdraft);

export const collectBigMoneyHardPullsEvent = generateEvent<
  ICollectAdvanceDailyAutoRetrieveEventData
>(EventTopic.CollectBigMoneyHardPulls);

export const updateSynapsepayTransaction = generateEvent<TransactionWebhookData>(
  EventTopic.SynapsepayUpsertTransaction,
);

export const collectSubscriptionPayment = generateEvent<{
  subscriptionBillingId: number;
  forceDebitOnly: boolean;
}>(EventTopic.CollectSubscription);

export const underwritingMlScorePreprocess = generateEvent<IUnderwritingMLScorePreprocessEventData>(
  EventTopic.UnderwritingMLScorePreprocess,
);

export const underwritingMlScore = generateEvent<IUnderwritingMLScoreEventData>(
  EventTopic.UnderwritingMLScore,
);

export const userUpdatedEvent = generateEvent<IUserUpdatedEventData>(EventTopic.UserUpdated);

export const newRecurringTransactionEvent = generateEvent<INewRecurringTransactionData>(
  EventTopic.NewRecurringTransaction,
);

export const deleteBalanceLogFromSnowflake = generateEvent<IDeleteBalanceLogFromSnowflakeData>(
  EventTopic.DeleteBalanceLogFromSnowflake,
);

export const recordEvent = generateEvent<IRecordCreatedEvent>(EventTopic.RecordCreatedEvent);

export const daveBankingAccountClosed = generateEvent<IDaveBankingAccountClosed>(
  EventTopic.DaveBankingAccountClosed,
);

export const tivanAdvanceProcessed = generateEvent<ITivanAdvanceProcessed>(
  EventTopic.TivanAdvanceProcessed,
);

export const paymentUpdateEvent = generateEvent<IPaymentUpdateEventData>(EventTopic.PaymentUpdate);

export const paymentMethodUpdateEvent = generateEvent<IPaymentMethodUpdateEventData>(
  EventTopic.PaymentMethodUpdate,
);

export const paymentBackfillEvent = generateEvent<IPaymentEventData>(EventTopic.PaymentBackfill);

export const paymentMethodBackfillEvent = generateEvent<IPaymentMethodEventData>(
  EventTopic.PaymentMethodBackfill,
);

export const tabapayChargebackEvent = generateEvent<ITabapayChargebackEventData>(
  EventTopic.TabapayChargeback,
);

export const transactionSettlementUpdateEvent = generateEvent<
  ITransactionSettlementUpdateEventData
>(EventTopic.TransactionSettlementUpdate);
