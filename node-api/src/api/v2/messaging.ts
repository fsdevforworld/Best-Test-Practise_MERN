import { InvalidParametersError } from '../../lib/error';

// tslint:disable-next-line:no-require-imports
import Twilio = require('twilio');
import braze from '../../lib/braze';
import { User } from '../../models';
import { wrapMetrics } from '../../lib/datadog-statsd';
import { toE164 } from '../../lib/utils';
import { Request, Response } from 'express';
import { IDaveResponse } from '../../typings';
import getClient from '../../domain/bank-of-dave-internal-api';
import logger from '../../lib/logger';
const { VoiceResponse, MessagingResponse } = Twilio.twiml;

export enum Metric {
  userNotFound = 'incoming_message.user_not_found',
  requestReceived = 'incoming_message.request_received',
  handledByBank = 'incoming_message.handled_by_bank',
}
export const metrics = wrapMetrics<Metric>();

export const daveBankingClient = getClient();

async function incoming(req: Request, res: IDaveResponse<string>): Promise<Response> {
  const sendIncomingTextResponse = getTextSender(res);
  const message = req.body.Body;
  const intent = getIntent(message);
  const fromNumber = toE164(req.body.From);

  const loggerInfo = { message, intent, from: req.body.From, fromNumber };
  logger.info('Incoming SMS message', loggerInfo);

  if (!message) {
    throw new InvalidParametersError(null, { required: ['Body'] });
  }

  metrics.increment(Metric.requestReceived, { intent });
  const user: User = await User.findOneByPhoneNumber(fromNumber, false);

  if (!user) {
    metrics.increment(Metric.userNotFound, { intent });
    logger.info('Incoming SMS message - user not found', loggerInfo);
    return sendIncomingTextResponse(
      'Sorry, Dave ran into a snafu with your subscription. Please contact customer service.',
    );
  }

  const loggerInfoWithUserID = { ...loggerInfo, userId: user.id };
  if (intent === 'unsubscribe') {
    logger.info('Incoming SMS message - unsubsribe intent', loggerInfoWithUserID);
    await Promise.all([
      braze.track({ attributes: [{ externalId: `${user.id}`, subscribe: false }] }),
      user.update({ unsubscribed: true }),
    ]);
    return sendIncomingTextResponse(
      'You are unsubscribed from Dave overdraft alerts. No more messages will be sent. Get help at help.dave.com',
    );
  } else if (intent === 'subscribe') {
    logger.info('Incoming SMS message - subscribe intent', loggerInfoWithUserID);
    await Promise.all([
      braze.track({ attributes: [{ externalId: `${user.id}`, subscribe: true }] }),
      user.update({ unsubscribed: false }),
    ]);
    return sendIncomingTextResponse('You have resubscribed. Welcome back!');
  } else {
    logger.info('Incoming SMS message - unknown intent', loggerInfoWithUserID);
    // check with the bank to see if they're expecting a response for e.g. a fraud alert
    try {
      const {
        data: { isHandled },
      } = await daveBankingClient.incomingTextReceived(user.id, {
        message,
        fromNumber,
      });

      if (isHandled) {
        // bank handled it, we'll just tell Twilio to do nothing
        metrics.increment(Metric.handledByBank);
        return sendIncomingTextResponse();
      }
    } catch (error) {
      // if this fails, we'll let it use its standard fallback.  it doesn't need to be noisy
      logger.warn('Failed when checking if bank handled incoming message', { error });
    }

    return sendIncomingTextResponse(
      'Dave: Help at help.dave.com. Msg&data rates may apply. 1msg/request. Reply STOP to opt out of overdraft alerts.',
    );
  }
}

function voice(req: Request, res: IDaveResponse<string>): Response {
  const response = new VoiceResponse();
  response.play({}, 'https://www.dave.com/misc/call.mp3');
  return res.contentType('text/xml').send(response.toString());
}

// https://support.twilio.com/hc/en-us/articles/223134027-Twilio-support-for-opt-out-keywords-SMS-STOP-filtering-
// Cannot include yes, no within intent matching here since it needs to fall to Dave banking handler
type Intent = 'unsubscribe' | 'subscribe' | 'unknown';
function getIntent(body: string): Intent {
  const keyword = body.trim().toLocaleLowerCase();
  const unsubscribeKeywords = ['stop', 'stopall', 'unsubscribe', 'end', 'cancel', 'quit'];
  if (unsubscribeKeywords.includes(keyword)) {
    return 'unsubscribe';
  }
  const subscribeKeywords = ['start', 'unstop'];
  if (subscribeKeywords.includes(keyword)) {
    return 'subscribe';
  }
  return 'unknown';
}

function getTextSender(res: IDaveResponse<string>) {
  return (responseText?: string) => {
    const response = new MessagingResponse();
    if (responseText) {
      response.message(responseText);
    }
    return res.contentType('text/xml').send(response.toString());
  };
}

export default {
  incoming,
  voice,
};
