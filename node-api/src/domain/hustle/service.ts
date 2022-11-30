import { HustlePartner } from '@dave-inc/wire-typings';
import { isEmpty } from 'lodash';
import { $enum } from 'ts-enum-util';
import * as AppcastProvider from './appcast-provider';
import * as SideHustleDao from './dao/side-hustle-dao';
import * as CategoryDao from './dao/category-dao';
import * as SavedHustleDao from './dao/saved-hustle-dao';
import * as JobPackDao from './dao/job-pack-dao';
import { Hustle, HustleSearchCriteria } from './index';
import { deconstructJobId } from './utils';
import { metrics, HustleMetrics as Metrics } from './metrics';
import { AppcastResponseError, InvalidParametersError, NotFoundError } from '../../lib/error';
import logger from '../../lib/logger';
import { InvalidParametersMessageKey, NotFoundMessageKey } from '../../translations';
import { HustleSearchResult, HustleCategoryConfig, HustleJobPack } from './types';

function matchesKeywords(hustle: Hustle, keywords: string[]): boolean {
  for (const k of keywords) {
    const matcher = new RegExp(k, 'i');
    if (
      matcher.test(hustle.description) ||
      matcher.test(hustle.company) ||
      matcher.test(hustle.name)
    ) {
      return true;
    }
  }
  return false;
}

function sanitizeKeywords(keywords: string[]): string[] {
  // remove all non-alphanumeric characters from keywords
  const sanitizedKw = keywords.map(kw =>
    kw
      .replace(/[^0-9A-Za-z]/gi, ' ')
      .trim()
      .split(' '),
  );
  // filter keywords of length less than 3 out of the final list
  return [].concat(...sanitizedKw).filter(kw => kw.length > 2);
}

function filterHustlesBySearchCriteria(
  hustles: Hustle[],
  searchCritera: HustleSearchCriteria,
): Hustle[] {
  if (searchCritera.category) {
    hustles = hustles.filter(hustle => hustle.category === searchCritera.category);
  }
  if (!isEmpty(searchCritera.keywords)) {
    const sanitizedKeywords = sanitizeKeywords(searchCritera.keywords);
    hustles = hustles.filter(hustle => matchesKeywords(hustle, sanitizedKeywords));
  }
  return hustles;
}

function shouldSearchDaveHustles(searchCritera: HustleSearchCriteria): boolean {
  if (searchCritera.page != null && searchCritera.page > 0) {
    return false;
  }
  return !searchCritera.hustlePartner || searchCritera.hustlePartner === HustlePartner.Dave;
}

function shouldSearchAppcastHustles(searchCritera: HustleSearchCriteria): boolean {
  return !searchCritera.hustlePartner || searchCritera.hustlePartner === HustlePartner.Appcast;
}

export async function searchHustles(
  searchCriteria: HustleSearchCriteria,
): Promise<HustleSearchResult> {
  let daveHustles: Hustle[] = [];
  const pageNumber: number = searchCriteria.page || 0;
  let totalPages: number = 0;
  if (shouldSearchDaveHustles(searchCriteria)) {
    daveHustles = await SideHustleDao.getActiveDaveHustles();
    daveHustles = filterHustlesBySearchCriteria(daveHustles, searchCriteria);
    if (daveHustles.length > 0) {
      totalPages = 1;
    }
  }
  let appcastHustles: Hustle[] = [];
  let message: string;
  if (shouldSearchAppcastHustles(searchCriteria)) {
    try {
      const appcastSearchResult = await AppcastProvider.searchHustles(searchCriteria);
      appcastHustles = appcastSearchResult.hustles;
      if (appcastSearchResult.totalPages > totalPages) {
        totalPages = appcastSearchResult.totalPages;
      }
    } catch (error) {
      if (error instanceof AppcastResponseError) {
        message =
          "Whoops, Dave wasn't able to load all the current job openings. Please try again in a few minutes.";
      }
    }
  }
  const response = { page: pageNumber, totalPages, hustles: [...daveHustles, ...appcastHustles] };
  return message ? { message, ...response } : response;
}

export async function getHustle(hustleId: string): Promise<Hustle> {
  const { partner, externalId } = validateAndDeconstructHustleId(hustleId);
  let hustle: Hustle;

  if (partner === HustlePartner.Appcast) {
    hustle = await getAppcastHustleOrThrow(externalId);
  } else if (partner === HustlePartner.Dave) {
    hustle = await getDaveHustleOrThrow(externalId);
  }
  return hustle;
}

async function getAppcastHustleOrThrow(externalId: string): Promise<Hustle> {
  let hustle: Hustle;
  try {
    hustle = await AppcastProvider.getHustle(externalId);
  } catch (error) {
    if (error.name === 'AppcastInvalidJobIdErrorError') {
      handleHustleNotFoundError(HustlePartner.Appcast, externalId);
    } else {
      metrics.increment(Metrics.HUSTLE_APPCAST_GET_HUSTLE_UNKNOWN_ERROR);
      logger.error('Unknown error occured fetching Appcast job by exernalId', {
        provider: HustlePartner.Appcast,
        externalId,
        error,
      });
      throw error;
    }
  }
  return hustle;
}

async function getDaveHustleOrThrow(externalId: string): Promise<Hustle> {
  const hustle = await SideHustleDao.getHustle(HustlePartner.Dave, externalId);
  if (!hustle) {
    handleHustleNotFoundError(HustlePartner.Dave, externalId);
  }
  return hustle;
}

function handleInvalidHustleIdError(hustleId: string) {
  metrics.increment(Metrics.HUSTLE_INVALID_HUSTLE_ID);
  logger.error('Invalid HustleId', { hustleId });
  throw new InvalidParametersError(InvalidParametersMessageKey.InvalidHustleId);
}

function handleHustleNotFoundError(partner: HustlePartner, externalId: string) {
  metrics.increment(Metrics.HUSTLE_EXTERNAL_ID_NOT_FOUND, { partner });
  logger.error('Hustle not found by externalId', { partner, externalId });
  throw new NotFoundError(NotFoundMessageKey.HustleExternalIdNotFound);
}

export async function saveHustle(userId: number, hustleId: string): Promise<Hustle[]> {
  const { partner, externalId } = validateAndDeconstructHustleId(hustleId);
  const sideHustleId = await SideHustleDao.getSideHustleId(partner, externalId);
  let appcastHustle: Hustle;
  if (!sideHustleId && partner === HustlePartner.Appcast) {
    appcastHustle = await getAppcastHustleOrThrow(externalId);
  } else if (!sideHustleId) {
    handleHustleNotFoundError(partner, externalId);
  }

  try {
    await SavedHustleDao.save({ userId, sideHustleId, appcastDataForCreate: appcastHustle });
  } catch (error) {
    metrics.increment(Metrics.HUSTLE_SAVE_FAILED);
    logger.error('Unexpected error occured while saving hustle', { userId, hustleId, error });
    throw error;
  }
  return getSavedHustles(userId);
}

function validateAndDeconstructHustleId(
  hustleId: string,
): { partner: HustlePartner; externalId: string } {
  const { partner, externalId } = deconstructJobId(hustleId);
  const validPartner = $enum(HustlePartner).asValueOrDefault(partner, null);
  if (!validPartner || !externalId) {
    handleInvalidHustleIdError(hustleId);
  }
  return { partner, externalId };
}

export async function unsaveHustle(userId: number, savedHustleId: string): Promise<Hustle[]> {
  const { partner, externalId } = validateAndDeconstructHustleId(savedHustleId);
  const sideHustleId = await SideHustleDao.getSideHustleId(partner, externalId, {
    includeExpired: true,
  });
  if (!sideHustleId) {
    handleHustleNotFoundError(partner, externalId);
  }

  try {
    await SavedHustleDao.unsave({ sideHustleId, userId });
  } catch (error) {
    metrics.increment(Metrics.HUSTLE_UNSAVE_FAILED);
    logger.error('Unexpected error occured while unsaving hustle', { savedHustleId, error });
    throw error;
  }
  return getSavedHustles(userId);
}

export async function getSavedHustles(userId: number): Promise<Hustle[]> {
  try {
    return await SavedHustleDao.getHustlesForUser(userId);
  } catch (error) {
    metrics.increment(Metrics.HUSTLE_GET_SAVED_HUSTLES_FAILED);
    logger.error('Unexpected error occured while getting saved hustles', { userId, error });
    throw error;
  }
}

export async function getCategories(): Promise<HustleCategoryConfig[]> {
  return await CategoryDao.getCategories();
}

export async function getJobPacks(): Promise<HustleJobPack[]> {
  return await JobPackDao.findAll();
}
