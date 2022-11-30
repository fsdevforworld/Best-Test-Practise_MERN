import { Op } from 'sequelize';
import { BaseApiError, InvalidParametersError } from '../../../../lib/error';
import { getParams } from '../../../../lib/utils';
import { DashboardAction } from '../../../../models';
import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { dashboardActionSerializers, serializeMany } from '../../serializers';

const { or } = Op;

type DashboardActionPayload = Pick<DashboardAction, 'name' | 'code'>;

async function create(
  req: IDashboardApiRequest<{ dashboardActions: DashboardActionPayload[] }>,
  res: IDashboardV2Response<dashboardActionSerializers.IDashboardActionResource[]>,
) {
  const { dashboardActions: dashboardActionsPayload } = getParams(req.body, ['dashboardActions']);

  if (!dashboardActionsPayload.length) {
    throw new InvalidParametersError('Please include at least one dashboard action');
  }

  dashboardActionsPayload.forEach(({ name, code }: DashboardActionPayload) => {
    if (!name || !code) {
      throw new InvalidParametersError('Fields "name" and "code" are both required');
    }

    // code should be kebab-case-and-simple-123
    if (!code.match(/^[A-Za-z0-9\-]+$/)) {
      throw new InvalidParametersError(
        '"code" field can only contain numbers, letters, and dashes, as in: example-123-code',
      );
    }
  });

  try {
    await DashboardAction.bulkCreate(dashboardActionsPayload, {
      validate: true,
      // we don't mind or error if someone tries to create a dashboard action that already exists --
      // if this becomes a source of confusion for users, we can guard against it in the UI
      ignoreDuplicates: true,
    });

    // bulkCreate doesn't return a true reflection of what's in the db: id values are null and
    // created and updated are the current timestamp, even if there were duplicates (whose rows are
    // not actually updated). it also returns an array of the same size as its input, i.e. inputting
    // [test, test, test, test] returns four values, rather than a unique [test] value as expected
    const dashboardActions = await DashboardAction.findAll({
      where: {
        [or]: dashboardActionsPayload,
      },
    });

    const data = await serializeMany(
      dashboardActions,
      dashboardActionSerializers.serializeDashboardAction,
    );

    return res.send({ data });
  } catch (e) {
    throw new BaseApiError('Error saving dashboard action names', {
      statusCode: 400,
      data: {
        innerErrorMessage: e.message,
      },
    });
  }
}

export default create;
