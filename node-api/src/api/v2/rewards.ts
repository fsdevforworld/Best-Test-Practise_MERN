import { Request, Response } from 'express';
import { IDaveRequest, IDaveResponse } from '../../typings';
import { dogstatsd } from '../../lib/datadog-statsd';
import {
  fetchEmpyrAuth,
  fetchEmpyrEvents,
  fetchOffers,
  saveEmpyrEvent,
  deleteEmpyrCard,
  linkOfferToUser,
} from '../../domain/rewards';
import { NotFoundError, EmpyrError, InvalidParametersError } from '../../lib/error';
import { minVersionCheckFromRequest } from '../../lib/utils';
import { ExternalEvent, FailureMessageKey } from '../../translations';
import {
  OffersPayload,
  RewardTransactionsResponse,
  StandardResponse,
} from '@dave-inc/wire-typings';

// Minimum version of the app supporting click to activate
const MIN_CTA_VERSION = '2.7.10';

export async function getOffers(req: IDaveRequest, res: IDaveResponse<OffersPayload>) {
  try {
    const supportClickToActivate = minVersionCheckFromRequest(req, MIN_CTA_VERSION);
    const result = await fetchOffers(
      req.user.id,
      req.query.location || req.query.zip, // Make this backward compatible, can be removed once the front end is deployed
      req.query.searchLatitude,
      req.query.searchLongitude,
      req.query.userLatitude,
      req.query.userLongitude,
      req.query.category,
      req.query.distance,
      supportClickToActivate,
    );

    dogstatsd.increment('empyr.fetch_offers_request_success');

    res.json(result);
  } catch (ex) {
    dogstatsd.increment('empyr.fetch_offers_request_fail');
    throw new NotFoundError(ExternalEvent.EmpyrOfferFetch, { data: { ex } });
  }
}

export async function getAuth(req: IDaveRequest, res: Response) {
  try {
    const result = await fetchEmpyrAuth(req.user.id);

    dogstatsd.increment('empyr.auth_token_request_success');

    res.json(result);
  } catch (ex) {
    dogstatsd.increment('empyr.auth_token_request_fail');
    throw new NotFoundError(ExternalEvent.EmpyrTokenFetch, { data: { ex } });
  }
}

export async function create(req: Request, res: Response) {
  try {
    const result = await saveEmpyrEvent(req.body);

    dogstatsd.increment('empyr.save_empyr_event_success');

    res.json(result);
  } catch (ex) {
    dogstatsd.increment('empyr.save_empyr_event_fail');

    throw new EmpyrError(ExternalEvent.EmpyrEventSave, {
      data: { ex },
    });
  }
}

export async function deleteCard(req: IDaveRequest, res: IDaveResponse<StandardResponse>) {
  if (!req.body.paymentMethodId) {
    throw new InvalidParametersError(null, {
      required: ['paymentMethodId'],
      provided: Object.keys(req.body),
    });
  }

  try {
    await deleteEmpyrCard(req.user, req.body.paymentMethodId);

    dogstatsd.increment('empyr.unlink_empyr_card_success');
    res.send({ ok: true });
  } catch (ex) {
    dogstatsd.increment('empyr.unlink_empyr_card_fail');
    throw new EmpyrError(FailureMessageKey.EmpyrCardUnlink, { data: { ex } });
  }
}

export async function getRewardTransactions(
  req: IDaveRequest,
  res: IDaveResponse<RewardTransactionsResponse>,
) {
  try {
    const result = await fetchEmpyrEvents(req.user.id);

    dogstatsd.increment('empyr.fetch_empyr_events_request_success');

    return res.json(result);
  } catch (ex) {
    dogstatsd.increment('empyr.fetch_empyr_events_request_fail');
    throw new NotFoundError(ExternalEvent.EmpyrEventFetch, { data: { ex } });
  }
}

export async function linkOffer(req: IDaveRequest, res: IDaveResponse<StandardResponse>) {
  try {
    await linkOfferToUser(req.params.id, req.user.id);

    dogstatsd.increment('empyr.link_empyr_offer_success');
    res.send({ ok: true });
  } catch (ex) {
    dogstatsd.increment('empyr.link_empyr_offer_fail');
    throw new EmpyrError(FailureMessageKey.UserOfferLink, { data: { ex } });
  }
}
