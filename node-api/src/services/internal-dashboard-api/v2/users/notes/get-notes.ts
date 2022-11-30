import { orderBy, uniq } from 'lodash';
import { Op } from 'sequelize';
import {
  AdminComment,
  DashboardUserNote,
  DashboardNotePriority,
  User,
} from '../../../../../models';
import { IDashboardApiResourceRequest, IDashboardV2Response } from '../../../../../typings';
import { serializeMany, noteSerializers } from '../../../serializers';

async function getNotes(
  req: IDashboardApiResourceRequest<User>,
  res: IDashboardV2Response<noteSerializers.INoteResource[], noteSerializers.INotePriorityResource>,
) {
  const {
    resource: { id: userId },
  } = req;

  const [adminComments, userNotes] = await Promise.all([
    AdminComment.scope('withRelated').findAll({ where: { userId } }),
    DashboardUserNote.scope('withRelated').findAll({
      where: { userId },
    }),
  ]);

  const priorityCodes = uniq([
    ...adminComments.map(comment => comment.getDashboardNotePriorityCode()),
    ...userNotes.map(({ dashboardNotePriorityCode }) => dashboardNotePriorityCode),
  ]);

  const notePriorities = await DashboardNotePriority.findAll({
    where: { code: { [Op.in]: priorityCodes } },
  });

  const [
    serializedAdminComments,
    serializedUserNotes,
    serializedNotePriorities,
  ] = await Promise.all([
    serializeMany(adminComments, noteSerializers.serializeAdminComment),
    serializeMany(userNotes, noteSerializers.serializeUserNote),
    serializeMany(notePriorities, noteSerializers.serializeNotePriority),
  ]);

  const data = orderBy(
    [...serializedAdminComments, ...serializedUserNotes],
    ['attributes.created'],
    ['desc'],
  );

  const response = {
    data,
    included: serializedNotePriorities,
  };

  return res.send(response);
}

export default getNotes;
