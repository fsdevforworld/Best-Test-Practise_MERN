import * as SideHustleDao from './side-hustle-dao';
import { Hustle } from '../types';
import { SideHustle, SideHustleSavedJob } from '../../../models';
import { mapHustleModelToDomain } from '../utils';

export async function save({
  userId,
  sideHustleId,
  appcastDataForCreate,
}: {
  userId: number;
  sideHustleId?: number;
  appcastDataForCreate?: Hustle;
}) {
  let id = sideHustleId;
  if (!id && appcastDataForCreate) {
    const [createdOrFoundSideHustle] = await SideHustleDao.findOrCreateAppcastHustle(
      appcastDataForCreate,
    );
    id = createdOrFoundSideHustle.id;
  }

  await SideHustleSavedJob.upsert({ userId, sideHustleId: id });
}

export async function unsave({
  sideHustleId,
  userId,
}: {
  sideHustleId: number;
  userId: number;
}): Promise<void> {
  const savedRow = await SideHustleSavedJob.findOne({
    where: { userId, sideHustleId },
  });
  if (!savedRow) {
    return;
  }
  await SideHustleSavedJob.destroy({ where: { id: savedRow.id } });
}

export async function getHustlesForUser(userId: number): Promise<Hustle[]> {
  const hustles = await SideHustleSavedJob.findAll({
    where: {
      userId,
    },
    include: [SideHustle],
    order: [['updated', 'DESC']],
  });

  return hustles.map(savedJob => mapHustleModelToDomain(savedJob.sideHustle));
}
