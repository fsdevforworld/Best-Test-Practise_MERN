import * as Bluebird from 'bluebird';
import { merge } from 'lodash';
import loomisClient, {
  BankAccountType,
  StandardResponse,
  PaymentMethod as LoomisPaymentMethod,
  PaymentProviderTransactionStatus,
  PaymentProviderTransactionType,
  TransactionId,
  parsePaymentMethod,
} from '@dave-inc/loomis-client';
import { ExternalTransactionProcessor, ExternalTransactionStatus } from '@dave-inc/wire-typings';
import { Includeable, Op, WhereOptions, FindOptions } from 'sequelize';
import { isNil } from 'lodash';
import { BankAccount, Payment, PaymentMethod } from '../../src/models';
import { bankAccountModelToPaymentMethod, paymentMethodModelToType } from '../../src/typings';
import { NotFoundError } from '../../src/lib/error';
import { Moment, moment } from '@dave-inc/time-lib';
import { generateFindPaymentMethodWhere } from '../../src/services/loomis-api/find-payment-method';
import { serializeAdvancePaymentForLoomis } from '../../src/services/loomis-api/get-payment-details';

type GetPaymentMethod = {
  id?: number;
  userId?: number;
  mask?: string;
  empyrCardId?: number;
  includeSoftDeleted?: boolean;
  empyrCardIdIsNull?: boolean;
  universalId?: string;
};

type UpdatePaymentMethodOptions = {
  invalid?: Moment;
  invalidReasonCode?: string;
  optedIntoDaveRewards?: boolean;
  empyrCardId?: number;
  linked?: boolean;
};

/**
 * Mock loomis client behavior
 *
 * @param {sinon.SinonSandbox} sandbox
 * @returns {void}
 */
export default function stubLoomisClient(sandbox: sinon.SinonSandbox) {
  const parseUniversalId = (where: WhereOptions, universalId: string): WhereOptions => {
    return {
      ...where,
      id: parsePaymentMethod(universalId).id,
    };
  };

  sandbox.stub(loomisClient, 'getPaymentMethod').callsFake(
    async (options: GetPaymentMethod): Promise<StandardResponse<LoomisPaymentMethod>> => {
      const { id, userId, includeSoftDeleted, universalId } = options;
      if (id && universalId) {
        throw new Error('id and universalId cannot both be set');
      }

      let where: WhereOptions = generateFindPaymentMethodWhere(options);
      if (!id && universalId) {
        where = parseUniversalId(where, universalId);
      }

      const include: Includeable[] = [];
      const paranoid = !includeSoftDeleted;

      if (!id && !universalId && !userId) {
        return { data: null };
      }

      const row = await PaymentMethod.findOne({
        where,
        include,
        paranoid,
      });

      const data = row ? paymentMethodModelToType(row) : null;

      return { data };
    },
  );

  const fakeGetPaymentMethods: typeof loomisClient.getPaymentMethods = async (
    userId,
    { includeBankAccounts, includeSoftDeleted, paymentMethodIds },
  ) => {
    if (!userId) {
      return { data: null };
    }

    const query: FindOptions = { where: { userId } };
    if (includeSoftDeleted) {
      query.paranoid = false;
    }

    const pmRows = await PaymentMethod.findAll(query);

    const baRows = includeBankAccounts
      ? await BankAccount.findAll(merge({}, query, { where: { type: BankAccountType.Depository } }))
      : [];

    const debitPaymentMethods = pmRows.map(paymentMethodModelToType);
    const baPaymentMethods = await Bluebird.map(baRows, bankAccountModelToPaymentMethod);
    const data = debitPaymentMethods.concat(baPaymentMethods);
    return { data };
  };
  sandbox.stub(loomisClient, 'getPaymentMethods').callsFake(fakeGetPaymentMethods);

  sandbox
    .stub(loomisClient, 'getTransactionDetails')
    .callsFake(async (type: PaymentProviderTransactionType, id: TransactionId) => {
      if (!('legacyPaymentId' in id)) {
        throw new Error('New IDs are not supported');
      }
      switch (type) {
        case PaymentProviderTransactionType.AdvancePayment:
          const payment = await Payment.findByPk(id.legacyPaymentId);
          if (isNil(payment)) {
            return { data: null };
          }

          return { data: serializeAdvancePaymentForLoomis(payment) };
        default:
          return { error: new Error('Only Advance Payments supported for now') };
      }
    });

  sandbox
    .stub(loomisClient, 'getLatestTransactionDetails')
    .callsFake(async (type: PaymentProviderTransactionType, userId: number) => {
      switch (type) {
        case PaymentProviderTransactionType.AdvancePayment:
          const payment = await Payment.findOne({
            order: [['created', 'DESC']],
            where: { userId, status: { [Op.ne]: ExternalTransactionStatus.Canceled } },
          });

          if (isNil(payment)) {
            return { data: null };
          }

          return { data: serializeAdvancePaymentForLoomis(payment) };
        default:
          return { error: new Error('Only Advance Payments supported for now') };
      }
    });

  sandbox.stub(loomisClient, 'findTransactionDetails').callsFake(
    async (
      type,
      options:
        | {
            daveUserId: number;
            status: PaymentProviderTransactionStatus;
          }
        | {
            externalId: string;
            externalProcessor: ExternalTransactionProcessor;
          },
    ) => {
      let payment: Payment;
      if ('daveUserId' in options) {
        payment = await Payment.findOne({
          where: {
            userId: options.daveUserId,
            status: options.status,
          },
        });
      } else {
        payment = await Payment.findOne({
          where: options,
        });
      }
      if (isNil(payment)) {
        return { data: null };
      }
      return { data: serializeAdvancePaymentForLoomis(payment) };
    },
  );

  sandbox.stub(loomisClient, 'deletePaymentMethod').callsFake(
    async (paymentMethodId: number): Promise<StandardResponse<boolean>> => {
      const paymentMethod = await PaymentMethod.destroy({
        force: true,
        where: { id: paymentMethodId },
      });

      if (paymentMethod === 0) {
        return { error: new NotFoundError() };
      }

      return { data: true };
    },
  );

  sandbox
    .stub(loomisClient, 'updatePaymentMethod')
    .callsFake(async (paymentMethodId: number, options: UpdatePaymentMethodOptions) => {
      const paymentMethodToUpdate = await PaymentMethod.findByPk(paymentMethodId);

      const { invalidReasonCode, optedIntoDaveRewards, empyrCardId, linked } = options;

      if (paymentMethodToUpdate === null) {
        throw new NotFoundError();
      }

      const fieldsToUpdate: UpdatePaymentMethodOptions = {};

      if (!!invalidReasonCode) {
        fieldsToUpdate.invalid = moment();
        fieldsToUpdate.invalidReasonCode = invalidReasonCode;
      }

      if (typeof optedIntoDaveRewards !== 'undefined') {
        fieldsToUpdate.optedIntoDaveRewards = optedIntoDaveRewards;
      }

      if (!!empyrCardId) {
        fieldsToUpdate.empyrCardId = empyrCardId;
      }

      if (typeof linked !== 'undefined') {
        fieldsToUpdate.linked = linked;
      }

      await paymentMethodToUpdate.update(fieldsToUpdate);

      const data = paymentMethodModelToType(paymentMethodToUpdate);

      return { data };
    });
}
