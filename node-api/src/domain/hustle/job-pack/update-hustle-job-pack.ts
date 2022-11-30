import { Transaction } from 'sequelize';
import { JobPacksCreateRequestParams } from './typings';
import { createJobPackSearchesAndProviders } from '../../../../src/domain/hustle/job-pack';
import { sequelize } from '../../../../src/models';
import { AuditLog, HustleJobPack, SideHustleProvider } from '../../../../src/models';
export async function updateHustleJobPack(
  hustleJobPack: HustleJobPack,
  updatePayload: JobPacksCreateRequestParams,
  userId: number,
) {
  let updatedHustleJobPack: HustleJobPack;
  const sideHustleProviders = await SideHustleProvider.findAll({
    where: { name: updatePayload.providers },
  });

  await sequelize.transaction(async transaction => {
    updatedHustleJobPack = await hustleJobPack.update(
      {
        name: updatePayload.name,
        sortBy: updatePayload.sortBy,
        sortOrder: updatePayload.sortOrder,
        image: updatePayload.image,
        bgColor: updatePayload.bgColor,
      },
      { transaction },
    );

    await replaceHustleJobPackSearchesAndProviders(
      hustleJobPack,
      updatePayload,
      sideHustleProviders,
      transaction,
    );

    await AuditLog.create(
      {
        userId,
        type: AuditLog.TYPES.HUSTLE_JOB_PACK_UPDATED,
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

  return updatedHustleJobPack.serialize();
}

async function replaceHustleJobPackSearchesAndProviders(
  hustleJobPack: HustleJobPack,
  updatePayload: JobPacksCreateRequestParams,
  sideHustleProviders: SideHustleProvider[],
  transaction: Transaction,
) {
  await Promise.all([
    ...hustleJobPack.hustleJobPackSearches.map(hustleJobPackSearch =>
      hustleJobPackSearch.destroy({ transaction }),
    ),
    ...hustleJobPack.hustleJobPackProviders.map(hustleJobPackProvider =>
      hustleJobPackProvider.destroy({ transaction }),
    ),
  ]);

  await createJobPackSearchesAndProviders(
    hustleJobPack,
    sideHustleProviders,
    updatePayload.searchTerms,
    updatePayload.providers,
    transaction,
  );
}
