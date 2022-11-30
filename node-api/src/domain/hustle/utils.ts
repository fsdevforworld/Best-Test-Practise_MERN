import {
  HustlePartner,
  HustleSummaryResponse,
  HustleCategoryResponse,
  HustleJobPackResponse,
} from '@dave-inc/wire-typings';
import {
  SideHustleJob,
  SideHustle,
  HustleJobPack as HustleJobPackModel,
  SideHustleCategory,
} from '../../models';
import { serializeDate } from '../../serialization';
import { Hustle, HustleCategoryConfig, HustleJobPack } from './types';

export type JobId = {
  partner: HustlePartner;
  externalId: string;
};

export function deconstructJobId(concatenatedId: string): JobId {
  const splits = concatenatedId.split('|');
  return { partner: splits[0] as HustlePartner, externalId: splits[1] };
}

export async function constructJobId(daveJob: SideHustleJob): Promise<string> {
  const providerName = (await daveJob.getProvider()).name;
  return constructJobIdStrings(providerName, daveJob.externalId);
}

export function constructJobIdStrings(providerName: HustlePartner, externalId: string): string {
  return `${providerName}|${externalId}`;
}

export function createHustleId(hustle: Hustle): string {
  return `${hustle.hustlePartner}|${hustle.externalId}`;
}

export function mapHustleToHustleSummaryResponse(hustle: Hustle): HustleSummaryResponse {
  return {
    city: hustle.city,
    company: hustle.company,
    hustleId: createHustleId(hustle),
    name: hustle.name,
  };
}

export function mapHustleCategoryConfigToHustleCategoryResponse(
  category: HustleCategoryConfig,
): HustleCategoryResponse {
  return {
    name: category.name,
    priority: category.priority,
    image: category.image,
  };
}

export function mapJobPacksToHustleJobPackResponse(jobPack: HustleJobPack): HustleJobPackResponse {
  return {
    id: jobPack.id,
    name: jobPack.name,
    sortBy: jobPack.sortBy,
    sortOrder: jobPack.sortOrder,
    image: jobPack.image,
    bgColor: jobPack.bgColor,
    created: jobPack.created,
    updated: jobPack.updated,
  };
}

export function mapHustleModelToDomain(model: SideHustle): Hustle {
  return {
    name: model.name,
    company: model.company,
    postedDate: model.postedDate,
    description: model.description,
    affiliateLink: model.affiliateLink,
    category: model.category?.name || null,
    externalId: model.externalId,
    hustlePartner: model.partner,
    isActive: model.isActive,
    city: model.city,
    state: model.state,
    logo: model.logo,
  };
}

export function mapJobPackModelToDomain(model: HustleJobPackModel): HustleJobPack {
  return {
    id: model.id,
    name: model.name,
    sortBy: model.sortBy,
    sortOrder: model.sortOrder,
    image: model.image,
    bgColor: model.bgColor,
    created: serializeDate(model.created),
    updated: serializeDate(model.updated),
  };
}

export function mapCategoryModelToDomain(model: SideHustleCategory): HustleCategoryConfig {
  return {
    image: model.image,
    name: model.name,
    priority: model.priority,
  };
}
