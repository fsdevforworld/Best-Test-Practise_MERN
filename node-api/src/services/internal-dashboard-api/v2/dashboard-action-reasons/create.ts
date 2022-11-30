import { Op } from 'sequelize';
import { BaseApiError, InvalidParametersError } from '../../../../lib/error';
import { getParams } from '../../../../lib/utils';
import { DashboardActionReason } from '../../../../models';
import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { dashboardActionSerializers, serializeMany } from '../../serializers';

const { or } = Op;

type CreateDashboardActionReasonPayload = Pick<
  DashboardActionReason,
  'dashboardActionId' | 'reason' | 'isActive' | 'noteRequired'
>;

async function create(
  req: IDashboardApiRequest<{ dashboardActionReasons: CreateDashboardActionReasonPayload[] }>,
  res: IDashboardV2Response<dashboardActionSerializers.IDashboardActionReasonResource[]>,
) {
  const { dashboardActionReasons: dashboardActionReasonsPayload } = getParams(req.body, [
    'dashboardActionReasons',
  ]);

  if (!dashboardActionReasonsPayload.length) {
    throw new InvalidParametersError('Please include at least one dashboard action reason');
  }

  dashboardActionReasonsPayload.forEach(
    ({ dashboardActionId, reason }: CreateDashboardActionReasonPayload) => {
      if (!dashboardActionId || !reason) {
        throw new InvalidParametersError('Fields "dashboardActionId" and "reason" are required');
      }
    },
  );

  try {
    await DashboardActionReason.bulkCreate(dashboardActionReasonsPayload, {
      validate: true,
      // we don't mind or error if someone tries to create a dashboard action reason that already
      // exists -- if this becomes a source of confusion for users, we can guard against it in the UI
      // note: this also ignores entries that fail fk constraints: if you try to post a reason with
      // a non-existent dashboardActionId, it will ignore it (see tests)
      ignoreDuplicates: true,
    });

    // bulkCreate doesn't return a true reflection of what's in the db: id values are null and
    // created and updated are the current timestamp, even if there were duplicates (whose rows are
    // not actually updated). it also returns an array of the same size as its input, i.e. inputting
    // [test, test, test, test] returns four values, rather than a unique [test] value as expected
    const dashboardActionReasons = await DashboardActionReason.findAll({
      where: {
        [or]: dashboardActionReasonsPayload,
      },
    });

    const data = await serializeMany(
      dashboardActionReasons,
      dashboardActionSerializers.serializeDashboardActionReason,
    );

    return res.send({ data });
  } catch (e) {
    throw new BaseApiError('Error saving dashboard action reasons', {
      statusCode: 400,
      data: {
        innerErrorMessage: e.message,
      },
    });
  }
}

export default create;
