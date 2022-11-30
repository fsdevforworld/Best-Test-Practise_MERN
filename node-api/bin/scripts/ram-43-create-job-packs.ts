import {
  HustleJobPack,
  HustleJobPackProvider,
  HustleJobPackSearch,
  SideHustleProvider,
} from '../../src/models';
import logger from '../../src/lib/logger';
import { APPCAST_SORT_SCORE } from '../../src/lib/appcast/constants';
import { HustlePartner, HustleSortOrder } from '@dave-inc/wire-typings';

async function insertJobPacks() {
  logger.info(`inserting job packs...`);

  // providers
  const daveProvider = await SideHustleProvider.findOne({ where: { name: HustlePartner.Dave } });
  const appcastProvider = await SideHustleProvider.findOne({
    where: { name: HustlePartner.Appcast },
  });

  logger.info(`inserting wfh...`);
  // workFromHome: '#5337A0'
  const wfhPack = await HustleJobPack.create({
    name: 'Work from Home',
    sortBy: APPCAST_SORT_SCORE,
    sortOrder: HustleSortOrder.DESC,
    image:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/workFromHome.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/workFromHome-small.png',
    bgColor: '5337A0',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: wfhPack.id,
    sideHustleProviderId: daveProvider.id,
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: wfhPack.id,
    sideHustleProviderId: appcastProvider.id,
  });

  await HustleJobPackSearch.create({
    hustleJobPackId: wfhPack.id,
    term: 'keyword',
    value: 'work from home',
  });

  logger.info(`inserting flexible...`);

  //   flexible: '#0C622C'
  const flexiblePack = await HustleJobPack.create({
    name: 'Flexible',
    sortBy: APPCAST_SORT_SCORE,
    sortOrder: HustleSortOrder.DESC,
    image:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/flexibleHours.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/flexibleHours.png',
    bgColor: '0C622C',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: flexiblePack.id,
    sideHustleProviderId: daveProvider.id,
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: flexiblePack.id,
    sideHustleProviderId: appcastProvider.id,
  });

  await HustleJobPackSearch.create({
    hustleJobPackId: flexiblePack.id,
    term: 'keyword',
    value: 'flexible hours',
  });

  logger.info(`inserting part time...`);

  // partTime: '#808080'
  const partPack = await HustleJobPack.create({
    name: 'Part Time',
    sortBy: APPCAST_SORT_SCORE,
    sortOrder: HustleSortOrder.DESC,
    image:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/partTime.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/partTime-small.png',
    bgColor: '808080',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: partPack.id,
    sideHustleProviderId: daveProvider.id,
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: partPack.id,
    sideHustleProviderId: appcastProvider.id,
  });

  await HustleJobPackSearch.create({
    hustleJobPackId: partPack.id,
    term: 'keyword',
    value: 'part time',
  });

  logger.info(`inserting gig...`);

  // gig: '#326AC8'
  const gigPack = await HustleJobPack.create({
    name: 'Gig Jobs',
    sortBy: 'name',
    sortOrder: HustleSortOrder.ASC,
    image:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/gigJobs.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/gigJobs-small.png',
    bgColor: '326AC8',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: gigPack.id,
    sideHustleProviderId: daveProvider.id,
  });

  logger.info(`inserting seasonal...`);

  // seasonal: '#CA7456'
  const seasonalPack = await HustleJobPack.create({
    name: 'Seasonal',
    sortBy: APPCAST_SORT_SCORE,
    sortOrder: HustleSortOrder.DESC,
    image:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/seasonal.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/seasonal-small.png',
    bgColor: 'CA7456',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: seasonalPack.id,
    sideHustleProviderId: daveProvider.id,
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: seasonalPack.id,
    sideHustleProviderId: appcastProvider.id,
  });

  await HustleJobPackSearch.create({
    hustleJobPackId: seasonalPack.id,
    term: 'keyword',
    value: 'seasonal',
  });

  logger.info(`inserting temp...`);

  // temp: '#A33535'
  const tempPack = await HustleJobPack.create({
    name: 'Temp',
    sortBy: APPCAST_SORT_SCORE,
    sortOrder: HustleSortOrder.DESC,
    image: 'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/temp.png',
    imageSmall:
      'https://storage.googleapis.com/dave-images/images-production/hustle/job-packs/temp-small.png',
    bgColor: 'A33535',
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: tempPack.id,
    sideHustleProviderId: daveProvider.id,
  });

  await HustleJobPackProvider.create({
    hustleJobPackId: tempPack.id,
    sideHustleProviderId: appcastProvider.id,
  });

  await HustleJobPackSearch.create({
    hustleJobPackId: tempPack.id,
    term: 'keyword',
    value: 'temp',
  });

  logger.info(`finished ram-43 inserting`);
}

insertJobPacks()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error('Error in script ram-43-create-job-packs', { error: err });
    process.exit(1);
  });
