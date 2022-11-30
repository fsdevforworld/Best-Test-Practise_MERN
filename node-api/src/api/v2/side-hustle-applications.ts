import * as Bluebird from 'bluebird';
import { Response } from 'express';
import { SideHustleApplication, SideHustleJob } from '../../models';
import { Status } from '../../models/side-hustle-application';
import { sideHustleNotificationsTask } from '../../jobs/data';
import { IDaveRequest, IDaveResponse, AnalyticsEvent } from '../../typings';

import { InvalidParametersError } from '../../lib/error';
import logger from '../../lib/logger';
import { moment } from '@dave-inc/time-lib';
import braze from '../../lib/braze';
import amplitude from '../../lib/amplitude';
import { SideHustleApplicationResponse } from '@dave-inc/wire-typings';

async function get(
  req: IDaveRequest,
  res: IDaveResponse<SideHustleApplicationResponse[]>,
): Promise<Response> {
  const applications = await SideHustleApplication.findAll({
    include: [SideHustleJob],
    where: { userId: req.user.id },
  });

  return res.send(applications.map(application => application.serialize()));
}

async function upsert(
  req: IDaveRequest,
  res: IDaveResponse<SideHustleApplicationResponse[]>,
): Promise<Response> {
  const user = req.user;
  const userId = user.id;
  const { jobs }: { jobs: number[] } = req.body;

  if (!jobs || !jobs.length) {
    throw new InvalidParametersError(null, {
      required: ['jobs'],
      provided: Object.keys(req.body),
    });
  }

  const currentApplications = await SideHustleApplication.findAll({
    where: { userId: req.user.id },
  });

  const applications = jobs.map(
    (job: number): Bluebird<SideHustleApplication> => {
      const existingApplication = currentApplications.find(
        application => application.sideHustleJobId === job,
      );
      if (existingApplication) {
        return existingApplication.update({
          status: Status.REQUESTED,
          requested: moment(),
        });
      }
      return SideHustleApplication.create({
        userId,
        sideHustleJobId: job,
        status: Status.REQUESTED,
        requested: moment(),
      });
    },
  );

  const newApplications = await Bluebird.all<SideHustleApplication>(applications);

  const applicationIds = newApplications.map(application => application.id);

  const jobCompanies = await SideHustleJob.findAll({
    where: {
      id: jobs,
    },
  }).map(job => job.company);

  const brazeJobProperties = jobCompanies.reduce(
    (object: { [job: string]: boolean }, job: string) => {
      // Set each job as a separate property with a true value since Braze doesn't allow arrays
      object[job] = true;
      return object;
    },
    {},
  );

  const brazeEvent = {
    name: AnalyticsEvent.SideHustleApplicationsRequested,
    externalId: `${userId}`,
    properties: brazeJobProperties,
    time: moment(),
  };

  const amplitudeEvent = {
    eventType: AnalyticsEvent.SideHustleApplicationsRequested,
    userId,
    eventProperties: {
      jobs: jobCompanies,
    },
  };

  try {
    await Promise.all([braze.track({ events: [brazeEvent] }), amplitude.track(amplitudeEvent)]);
  } catch (error) {
    logger.error(`Error sending ${AnalyticsEvent.SideHustleApplicationsRequested} event`, {
      error,
    });
  }

  await sideHustleNotificationsTask({ applicationIds, userId });

  return get(req, res);
}

export default { get, upsert };
