import { SideHustleJob } from '../../../../models';
import { SideHustleJobResponse } from '@dave-inc/wire-typings';
import appcast from '../../../../lib/appcast';
import { AppcastJob } from '../../../../lib/appcast/types';
import { User } from '../../../../models';
import { validateParams } from './validator';
import {
  SIDE_HUSTLE_JOB_SORT_RANDOM,
  SIDE_HUSTLE_JOB_SORT_ALPHA,
  SIDE_HUSTLE_JOB_SORT_COST_PER_APPLICATION,
  SIDE_HUSTLE_JOB_SORT_COST_PER_CLICK,
} from './constants';
import { shuffle } from 'lodash';

export async function getSideHustles(sortBy: string): Promise<SideHustleJobResponse[]> {
  // there will be no appcast jobs added to this table
  const jobRows = await SideHustleJob.findAll({
    where: {
      active: true,
    },
  });
  // doing the sorting here instead of mySQL for several reasons: need to sort by random, will be revisiting this for RAM-31 and RAM-32, RAM-31 will be adding a WHERE and more sorting work anyway
  const jobs = await Promise.all(jobRows.map(job => job.serialize()));
  return sortJobs(jobs, sortBy);
}

function costPerApplicationCmpDesc(a: SideHustleJobResponse, b: SideHustleJobResponse): number {
  // cpa sort desc, so flipping a and b
  return b.costPerApplication - a.costPerApplication;
}

function costPerClickCmpDesc(a: SideHustleJobResponse, b: SideHustleJobResponse): number {
  // cpc sort desc, so flipping a and b
  return b.costPerClick - a.costPerClick;
}

function nameCmp(a: SideHustleJobResponse, b: SideHustleJobResponse): number {
  return a.name.localeCompare(b.name);
}

function getSideHustleJobComparator(by: string) {
  switch (by) {
    case SIDE_HUSTLE_JOB_SORT_COST_PER_APPLICATION:
      return costPerApplicationCmpDesc;
    case SIDE_HUSTLE_JOB_SORT_COST_PER_CLICK:
      return costPerClickCmpDesc;
    case SIDE_HUSTLE_JOB_SORT_ALPHA:
    default:
      return nameCmp;
  }
}

function sortJobs(jobs: SideHustleJobResponse[], by: string) {
  if (by === SIDE_HUSTLE_JOB_SORT_RANDOM) {
    return shuffle(jobs);
  } else {
    const comparator = getSideHustleJobComparator(by);
    return jobs.sort(comparator);
  }
}

export function getAppcastJobs(
  searchParams: Map<string, string>,
  user: User,
): Promise<AppcastJob[]> {
  return appcast.legacySearchJobs(validateParams(searchParams, user));
}
