import { HustlePartner } from '@dave-inc/wire-typings';
import { Hustle } from '../types';
import { SideHustle, SideHustleCategory } from '../../../models';
import { mapHustleModelToDomain } from '../utils';

export async function getActiveDaveHustles(): Promise<Hustle[]> {
  const sideHustles: SideHustle[] = await SideHustle.scope('dave').findAll();
  return sideHustles.map(mapHustleModelToDomain);
}

export async function getSideHustleId(
  partner: HustlePartner,
  externalId: string,
  options?: { includeExpired: boolean },
): Promise<number> {
  const queryOptions = {
    externalId,
    partner,
    isActive: true,
  };

  if (options?.includeExpired) {
    delete queryOptions.isActive;
  }

  const sideHustle: SideHustle = await SideHustle.findOne({
    include: [{ model: SideHustleCategory }],
    where: { ...queryOptions },
  });
  return sideHustle?.id;
}

export async function getHustle(
  partner: HustlePartner,
  externalId: string,
): Promise<Hustle | null> {
  const sideHustle: SideHustle = await SideHustle.findOne({
    include: [{ model: SideHustleCategory }],
    where: {
      isActive: true,
      externalId,
      partner,
    },
  });

  return sideHustle ? mapHustleModelToDomain(sideHustle) : null;
}

export async function findOrCreateAppcastHustle(
  appcastHustle: Hustle,
): Promise<[SideHustle, boolean]> {
  return SideHustle.findOrCreate({
    where: {
      externalId: appcastHustle.externalId,
      name: appcastHustle.name,
      company: appcastHustle.company,
      city: appcastHustle.city,
      partner: appcastHustle.hustlePartner,
    },
  });
}
