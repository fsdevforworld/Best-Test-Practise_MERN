import { getParams } from '../../../../../lib/utils';
import { NotFoundError } from '../../../../../lib/error';
import { NotFoundMessageKey } from '../../../../../translations';
import { IDaveRequest } from '../../../../../typings';
import { JobPacksCreateRequestParams } from '../../../../../domain/hustle/job-pack';
import { validateDaveSortBy } from '../../../side-hustle/jobs/validator';
import { HustleJobPack, HustleJobPackProvider, HustleJobPackSearch } from '../../../../../models';

export function validateJobPackData(req: IDaveRequest): JobPacksCreateRequestParams {
  const { name, searchTerms, sortBy, sortOrder, providers, image, bgColor } = getParams(req.body, [
    'name',
    'searchTerms',
    'sortBy',
    'sortOrder',
    'providers',
    'image',
    'bgColor',
  ]);

  validateDaveSortBy(sortBy);

  return { name, searchTerms, sortBy, sortOrder, providers, image, bgColor };
}

export async function validateJobPackExistence(id: number): Promise<HustleJobPack> {
  const hustleJobPack = await HustleJobPack.findByPk(id, {
    include: [HustleJobPackSearch, HustleJobPackProvider],
  });

  if (!hustleJobPack) {
    throw new NotFoundError(NotFoundMessageKey.HustleJobPackNotFound);
  }

  return hustleJobPack;
}
