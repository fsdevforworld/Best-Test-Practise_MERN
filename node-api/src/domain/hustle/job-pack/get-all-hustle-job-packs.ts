import { HustleJobPackResponse } from '@dave-inc/wire-typings';
import { HustleJobPack } from '../../../../src/models';

export async function getAllHustleJobPacks(): Promise<HustleJobPackResponse[]> {
  const hustleJobPacks = await HustleJobPack.findAll();
  return hustleJobPacks.map(hustleJobPack => hustleJobPack.serialize());
}
