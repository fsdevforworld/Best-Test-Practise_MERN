import { Response } from 'express';
import { Institution } from '../../models';

import { NotFoundError } from '../../lib/error';
import { IDaveRequest } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import InstitutionStatusHelper from '../../helper/institution-status';
import { NotFoundMessageKey } from '../../translations';

async function getStatus(req: IDaveRequest, res: Response): Promise<Response> {
  const institution = await Institution.findByPk(req.params.id);

  if (!institution) {
    dogstatsd.increment('institutions.attempted_to_get_plaid_status.failed', {
      reason: 'not_found',
    });
    throw new NotFoundError(NotFoundMessageKey.NoInstitutionFound);
  }

  const { plaidInstitutionId } = institution;
  const plaidInstitutionSubsystemStatus = await InstitutionStatusHelper.getPlaidInstitutionSubsystemStatus(
    plaidInstitutionId,
  );
  const institutionSubsystemStatus = InstitutionStatusHelper.format(
    plaidInstitutionSubsystemStatus,
  );

  return res.send(institutionSubsystemStatus);
}

export default {
  getStatus,
};
