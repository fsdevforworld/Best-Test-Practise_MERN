import { get, sumBy } from 'lodash';
import { EmpyrEvent, User } from '../../models';
import { EmpyrError } from '../../lib/error';
import { AnalyticsEvent, EmpyrEventContractType, EmpyrEventTransaction } from '../../typings';
import { moment } from '@dave-inc/time-lib';
import updateRewards from './update-rewards';
import amplitude, { EventData } from '../../lib/amplitude';
import { EmpyrEventType } from '@dave-inc/wire-typings';
import { parseLoomisGetPaymentMethod } from '../../services/loomis-api/helper';
import loomisClient, { PaymentMethod } from '@dave-inc/loomis-client';

const EMPYR_EMAIL_REGEX = /(\d+)-dave-user@(?:mogl-)?dave\.com/;

export async function validateAndFetchUser(
  empyrUserId: number,
  transaction: EmpyrEventTransaction,
): Promise<User> {
  const searchResults = EMPYR_EMAIL_REGEX.exec(transaction.user.email);
  let userId;
  let user;

  if (searchResults) {
    userId = searchResults[1];
  }

  if (userId) {
    user = await User.findByPk(userId, {
      paranoid: false,
    });
  }

  if (!user) {
    // Back up to Empyr user id
    user = await User.findOne({
      where: {
        empyrUserId,
      },
      paranoid: false,
    });
  }

  if (!user) {
    throw new EmpyrError('Error saving event, no user could be matched.', {
      data: transaction,
    });
  }

  // Update the Empyr user id for reference if it's not there
  if (!user.empyrUserId) {
    user.empyrUserId = empyrUserId;
    await user.save();
  }

  return user;
}

export async function fetchAndUpdatePaymentMethod(
  userId: number,
  empyrCardId: number,
  last4: string,
): Promise<PaymentMethod> {
  // We attempt to match on the empyr card id OR the last 4.  We fall back to last 4 because empyr card ids could be missing because of a bug
  // where we removed the empyr card id when unlinking cards
  const loomisResponse = await loomisClient.getPaymentMethod({
    userId,
    empyrCardId,
    mask: last4,
    includeSoftDeleted: true,
  });

  let paymentMethod = parseLoomisGetPaymentMethod(loomisResponse, __filename);

  if (paymentMethod && !paymentMethod.empyrCardId) {
    const loomisResponseFromUpdate = await loomisClient.updatePaymentMethod(paymentMethod.id, {
      empyrCardId,
    });

    paymentMethod = parseLoomisGetPaymentMethod(
      loomisResponseFromUpdate,
      __filename,
      'updatePaymentMethod',
    );
  }

  return paymentMethod;
}

async function isDuplicateTransaction(payload: EmpyrEventContractType): Promise<boolean> {
  const { transaction, type } = payload;

  const dup = await EmpyrEvent.findOne({
    where: {
      transactionId: transaction.id,
      eventType: type,
    },
  });

  return dup !== null;
}

export default async function saveEmpyrEvent(payload: EmpyrEventContractType): Promise<void> {
  const { transaction, type } = payload;
  const empyrUserId: number = transaction.user.id;
  const user = await validateAndFetchUser(empyrUserId, transaction);
  const paymentMethod = await fetchAndUpdatePaymentMethod(
    user.id,
    transaction.cardId,
    transaction.last4,
  );

  if (!paymentMethod) {
    throw new EmpyrError('Error saving event, no payment method could be found.', {
      data: transaction,
    });
  }

  if (user.id !== paymentMethod.userId) {
    throw new EmpyrError('Error saving event,payment method and user do not match.', {
      data: transaction,
    });
  }

  // We don't save the transaction but we don't want to return an error either or else Empyr will keep sending the transaction
  if (await isDuplicateTransaction(payload)) {
    return;
  }

  const newEvent = await EmpyrEvent.create({
    userId: user.id,
    paymentMethodId: paymentMethod.id,
    transactionId: transaction.id,
    cardId: transaction.cardId,
    eventType: type,
    clearedAmount: transaction.clearingAmount,
    authorizedAmount: transaction.authorizationAmount,
    rewardAmount: transaction.cashbackAmount,
    transactionDate: moment(transaction.dateOfTransaction),
    processedDate: moment(transaction.dateProcessed),
    commission: sumBy(transaction.redemptions, 'publisherCommission'),
    venueId: get(transaction, 'venue.id'),
    venueName: get(transaction, 'venue.name'),
    venueThumbnailUrl: get(transaction, 'venue.thumbnailUrl.value'),
    venueAddress: get(transaction, 'venue.address.streetAddress'),
    venueCity: get(transaction, 'venue.address.city'),
    venueState: get(transaction, 'venue.address.state'),
    venuePostalCode: get(transaction, 'venue.address.postalCode'),
  });

  // Only record an accruement of rewards when the transaction clears
  if (type === EmpyrEventType.CLEARED) {
    await updateRewards(newEvent);
  }

  await trackEmpyrTrans(newEvent, user.id, type);
}

async function trackEmpyrTrans(empyrEvent: EmpyrEvent, userId: number, eventType: EmpyrEventType) {
  if (eventType === EmpyrEventType.REMOVED) {
    return;
  }

  const analyticsEvent: EventData = {
    userId,
    eventType: '',
    eventProperties: {
      merchantName: empyrEvent.venueName,
      city: empyrEvent.venueCity,
      state: empyrEvent.venueState,
      rewardAmount: empyrEvent.rewardAmount,
      commission: empyrEvent.commission,
    },
  };

  if (eventType === EmpyrEventType.CLEARED) {
    analyticsEvent.eventType = AnalyticsEvent.RewardTransactionCleared;
    analyticsEvent.eventProperties.clearedAmount = empyrEvent.clearedAmount;
  }

  if (eventType === EmpyrEventType.AUTHORIZED) {
    analyticsEvent.eventType = AnalyticsEvent.RewardTransactionAuthorized;
    analyticsEvent.eventProperties.authorizedAmount = empyrEvent.authorizedAmount;
  }

  if (eventType === EmpyrEventType.REMOVED_DUP) {
    analyticsEvent.eventType = AnalyticsEvent.RewardTransactionRemovedDup;
    analyticsEvent.eventProperties.clearedAmount = empyrEvent.clearedAmount;
  }

  await amplitude.track(analyticsEvent);
}
