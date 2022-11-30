import { sequelize } from '../../../../src/models';
import { AuditLog, HustleJobPack } from '../../../../src/models';

export async function deleteHustleJobPack(
  hustleJobPack: HustleJobPack,
  userId: number,
): Promise<void> {
  await sequelize.transaction(async transaction => {
    await Promise.all([
      ...hustleJobPack.hustleJobPackSearches.map(hustleJobPackSearch =>
        hustleJobPackSearch.destroy({ transaction }),
      ),
      ...hustleJobPack.hustleJobPackProviders.map(hustleJobPackProvider =>
        hustleJobPackProvider.destroy({ transaction }),
      ),
    ]);
    await hustleJobPack.destroy({ transaction });

    await AuditLog.create(
      {
        userId,
        type: 'HUSTLE_JOB_DELETED',
        successful: true,
        eventUuid: userId,
        extra: {
          data: {
            hustleJobPackId: hustleJobPack.id,
          },
        },
      },
      { transaction },
    );
  });
}
