import {
  BankAccountComplexResponse,
  BankConnectionTransitionResponse,
  BankingDataSource,
  BankConnectionSessionResponse,
  TokenResponse,
} from '@dave-inc/wire-typings';
import * as Bluebird from 'bluebird';
import * as moment from 'moment';
import { Op } from 'sequelize';
import { Response } from 'express';

import { pick, omit } from 'lodash';

import BankConnectionHelper from '../../helper/bank-connection';
import InstitutionHelper from '../../helper/institution';
import { startSubscription } from '../../domain/subscription-billing';
import {
  collectPastDueSubscriptionPayment,
  SUBSCRIPTION_COLLECTION_TRIGGER,
} from '../../domain/collection';

import {
  BaseApiError,
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  NotFoundError,
  PlaidForceNewConnectionError,
} from '../../lib/error';
import {
  AppsFlyerEvents,
  logAppsflyerEvent,
  getEventPropertiesFromRequest,
} from '../../lib/appsflyer';
import amplitude from '../../lib/amplitude';
import { getFromCacheOrCreatePublicToken, createLinkItemToken } from '../../lib/plaid';
import { dogstatsd } from '../../lib/datadog-statsd';
import { getParams, minVersionCheckFromRequest } from '../../lib/utils';

import {
  AuditLog,
  BankConnection,
  BankConnectionTransition,
  Institution,
  BankAccount,
  PaymentMethod,
  User,
} from '../../models';
import { BankConnectionUpdate } from '../../models/warehouse';
import {
  BankingDataSourceErrorType,
  BankNexusResponse,
  IDaveRequest,
  IDaveResourceRequest,
  IDaveResponse,
  PlaidErrorCode,
} from '../../typings';
import { BankConnectionSourceExperiment } from '../../domain/experiment';
import { MxIntegration, PlaidIntegration } from '../../domain/banking-data-source';
import * as BankingDataSync from '../../domain/banking-data-sync';
import { serializeBankAccount } from '../../serialization';
import logger from '../../lib/logger';
import { deleteBankConnection } from '../../services/loomis-api/domain/delete-bank-account';

export const MIN_VERSION_LINK_TOKEN = '2.51.0';

async function create(
  req: IDaveRequest,
  res: IDaveResponse<BankAccountComplexResponse[]>,
): Promise<Response> {
  const { promotionCode, selectedAccountExternalId } = req.body;

  // For backwards compatibility
  const source: string = req.body.source || BankingDataSource.Plaid;

  let connection: BankConnection;
  let nexus: BankNexusResponse;
  let institution: Institution;

  try {
    switch (source) {
      case BankingDataSource.Mx:
        const { mxMemberGuid } = req.body;
        if (!mxMemberGuid) {
          throw new InvalidParametersError(null, {
            required: ['mxMemberGuid'],
            provided: Object.keys(req.body),
          });
        }
        if (!req.user.mxUserId) {
          throw new InvalidParametersError(`Missing mx user account`);
        }

        nexus = await new MxIntegration(req.user.mxUserId, mxMemberGuid).getNexus();
        institution = await InstitutionHelper.findOrCreateMxInstitution(
          nexus.externalInstitutionId,
          req.user.mxUserId,
        );
        break;
      case BankingDataSource.Plaid:
        const { externalInstitutionId, plaidToken } = req.body;
        if (!externalInstitutionId || !plaidToken) {
          dogstatsd.increment('bank_connection.missing_plaid_information');
          throw new InvalidParametersError(null, {
            required: ['plaidToken', 'externalInstitutionId'],
            provided: Object.keys(req.body),
          });
        }

        institution = await InstitutionHelper.findOrCreatePlaidInstitution(externalInstitutionId);
        nexus = await new PlaidIntegration(plaidToken).createNexus();
        break;
      default:
        throw new InvalidParametersError(null, {
          required: ['source'],
          provided: source,
        });
    }

    if (!nexus) {
      throw new InvalidParametersError(`Error retrieving ${source.toLowerCase()} access token`);
    }

    // TODO: we can probably combine this function call and the one below it once auth is removed from create
    connection = await BankConnection.create({
      externalId: nexus.externalId,
      authToken: nexus.authToken,
      userId: req.user.id,
      institutionId: institution.id,
      bankingDataSource: source,
    });

    await BankConnectionUpdate.create({
      userId: connection.userId,
      bankConnectionId: connection.id,
      type: 'BANK_CONNECTION_CREATED',
      extra: { bankingDataSource: connection.bankingDataSource },
    });

    logger.info('Bank Connection Created', {
      userId: req.user.id,
      requestId: req.get('X-Request-Id'),
      institutionId: institution.id,
      bankingDataSource: source,
      bankConnectionId: connection.id,
    });

    const supportedBankAccounts = await BankingDataSync.createBankAccounts(connection, req.user);

    if (selectedAccountExternalId) {
      const bankAcc = supportedBankAccounts.find(
        acc => acc.externalId === selectedAccountExternalId,
      );
      if (bankAcc) {
        const user = await User.findByPk(req.user.id);
        await Promise.all([
          user.update({ defaultBankAccountId: bankAcc.id }),
          connection.update({ primaryBankAccountId: bankAcc.id }),
        ]);
      }
    }

    const isNewSubscription = await startSubscription(req.user, moment(), promotionCode);

    logger.info('Subscription Created', {
      isNewSubscription,
      userId: req.user.id,
      requestId: req.get('X-Request-Id'),
      subscriptionStart: req.user.subscriptionStart,
      isPromotion: promotionCode != null,
    });

    if (!isNewSubscription) {
      await collectPastDueSubscriptionPayment({
        userId: req.user.id,
        trigger: SUBSCRIPTION_COLLECTION_TRIGGER.USER_BANK_CONNECTED,
        wasBalanceRefreshed: false,
      });
    }

    const serializedAccounts = await Bluebird.map(supportedBankAccounts, account =>
      serializeBankAccount(account),
    );

    logAppsflyerEvent({
      ...getEventPropertiesFromRequest(req),
      eventName: AppsFlyerEvents.BANK_CONNECTED_S2S,
    });

    dogstatsd.increment('bank_connection.successfully_created', {
      source,
    });

    logger.info('Bank Connection Created Successfully', {
      userId: req.user.id,
      requestId: req.get('X-Request-Id'),
      accounts: serializedAccounts.map(account =>
        pick(account, [
          'microDeposit',
          'institution.id',
          'hasAccountRouting',
          'hasValidCredentials',
        ]),
      ),
      institutionId: institution.id,
      bankingDataSource: source,
      bankConnectionId: connection.id,
    });
    return res.send(serializedAccounts);
  } catch (err) {
    // To support both PlaidError and BankingDataSourceError syntax
    // temporarily
    const errorType = err.errorType;
    const errorCode = err.error_code || err.errorCode;
    const errorMessage = err.error_message || err.message;
    const requestId = err.request_id || err.requestId;

    dogstatsd.increment('bank_connection_api.create_error', {
      error_type: err.constructor.name,
      error_code: errorCode,
      error_banking_data_source_type: errorType,
      source,
    });

    if (errorType === BankingDataSourceErrorType.UserInteractionRequired) {
      // Plaid is requesting login from user for auth permissions.
      //
      // We bypass BankConnectionHelper.deleteBankConnection because we want to
      // preserve the Plaid account.
      dogstatsd.increment('bank_connection.auth_permission_requested', {
        source,
        plaid_institution_id: institution.plaidInstitutionId,
        institution_display_name: institution.displayName,
      });
      amplitude.track({
        userId: req.user.id,
        eventType: amplitude.EVENTS.PLAID_AUTH_PERMISSION_REQUESTED, // TODO - rename to be more generic
        eventProperties: {
          source,
          plaid_institution_id: institution.plaidInstitutionId,
          institution_display_name: institution.displayName,
        },
      });

      await deleteBankConnection(connection, {
        force: true,
      });

      throw new BaseApiError(errorMessage, {
        statusCode: 449,
        customCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DATA_SOURCE_LOGIN_REQUIRED,
      });
    }

    // always want to do this
    if (connection) {
      await deleteBankConnection(connection, { force: true });
    } else if (req.user.mxUserId && req.body.mxMemberGuid) {
      // Since MX connections are first created in the front-end widget, if request fails before bank connection was created,
      // we should explicitly delete the MX connection
      new MxIntegration(req.user.mxUserId, req.body.mxMemberGuid).deleteNexus().catch(err => {
        logger.error('Error deleting mx member', {
          err,
          mxUserGuid: req.user.mxUserId,
          mxMemberGuid: req.body.mxMemberGuid,
          userId: req.user.id,
          requestId: req.get('X-Request-Id'),
        });
        dogstatsd.increment('bank_connection.delete_mx_member_error');
      });
    }

    // General Request Error
    if (requestId) {
      dogstatsd.increment('bank_connection.request_error', 1, {
        error: errorCode,
        source,
      });

      await AuditLog.create({
        userId: req.user.id,
        type: `${source}_REQUEST_FAILURE`,
        message: errorMessage,
        successful: false,
        extra: {
          error: err,
          institutionId: institution ? institution : institution.id,
        },
      });
      throw new BaseApiError(errorMessage, {
        statusCode: 500,
        customCode: CUSTOM_ERROR_CODES.BANK_CONNECTION_DATA_SOURCE_REQUEST_ERROR,
      });
    }

    throw err;
  }
}

async function getToken(req: IDaveRequest, res: IDaveResponse<TokenResponse>): Promise<Response> {
  const connection = await BankConnection.findByPk(req.params.connectionId);
  if (!connection || connection.userId !== req.user.id) {
    throw new NotFoundError();
  }

  const token = await getFromCacheOrCreatePublicToken(connection.authToken);

  return res.send({ token });
}

async function setCredentialsValid(req: IDaveRequest, res: Response): Promise<Response> {
  const connection = await BankConnection.findByPk(req.params.connectionId);
  if (!connection || connection.userId !== req.user.id) {
    throw new NotFoundError();
  }
  await BankingDataSync.setConnectionStatusAsValid(connection, {
    type: 'bank-connection-endpoint',
  });

  await collectPastDueSubscriptionPayment({
    userId: connection.userId,
    trigger: SUBSCRIPTION_COLLECTION_TRIGGER.USER_BANK_RECONNECTED,
    wasBalanceRefreshed: false,
  });

  return res.send({ success: true });
}

async function listTransitions(
  req: IDaveResourceRequest<BankConnection>,
  res: IDaveResponse<BankConnectionTransitionResponse[]>,
) {
  const bankConnection = req.resource;

  const bankConnectionTransitions = await BankConnectionTransition.findAll({
    order: [['id', 'ASC']],
    where: {
      [Op.or]: [
        { fromBankConnectionId: bankConnection.id },
        { toBankConnectionId: bankConnection.id },
      ],
    },
  });

  const payload = bankConnectionTransitions.map(bankConnectionTransition =>
    bankConnectionTransition.serialize(),
  );

  res.send(payload);
}

async function session(
  req: IDaveRequest,
  res: IDaveResponse<BankConnectionSessionResponse>,
): Promise<Response> {
  const { bankConnectionId, mxInstitutionCode } = getParams(
    req.body,
    [],
    ['bankConnectionId', 'mxInstitutionCode'],
  );

  const isBucketedIntoMxExperiment = await BankConnectionSourceExperiment.isUserBucketed(
    req.user.id,
    BankingDataSource.Mx,
  );

  if (isBucketedIntoMxExperiment) {
    const url = await BankConnectionHelper.generateMxConnectionUrl(req.user, {
      bankConnectionId,
      mxInstitutionCode,
    });
    return res.send({
      bankingDataSource: BankingDataSource.Mx,
      data: {
        url,
      },
    });
  } else {
    return res.send({
      bankingDataSource: BankingDataSource.Plaid,
      data: null,
    });
  }
}

// Supports old version of this url
async function generateMxConnectionInfo(req: IDaveRequest, res: Response): Promise<Response> {
  const { bankConnectionId, institutionCode } = getParams(
    req.body,
    [],
    ['bankConnectionId', 'institutionCode'],
  );

  const url = await BankConnectionHelper.generateMxConnectionUrl(req.user, {
    bankConnectionId,
    mxInstitutionCode: institutionCode,
  });

  return res.send({ url });
}

async function getItemAddToken(
  req: IDaveRequest,
  res: IDaveResponse<TokenResponse>,
): Promise<Response> {
  const { locale } = req.headers;
  const { user } = req;
  const { webhook, connectionId, redirectUri, androidPackageName, selectAccount } = getParams(
    req.body,
    ['webhook'],
    ['connectionId', 'redirectUri', 'androidPackageName', 'selectAccount'],
  );
  let accessToken;
  let connection;

  try {
    if (connectionId) {
      connection = await BankConnection.findByPk(connectionId, {
        include: ['institution'],
      });
      if (!connection || connection.userId !== user.id) {
        throw new NotFoundError();
      }
      accessToken = connection.authToken;
      await migrateChaseConnectionCheck(req, connection);
    }

    const token = await createLinkItemToken({
      user,
      accessToken,
      webhook,
      redirectUri,
      androidPackageName,
      locale,
      selectAccount,
    });

    return res.send({ token });
  } catch (error) {
    const errorMessage = error.error_message || error.message;
    const errorCode = error.error_code || error.errorCode;
    const statusCode = error.status_code || error.statusCode;
    const customCode = error.customCode;
    const isUpdateMode = Boolean(connectionId);
    let hasOutstandingAdvance;

    logger.error('Error creating plaid link token', { error, isUpdateMode });
    dogstatsd.increment('bank_connection.create_link_token_error');

    // Let FE know to create a new connection instead of updating existing
    const createFreshConnection =
      error instanceof PlaidForceNewConnectionError ||
      (isUpdateMode &&
        [PlaidErrorCode.ItemNotFound, PlaidErrorCode.InvalidAccessToken].includes(errorCode));

    if (createFreshConnection && connection) {
      // FE will be prevented from creating a new conn if oustanding adv exists
      hasOutstandingAdvance = await connection.hasAdvances({ outstanding: { [Op.gt]: 0 } });
    }

    throw new BaseApiError(errorMessage, {
      statusCode,
      customCode,
      data: {
        isUpdateMode,
        errorCode,
        createFreshConnection,
        hasOutstandingAdvance,
      },
    });
  }
}

async function migrateChaseConnectionCheck(req: IDaveRequest, connection: BankConnection) {
  if (connection.institution?.plaidInstitutionId === 'ins_3') {
    const requiredMinVersion = '2.24.0';
    const errorMessage = 'Please update to the latest app version.';

    const hasMinVersion = minVersionCheckFromRequest(req, requiredMinVersion);
    if (!hasMinVersion) {
      throw new BaseApiError(errorMessage, {
        statusCode: 400,
        customCode: 1000, // client will go to force update screen
      });
    }
    throw new PlaidForceNewConnectionError();
  }
}

// this method copies over the payment method for a user going from chase -> chase oauth
// to prevent them from having to re-enter it
export async function copyPaymentMethod(
  userId: number,
  newConnection: BankConnection,
  newAccounts: BankAccount[],
): Promise<void> {
  const plaidChaseOauthInsId = 'ins_56';
  const plaidChaseInsId = 'ins_3';

  const institution = await Institution.findByPk(newConnection.institutionId);
  if (institution.plaidInstitutionId !== plaidChaseOauthInsId) {
    return;
  }

  const chaseConnection = await BankConnection.findOne({
    where: {
      userId,
    },
    include: [
      { model: Institution, where: { plaidInstitutionId: plaidChaseInsId }, required: true },
    ],
    paranoid: false,
    order: [['id', 'DESC']],
  });

  if (!chaseConnection) {
    return;
  }

  const chaseAccounts = await BankAccount.findAll({
    where: {
      bankConnectionId: chaseConnection.id,
    },
    include: [{ association: 'defaultPaymentMethod', paranoid: false, required: true }],
    paranoid: false,
  });

  await Promise.all(
    chaseAccounts.map(async acc => {
      const foundAcc = newAccounts.find(newAcc => newAcc.lastFour === acc.lastFour);
      if (foundAcc) {
        const tabapayId = acc.defaultPaymentMethod.tabapayId;

        if (tabapayId) {
          await acc.defaultPaymentMethod.update({
            tabapayId: `deleted-${tabapayId}`,
          });
        }

        const defaultPaymentMethod = omit(acc.defaultPaymentMethod.get({ plain: true }), [
          'id',
          'deleted',
          'risepayId',
          'created',
          'updated',
        ]);

        const payment = await PaymentMethod.create({
          ...defaultPaymentMethod,
          bankAccountId: foundAcc.id,
          tabapayId,
        });

        await foundAcc.update({ defaultPaymentMethodId: payment.id });
      }
    }),
  );
}

export default {
  session,
  create,
  getToken,
  getItemAddToken,
  listTransitions,
  setCredentialsValid,
  generateMxConnectionInfo,
};
