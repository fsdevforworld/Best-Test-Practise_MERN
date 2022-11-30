import DashboardPaymentMethodModification from '../../../../models/dashboard-payment-method-modification';
import { IDashboardApiRequest, IDashboardV2Response } from '../../../../typings';
import { changelogSerializers, serializeMany } from '../../serializers';

type Response = IDashboardV2Response<changelogSerializers.IChangelogEntryResource[]>;

async function getChangelog(req: IDashboardApiRequest, res: Response) {
  const {
    params: { id: paymentMethodUniversalId },
  } = req;

  const paymentMethodModifications = await DashboardPaymentMethodModification.scope(
    'withDashboardAction',
  ).findAll({ where: { paymentMethodUniversalId } });

  const data = await serializeMany(
    paymentMethodModifications,
    changelogSerializers.serializeModification,
  );

  res.send({ data });
}

export default getChangelog;
