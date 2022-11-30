import { StandardResponse } from '@dave-inc/wire-typings';
import {
  CUSTOM_ERROR_CODES,
  InvalidParametersError,
  NotFoundError,
  UnauthorizedError,
} from '../../../../lib/error';
import * as Bluebird from 'bluebird';
import { compact } from 'lodash';
import { getParams } from '../../../../lib/utils';
import UserHelper from '../../../../helper/user';
import {
  AdminComment,
  AdminPaycheckOverride,
  AuditLog,
  BankAccount,
  BankConnection,
  PaymentMethod,
  User,
} from '../../../../models';
import { Response } from 'express';
import { VerificationCodeDeliveryMethod } from '../../../../models/user';
import { IDashboardApiRequest, IDaveResponse } from '../../../../typings';
import { Op } from 'sequelize';
import { InvalidParametersMessageKey, NotFoundMessageKey } from '../../../../translations';
import * as config from 'config';
import details from './details';
import update from './update';
import searchUsers from './search-users';
import loomisClient, { PaymentMethod as LoomisPaymentMethod } from '@dave-inc/loomis-client';

function organizeDeletedConns(
  conns: Array<Partial<BankConnection>>,
  accounts: BankAccount[],
  methods: LoomisPaymentMethod[],
) {
  return conns.map(conn => {
    return {
      ...conn,
      accounts: accounts
        .filter(a => a.bankConnectionId === conn.id)
        .map(a => {
          return {
            ...a.toJSON(),
            methods: methods.filter(m => m.bankAccountId === a.id),
          };
        }),
    };
  });
}

async function getDeletedPaymentMethods(userId: number): Promise<LoomisPaymentMethod[]> {
  const loomisResponse = await loomisClient.getPaymentMethods(userId, {
    includeSoftDeleted: true,
  });
  if ('error' in loomisResponse) {
    throw new Error(`Loomis gave an error in getPaymentMethods ${loomisResponse.error.message}`);
  }
  return loomisResponse.data.filter(paymentMethod => paymentMethod.deleted);
}

async function fetchDeletedUserDetails(userId: number) {
  const { conns_deleted, accounts_deleted, methods_deleted } = await Bluebird.props({
    conns_deleted: BankConnection.getByUserIdWithInstitution(userId, true),
    accounts_deleted: BankAccount.findAll({
      paranoid: false,
      where: { userId, deleted: { [Op.not]: null } },
    }),
    methods_deleted: getDeletedPaymentMethods(userId),
  });

  return {
    connections_deleted: organizeDeletedConns(conns_deleted, accounts_deleted, methods_deleted),
  };
}

async function search(req: IDashboardApiRequest, res: Response): Promise<Response> {
  if (!req.query || !req.query.q) {
    return res.status(400).send([]);
  }

  const searchTerms = compact(req.query.q.trim().split(' ')).join(' ');
  const users = await searchUsers(searchTerms);
  const lightUserObjs = users.map(user => ({ user }));

  return res.status(200).send(lightUserObjs);
}

async function deletedDetails(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const deletedDetailsUser = await fetchDeletedUserDetails(req.params.id);
  return res.status(200).send(deletedDetailsUser);
}

async function auditLog(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const log = await AuditLog.findAll({
    where: { userId: req.params.id },
    order: [['created', 'DESC']],
  });
  return res.status(200).send(log);
}

async function createAdminComment(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const { userId, message, isHighPriority } = getParams(
    req.body,
    ['userId', 'message', 'isHighPriority'],
    [],
  );

  const comment = await AdminComment.create({
    userId,
    message,
    isHighPriority,
    authorId: req.internalUser.id,
  });
  return res.send(comment);
}

async function deleteAdminComment(
  req: IDashboardApiRequest<{ phone_number: string }>,
  res: Response,
): Promise<Response> {
  await AdminComment.destroy({ where: { id: req.params.id } });
  return res.status(200).send('Success');
}

async function createAdminPaycheckOverride(
  req: IDashboardApiRequest<{
    user_id: number;
    bank_account_id: number;
    amount: number;
    pay_date: string;
    note: string;
  }>,
  res: Response,
): Promise<Response> {
  const {
    user_id: userId,
    bank_account_id: bankAccountId,
    amount,
    pay_date: payDate,
    note,
  } = req.body;
  const override = await AdminPaycheckOverride.create({
    userId,
    creatorId: req.internalUser.id,
    bankAccountId,
    amount,
    payDate,
    note,
  });

  return res.send({ id: override.id });
}

async function deleteAdminPaycheckOverride(
  req: IDashboardApiRequest,
  res: Response,
): Promise<Response> {
  await AdminPaycheckOverride.destroy({ where: { id: req.params.id } });
  return res.send('success');
}

async function duplicatePaymentMethods(req: IDashboardApiRequest, res: Response) {
  const { tabapayIds } = req.query;

  let debitCards: PaymentMethod[] = [];
  if (tabapayIds) {
    debitCards = await PaymentMethod.findAll({
      paranoid: false,
      where: {
        tabapayId: tabapayIds.split(','),
      },
    });
  }

  const userIds = debitCards.map(card => card.userId);

  userIds.length > 0 ? res.send({ userIds }) : res.status(404).send();
}

async function sendVerificationCode(
  req: IDashboardApiRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const { userId, deliveryType } = getParams(req.body, ['userId', 'deliveryType']);

  if (
    deliveryType !== VerificationCodeDeliveryMethod.PHONE &&
    deliveryType !== VerificationCodeDeliveryMethod.EMAIL
  ) {
    throw new InvalidParametersError('deliveryType must be phone or email');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError(NotFoundMessageKey.UserNotFound);
  }
  if (config.get('phoneNumbers.shouldSendVerificationCode')) {
    await UserHelper.sendVerificationCode({
      phoneNumber: user.phoneNumber,
      email: deliveryType === VerificationCodeDeliveryMethod.EMAIL ? user.email : undefined,
    });
  }
  return res.send({ ok: true });
}

async function validateVerificationCode(
  req: IDashboardApiRequest,
  res: IDaveResponse<StandardResponse>,
): Promise<Response> {
  const { userId, code } = getParams(req.body, ['userId', 'code']);

  const user = await User.findByPk(userId);
  if (!user) {
    throw new NotFoundError(NotFoundMessageKey.UserNotFound);
  }

  const validated = await UserHelper.validateVerificationCode(user.phoneNumber, code);
  if (!validated) {
    throw new UnauthorizedError(InvalidParametersMessageKey.VerificationCodeIsInvalid, {
      name: 'invalid_code',
      customCode: CUSTOM_ERROR_CODES.USER_INVALID_CREDENTIALS,
    });
  }

  return res.send({ ok: true });
}

export default {
  search,
  details,
  deletedDetails,
  auditLog,
  update,
  createAdminComment,
  deleteAdminComment,
  createAdminPaycheckOverride,
  deleteAdminPaycheckOverride,
  duplicatePaymentMethods,
  sendVerificationCode,
  validateVerificationCode,
};
