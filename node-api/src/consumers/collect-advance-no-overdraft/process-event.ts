import { Message } from '@google-cloud/pubsub';
import loomisClient from '@dave-inc/loomis-client';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import { dogstatsd } from '../../lib/datadog-statsd';
import * as Collection from '../../domain/collection';
import { Advance, BankAccount, PaymentMethod } from '../../models';
import {
  collect as collectWithoutHardPull,
  handleFailure,
  handleSuccess,
} from '../../jobs/handlers/collect-after-bank-account-update/helpers';
import { AdvanceCollectionTrigger } from '../../typings';
import logger from '../../lib/logger';

const JOB_NAME = 'COLLECT_ADVANCE_NO_OVERDRAFT_ACCOUNT';

export async function processCollectAdvanceNoOverdraftEvent(event: Message, data: any) {
  dogstatsd.increment('collect_advance_no_overdraft_consumer.event_receieved');

  const { advanceId } = data;

  const advance = await Advance.findByPk(advanceId, {
    include: [
      { model: BankAccount, paranoid: false },
      { model: PaymentMethod, paranoid: false },
    ],
  });

  if (!advance) {
    dogstatsd.increment('collect_advance_no_overdraft_consumer.process_event_failure', {
      name: 'advance_not_found',
    });

    event.ack();

    return;
  }

  const { id: bankAccountId, available, current } = advance.bankAccount;

  try {
    const loomisResponse = await loomisClient.getPaymentMethod({ id: advance.paymentMethodId });
    const paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

    const charge = await Collection.createDebitCardAdvanceCharge(paymentMethod, advance);

    const payment = await collectWithoutHardPull(
      advance,
      advance.outstanding,
      advance.bankAccountId,
      {
        trigger: AdvanceCollectionTrigger.NO_OVERDRAFT_ACCOUNT,
        charge,
      },
    );
    await handleSuccess(payment, advance, bankAccountId, { available, current }, JOB_NAME);
  } catch (ex) {
    logger.error('Error processing collect no overdraft advance', { ex });
    dogstatsd.increment('collect_advance_no_overdraft_consumer.process_event_failure', {
      name: ex.name,
    });
    await handleFailure(ex, bankAccountId, advance.userId, JOB_NAME, advance);
  }

  dogstatsd.increment('collect_advance_no_overdraft_consumer.process_event_success');

  event.ack();
}
