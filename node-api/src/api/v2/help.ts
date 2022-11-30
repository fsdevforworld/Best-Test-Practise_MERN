import {
  HelpCenter,
  HelpCenterArticle,
  HelpTopicResponse,
  UserTicketReasonsResponse,
} from '@dave-inc/wire-typings';
import { Response } from 'express';

import * as config from 'config';
import { IDaveRequest } from '../../typings';
import redisClient from '../../lib/redis';
import { IDaveResponse } from '../../typings';
import {
  ZENDESK_ARTICLE_VOTE_DIRECTION,
  ZENDESK_MAX_ATTACHMENTS,
  zendeskTicketBrandValues,
} from '../../lib/zendesk/constants';
import { deepTrim, getParams, shallowMungeObjToCase } from '../../lib/utils';
import zendesk from '../../lib/zendesk';
import { InvalidParametersError } from '../../lib/error';
import { dogstatsd } from '../../lib/datadog-statsd';
import { ThirdPartySupportTicketError } from '../../translations';
import * as HelpController from './help/controller';

const liveChatRedisKey = config.get<string>('liveChat.agentCountRedisKey');
const overdraftHelpCenterRedisKey = config.get<string>('helpCenter.overdraftRedisKey');

function topics(req: IDaveRequest, res: IDaveResponse<HelpTopicResponse[]>) {
  // Will be replaced with a redirect to a CMS in the near future.
  res.send([
    {
      question: "Where's my money?",
      answer: `Dave offers 2 delivery options:

* Standard delivers within 3 business days
* Express delivers within hours

**Still not seeing funds?**

If your selected delivery time has passed and you still don’t see the funds, please check in with your bank directly as the funds may be available but not posted by the bank.
`,
    },
    /*{
      question: 'Why can’t I get a regular advance?',
      answer: `In order to qualify for up to $75, you’ll need to meet all of these requirements in the same regular checking account:

* Regular direct deposits from the same employer for 3 or more pay periods
* Direct deposits over $200 in your  regular checking account
* More than 60 days of transactional history in your connected account
* Must be within 11 days of your next direct deposit
* Balance must healthier than -$75
* Must maintain a balance of $115 (or more) on pay day

_Please note that Dave is unable to advance to prepaid, savings, and corporate accounts._
`,
    },*/
    {
      question: 'Why am I approved for $15 (or less)?',
      answer: `If you're not automatically qualified for a larger advance - great news! Dave is now able to offer smaller advances to our friends who aren’t eligible for a larger amount.

The amount we're able to advance depends on the health and balance of your bank account over the last 30 days.

**Please note that smaller advances are scheduled to be paid back on the following Friday, which may not coincide with your next pay date.**
`,
    },
    {
      question: 'Why am I being charged $1/month?',
      answer: `The $1 is monthly membership fee that allows us to provide Dave's services, such as the predictions and texts, as well as the bank account balances and updates, which are all small fees we accumulate while servicing your account.

**Seeing more than one charge this month?**

Follow these steps to check out your previous subscription charges:

* Click on your **Profile**
* Click **Dave Membership**
`,
    },
    {
      question: 'Can I change my payback date?',
      answer: `Your payback date is locked in once you confirm your advance in app.

**Don’t have enough funds?**

Never fear! Dave always checks your balance before attempting a withdrawal. If full funds are not available a partial payment may be made based on your balance.
`,
    },
  ]);
}

async function chatAgentCount(
  req: IDaveRequest,
  res: IDaveResponse<{ agentCount: number }>,
): Promise<Response> {
  const agentCount = (await redisClient.getAsync(liveChatRedisKey)) || '0';

  return res.send({ agentCount: parseInt(agentCount, 10) });
}

async function getUserTicketReasons(
  req: IDaveRequest,
  res: IDaveResponse<UserTicketReasonsResponse>,
): Promise<Response> {
  const reasons = await HelpController.getUserTicketReasons(req.user);
  return res.send(reasons);
}

async function helpCenter(
  redisKey: string,
  req: IDaveRequest,
  res: IDaveResponse<HelpCenter>,
): Promise<Response> {
  const helpCenterArticles = await HelpController.getHelpCenterArticles(redisKey);
  return res.send(helpCenterArticles);
}

async function helpCenterArticle(
  req: IDaveRequest,
  res: IDaveResponse<HelpCenterArticle | { title: string; body: string }>,
): Promise<Response> {
  const helpCenterString = (await redisClient.getAsync(overdraftHelpCenterRedisKey)) || '{}';

  const articleId = parseInt(req.params.id, 10);
  const { articles } = JSON.parse(helpCenterString);
  const article = articles.find((a: HelpCenterArticle) => a.id === articleId);

  if (article) {
    return res.send(article);
  }
  return res.send({ title: 'Article Not Found', body: '' });
}

async function voteArticleUpOrDown(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean }>,
): Promise<Response> {
  const articleId = parseInt(req.params.id, 10);
  let { direction } = deepTrim(
    shallowMungeObjToCase(getParams(req.body, ['direction']), 'camelCase'),
  );
  direction = direction.toLowerCase();
  if (
    ![ZENDESK_ARTICLE_VOTE_DIRECTION.UP, ZENDESK_ARTICLE_VOTE_DIRECTION.DOWN].includes(direction)
  ) {
    throw new InvalidParametersError('You can only vote help articles "up" or "down"');
  }
  const voteDirection =
    direction === ZENDESK_ARTICLE_VOTE_DIRECTION.UP
      ? ZENDESK_ARTICLE_VOTE_DIRECTION.UP
      : ZENDESK_ARTICLE_VOTE_DIRECTION.DOWN;
  const success = await zendesk.voteArticleUpOrDown(articleId, voteDirection);
  return res.send({ success });
}

async function createHelpRequest(
  req: IDaveRequest,
  res: IDaveResponse<{ success: boolean }>,
): Promise<Response> {
  const { reason, description, memberType, brand, subject } = deepTrim(
    shallowMungeObjToCase(
      getParams(req.body, ['reason', 'description', 'memberType', 'brand', 'subject']),
      'camelCase',
    ),
  );

  const zendeskBrand = zendeskTicketBrandValues[brand];
  if (!zendeskBrand) {
    dogstatsd.increment('help.ticket.invalid.brand');
    throw new InvalidParametersError(
      ThirdPartySupportTicketError.ThirdPartySupportTicketInvalidBrand,
    );
  }

  const uploadFiles = req.files as Express.Multer.File[];
  const uploadBase64s = req.body.filesContent as string[];
  if (
    uploadFiles?.length > ZENDESK_MAX_ATTACHMENTS ||
    uploadBase64s?.length > ZENDESK_MAX_ATTACHMENTS
  ) {
    dogstatsd.increment('help.ticket.attachment.toomany');
    throw new InvalidParametersError(
      ThirdPartySupportTicketError.ThirdPartySupportTicketTooManyAttachments,
    );
  }
  const user = req.user;
  await HelpController.createZendeskTicket(
    user,
    reason,
    description,
    memberType,
    zendeskBrand,
    subject,
    uploadFiles,
    uploadBase64s,
  );
  return res.send();
}

export default {
  chatAgentCount,
  createHelpRequest,
  getUserTicketReasons,
  helpCenter,
  helpCenterArticle,
  topics,
  voteArticleUpOrDown,
};
