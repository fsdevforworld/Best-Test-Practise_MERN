import { HustleJobPackResponse, StandardResponse } from '@dave-inc/wire-typings';
import { IDaveRequest, IDaveResponse } from '../../../../../typings';
import { validateJobPackData, validateJobPackExistence } from './validator';
import {
  createHustleJobPack,
  deleteHustleJobPack,
  updateHustleJobPack,
  getAllHustleJobPacks,
} from '../../../../../domain/hustle/job-pack';

export async function create(req: IDaveRequest, res: IDaveResponse<HustleJobPackResponse>) {
  const { name, searchTerms, sortBy, sortOrder, providers, image, bgColor } = validateJobPackData(
    req,
  );

  const hustleJobPack = await createHustleJobPack({
    userId: req.user.id,
    name,
    searchTerms,
    sortBy,
    sortOrder,
    providers,
    image,
    bgColor,
  });

  res.send(hustleJobPack);
}

export async function update(req: IDaveRequest, res: IDaveResponse<HustleJobPackResponse>) {
  const updatePayload = validateJobPackData(req);
  const hustleJobPack = await validateJobPackExistence(req.params.id);
  const updatedHustleJobPack = await updateHustleJobPack(hustleJobPack, updatePayload, req.user.id);
  res.send(updatedHustleJobPack);
}

export async function remove(req: IDaveRequest, res: IDaveResponse<StandardResponse>) {
  const hustleJobPack = await validateJobPackExistence(req.params.id);
  await deleteHustleJobPack(hustleJobPack, req.user.id);

  res.send();
}

export async function get(req: IDaveRequest, res: IDaveResponse<HustleJobPackResponse[]>) {
  const hustleJobPacks = await getAllHustleJobPacks();
  res.send(hustleJobPacks);
}
