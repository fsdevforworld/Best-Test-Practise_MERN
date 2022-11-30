import { SideHustle, SideHustleSavedJob } from '../../src/models';

export function createHustleIdFromSideHustle(sideHustle: SideHustle): string {
  return `${sideHustle.partner}|${sideHustle.externalId}`;
}

export async function getHustleIdForSavedJob(savedJob: SideHustleSavedJob): Promise<string> {
  const sideHustle = await savedJob.getSideHustle();
  return createHustleIdFromSideHustle(sideHustle);
}
