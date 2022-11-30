import { HustleJobPackResponse } from '@dave-inc/wire-typings';
import { Transaction } from 'sequelize';
import { JobPacksCreateRequestParams, SearchTerms } from './typings';
import { sequelize } from '../../../../src/models';
import {
  AuditLog,
  HustleJobPack,
  HustleJobPackSearch,
  HustleJobPackProvider,
  SideHustleProvider,
} from '../../../../src/models';

export async function createHustleJobPack({
  userId,
  name,
  searchTerms,
  sortBy,
  sortOrder,
  providers,
  image,
  bgColor,
}: JobPacksCreateRequestParams & { userId: number }): Promise<HustleJobPackResponse> {
  const sideHustleProviders = await SideHustleProvider.findAll({ where: { name: providers } });
  let hustleJobPack: HustleJobPack;
  await sequelize.transaction(async transaction => {
    hustleJobPack = await HustleJobPack.create(
      {
        name,
        sortBy,
        sortOrder,
        image,
        bgColor,
      },
      { transaction },
    );

    await createJobPackSearchesAndProviders(
      hustleJobPack,
      sideHustleProviders,
      searchTerms,
      providers,
      transaction,
    );

    await AuditLog.create(
      {
        userId,
        type: 'HUSTLE_JOB_CREATED',
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

  return hustleJobPack.serialize();
}

export async function createJobPackSearchesAndProviders(
  hustleJobPack: HustleJobPack,
  sideHustleProviders: SideHustleProvider[],
  searchTerms: SearchTerms[],
  providers: string[],
  transaction: Transaction,
) {
  const hustleJobPackSearchPayload = searchTerms.map(({ term, value }) => ({
    hustleJobPackId: hustleJobPack.id,
    term,
    value,
  }));
  const hustleJobPackProviderPayload = providers.map(providerName => {
    const sideHustleProvider = sideHustleProviders.find(provider => provider.name === providerName);
    return {
      hustleJobPackId: hustleJobPack.id,
      sideHustleProviderId: sideHustleProvider.id,
    };
  });

  await Promise.all([
    HustleJobPackSearch.bulkCreate(hustleJobPackSearchPayload, { transaction }),
    HustleJobPackProvider.bulkCreate(hustleJobPackProviderPayload, { transaction }),
  ]);
}
