import { chunk, isNil, omitBy } from 'lodash';
import { Response } from 'express';
import { Incident, UserIncident } from '../../../models';
import { IDashboardApiRequest } from '../../../typings';

import { getParams } from '../../../lib/utils';
import { AlreadyExistsError, NotFoundError, UnprocessableEntityError } from '../../../lib/error';
import { moment } from '@dave-inc/time-lib';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { ConstraintMessageKey, InvalidParametersMessageKey } from '../../../translations';

const USER_INCIDENT_BULK_SIZE = 100;

async function create(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const { title, description, isPublic = false } = getParams(
    req.body,
    ['title', 'description'],
    ['isPublic'],
  );

  const existingIncident = await Incident.scope('active').findOne({
    where: {
      title,
      description,
    },
  });

  if (existingIncident) {
    dogstatsd.increment('incident.create_failed', { reason: 'already_exists' });
    throw new AlreadyExistsError(InvalidParametersMessageKey.IncidentTitleAndDescriptionUniqueness);
  }

  const incident = await Incident.create({
    creatorId: req.internalUser.id,
    title,
    description,
    isPublic,
  });
  dogstatsd.increment('incident.create_success');

  return res.send(incident);
}

async function createForUsers(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const { userIds } = getParams(req.body, ['userIds']);
  const listOfUserIds = userIds.split(',');
  const incidentId = req.params.id;

  const incident = await Incident.findByPk(incidentId);

  if (!incident) {
    dogstatsd.increment('incident.bulk_create_failed', { reason: 'does_not_exist' });
    throw new NotFoundError(InvalidParametersMessageKey.IncidentDoesNotExist);
  }

  if (incident.isPublic) {
    dogstatsd.increment('incident.bulk_create_failed', { reason: 'not_private_incident' });
    throw new UnprocessableEntityError(ConstraintMessageKey.UserPublicIncident);
  }

  for (const userIdChunks of chunk(listOfUserIds, USER_INCIDENT_BULK_SIZE)) {
    const userIncidents = await Promise.all(
      userIdChunks.map(async userId => ({ incidentId, userId })),
    );
    await UserIncident.bulkCreate(userIncidents, {
      fields: ['incidentId', 'userId'],
      ignoreDuplicates: true,
    });
  }

  return res.status(201).send();
}

async function update(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const { title, description, resolved } = getParams(
    req.body,
    [],
    ['title', 'description', 'resolved'],
  );
  const incident = await Incident.findByPk(req.params.id);

  if (!incident) {
    dogstatsd.increment('incident.update_failed', { reason: 'does_not_exist' });
    throw new NotFoundError("Incident couldn't be updated because it does not exist.");
  }

  if (incident.resolvedAt) {
    dogstatsd.increment('incident.update_failed', { reason: 'already_resolved' });
    throw new UnprocessableEntityError(InvalidParametersMessageKey.IncidentAlreadyResolved);
  }

  const payload = omitBy(
    {
      title,
      description,
      resolvedAt: resolved ? moment() : null,
      resolverId: resolved ? req.internalUser.id : null,
    },
    isNil,
  );

  await incident.update(payload);
  dogstatsd.increment('incident.update_success');

  return res.send(incident);
}

async function deleteIncident(req: IDashboardApiRequest, res: Response): Promise<Response> {
  const incident = await Incident.findByPk(req.params.id);
  if (!incident) {
    dogstatsd.increment('incident.delete_failed', { reason: 'does_not_exist' });
    throw new NotFoundError(InvalidParametersMessageKey.IncidentNotDeletableNotFound);
  }

  if (incident.resolvedAt) {
    dogstatsd.increment('incident.delete_failed', { reason: 'resolved' });
    throw new UnprocessableEntityError(
      InvalidParametersMessageKey.IncidentNotDeletableAlreadyResolved,
    );
  }

  await incident.destroy();
  dogstatsd.increment('incident.delete_success');

  return res.send();
}

export default {
  create,
  update,
  deleteIncident,
  createForUsers,
};
