import { HustleJobPack } from '../types';
import { mapJobPackModelToDomain } from '../utils';
import { HustleJobPack as HustleJobPackModel } from '../../../models';

export async function findAll(): Promise<HustleJobPack[]> {
  const hustleJobPacks = await HustleJobPackModel.findAll();
  return hustleJobPacks.map(mapJobPackModelToDomain);
}
