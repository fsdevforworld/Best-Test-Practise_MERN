import { Role, User, UserRole } from '../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../typings';
import { serializeMany, userSerializers } from '../../serializers';

async function getRoles(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<userSerializers.IRoleResource[]>,
) {
  const userRoles = await UserRole.findAll({
    where: { userId: req.resource.id },
    include: [{ model: Role, where: { deleted: null }, required: true }],
  });

  const roles = userRoles.map(userRole => userRole.role);

  const data = await serializeMany(roles, userSerializers.serializeRole);

  const response = {
    data,
  };

  return res.send(response);
}

export default getRoles;
