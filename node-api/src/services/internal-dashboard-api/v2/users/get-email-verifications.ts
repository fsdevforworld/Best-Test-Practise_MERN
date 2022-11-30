import { EmailVerification, User } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { serializeMany, userSerializers } from '../../serializers';

async function getEmailVerifications(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<userSerializers.IEmailVerificationResource[]>,
) {
  const emailVerifications = await EmailVerification.findAll({
    where: { userId: req.resource.id },
  });

  const data = await serializeMany(emailVerifications, userSerializers.serializeEmailVerification);

  const response = {
    data,
  };

  return res.send(response);
}

export default getEmailVerifications;
