import * as Bluebird from 'bluebird';
import { get } from 'lodash';

import { TabapayIdType, TabapayRetrieveAccountResponse } from '@dave-inc/loomis-client';
import { User, PaymentMethod } from '../../models';
import { metrics, TabapayPaymentMethodMetrics as Metrics } from './metrics';
import { generateRandomHexString } from '../../lib/utils';
import {
  TABAPAY_RESPONSE_CODES,
  formatOwner,
  createAccount,
  fetchAccount,
} from '../../lib/tabapay';
import { BaseApiError, CUSTOM_ERROR_CODES, ConflictError } from '../../lib/error';

export async function addCardToTabapay({
  referenceId,
  encryptedCard,
  keyId,
  user,
}: {
  referenceId: string;
  encryptedCard: string;
  keyId: string;
  user: User;
}): Promise<string> {
  const owner = formatOwner(user);
  try {
    const accountId = await createAccount({
      referenceId,
      encryptedCard,
      keyId,
      owner,
      allowDuplicate: user.allowDuplicateCard,
    });
    return accountId;
  } catch (err) {
    const responseError = get(err, 'response.text');
    const tabapayError = JSON.parse(responseError);
    if (tabapayError && tabapayError.SC === 409) {
      const accountId = await handleDuplicateAccounts({
        tabapayError,
        referenceId: generateRandomHexString(15),
        encryptedCard,
        keyId,
        user,
      });
      return accountId;
    } else if (tabapayError) {
      let customCode = null;
      if (tabapayError.networkRC === TABAPAY_RESPONSE_CODES.doNotHonor) {
        customCode = CUSTOM_ERROR_CODES.PROVIDER_DENIAL;
      }
      throw new BaseApiError(tabapayError.EM, {
        customCode,
        data: tabapayError,
        statusCode: tabapayError.SC,
      });
    } else {
      throw err;
    }
  }
}

async function handleDuplicateAccounts({
  tabapayError,
  referenceId,
  encryptedCard,
  keyId,
  user,
}: {
  tabapayError: any;
  referenceId: string;
  encryptedCard: string;
  keyId: string;
  user: User;
}): Promise<string> {
  const { duplicateAccountIDs = [] } = tabapayError;
  const existingAccounts = await Bluebird.map(duplicateAccountIDs, (id: string) =>
    fetchAccount(id, TabapayIdType.Id),
  );
  const duplicatePaymentMethods = await PaymentMethod.findAll({
    where: {
      tabapayId: duplicateAccountIDs,
    },
    include: [{ model: User, paranoid: false }],
    paranoid: false,
  });

  const allowDuplicate = await doesDuplicateAccountBelongToUser(
    user,
    duplicatePaymentMethods,
    existingAccounts,
  );
  const duplicatesDeleted60DaysAgo = areDuplicatesDeleted60DaysAgo(user, duplicatePaymentMethods);

  if (allowDuplicate || duplicatesDeleted60DaysAgo) {
    const accountId = await createAccount({
      referenceId,
      encryptedCard,
      keyId,
      owner: formatOwner(user),
      allowDuplicate: true,
    });
    return accountId;
  } else {
    metrics.increment(Metrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR);
    throw new ConflictError('This card is in use with another account', {
      data: {
        ...tabapayError,
        referenceId,
        allowDuplicate,
        duplicatesDeleted60DaysAgo,
      },
      customCode: CUSTOM_ERROR_CODES.DUPLICATE_CARD,
    });
  }
}

function areDuplicatesDeleted60DaysAgo(user: User, duplicatePaymentMethods: PaymentMethod[]) {
  const duplicateUsers = duplicatePaymentMethods.reduce((dupeUsers, paymentMethod) => {
    const otherUser = paymentMethod.user;
    if (
      paymentMethod.userId !== user.id &&
      otherUser.firstName === user.firstName &&
      otherUser.lastName === user.lastName &&
      otherUser.birthdate?.isSame(user.birthdate)
    ) {
      return dupeUsers.concat(otherUser);
    }

    return dupeUsers;
  }, []);

  // This would mean there were some users of the duplicate payment whose information didn't match up with the current user
  if (duplicateUsers.length !== duplicatePaymentMethods.length) {
    metrics.increment(Metrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_USERS_DO_NOT_MATCH);
    return false;
  }

  const duplicateUsersDeletedFor60Days = duplicateUsers.every(userInstance =>
    userInstance.isDeletedFor60Days(),
  );

  const areUsersDeleted60DaysAgo = duplicateUsers.length > 0 && duplicateUsersDeletedFor60Days;
  if (areUsersDeleted60DaysAgo) {
    metrics.increment(Metrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_DELETED_60_DAYS);
  }

  return areUsersDeleted60DaysAgo;
}

async function doesDuplicateAccountBelongToUser(
  user: User,
  duplicatePaymentMethods: PaymentMethod[],
  tabapayAccounts: TabapayRetrieveAccountResponse[],
): Promise<boolean> {
  const duplicatesForUser = duplicatePaymentMethods.filter(
    paymentMethod => paymentMethod.userId === user.id,
  );

  if (duplicatesForUser.length > 0) {
    metrics.increment(Metrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_USER);
    return true;
  }

  const owner = formatOwner(user);
  const duplicatePhoneNumberMatch = tabapayAccounts.some(
    acc => acc.owner.phone.number === owner.phone.number,
  );

  if (duplicatePhoneNumberMatch) {
    metrics.increment(Metrics.CREATE_ACCOUNT_DUPLICATE_ACCOUNT_ERROR_PHONE);
    return true;
  }

  return false;
}
