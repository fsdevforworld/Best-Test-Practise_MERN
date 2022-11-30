import { IDaveRequest, IDaveResponse } from '../../../typings/dave-request-response';
import {
  HustleResponse,
  HustleSearchResponse,
  HustleSummaryResponse,
  HustleCategoryResponse,
  HustleJobPackResponse,
} from '@dave-inc/wire-typings';
import * as HustleController from './controller';

export async function search(req: IDaveRequest, res: IDaveResponse<HustleSearchResponse>) {
  res.send(await HustleController.search(req));
}

export async function get(req: IDaveRequest, res: IDaveResponse<HustleResponse>) {
  res.send(await HustleController.get(req));
}

export async function saveHustle(req: IDaveRequest, res: IDaveResponse<HustleSummaryResponse[]>) {
  const savedHustles = await HustleController.saveHustle(req);
  res.send(savedHustles);
}

export async function unsaveHustle(req: IDaveRequest, res: IDaveResponse<HustleSummaryResponse[]>) {
  res.send(await HustleController.unsaveHustle(req));
}

export async function getSavedHustles(
  req: IDaveRequest,
  res: IDaveResponse<HustleSummaryResponse[]>,
) {
  res.send(await HustleController.getSavedHustles(req));
}

export async function getCategories(
  req: IDaveRequest,
  res: IDaveResponse<HustleCategoryResponse[]>,
) {
  res.send(await HustleController.getCategories());
}

export async function getJobPacks(req: IDaveRequest, res: IDaveResponse<HustleJobPackResponse[]>) {
  res.send(await HustleController.getJobPacks());
}
