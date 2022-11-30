import {
  DEFAULT_REASONS_CATEGORY,
  HelpCenter,
  TicketReason,
  UserTicketReasonsResponse,
} from '@dave-inc/wire-typings';
import * as config from 'config';
import ErrorHelper from '@dave-inc/error-helper';
import { groupBy } from 'lodash';
import * as mimeTypes from 'mimetypes';
import * as uuid from 'uuid/v4';

import { dogstatsd } from '../../../lib/datadog-statsd';
import { getBase64ImageMime } from '../../../lib/gcloud-storage';
import { ZendeskError } from '../../../lib/error';
import logger from '../../../lib/logger';
import redisClient from '../../../lib/redis';
import zendesk, { UserReason, ZENDESK_TICKET_BRANDS } from '../../../lib/zendesk';

import { User } from '../../../models';
import { ThirdPartySupportTicketError } from '../../../translations';

const PHONE_NUMBER_FIELD_ID = config.get<number>('zendesk.customTicketFields.phoneNumber');
const USER_SUBMITTED_REASON_FIELD_ID = config.get<number>(
  'zendesk.customTicketFields.userSubmittedReason',
);
const BANKING_USER_SUBMITTED_REASON_FIELD_ID = config.get<number>(
  'zendesk.customTicketFields.bankingUserSubmittedReason',
);
const DAVE_USER_ID_FIELD_ID = config.get<number>('zendesk.customTicketFields.daveUserId');
const DAVE_MEMBER_TYPE_FIELD_ID = config.get<number>('zendesk.customTicketFields.daveMemberType');
const DAVE_BANKING_BRAND_ID = config.get<number>('zendesk.brands.daveBanking');
const DAVE_BRAND_ID = config.get<number>('zendesk.brands.dave');

async function uploadFilesToZendesk(files: Express.Multer.File[]): Promise<string> {
  const mimesBuffers: Array<[string, Buffer]> = new Array<[string, Buffer]>();
  for (const file of files) {
    const buffer = file.buffer;
    const mimetype = file.mimetype;
    mimesBuffers.push([mimetype, buffer]);
  }
  return uploadAttachmentsToZendesk(mimesBuffers);
}

async function uploadBase64sToZendesk(filesContent: string[]): Promise<string> {
  const mimesBuffers: Array<[string, Buffer]> = new Array<[string, Buffer]>();
  for (const content of filesContent) {
    const mimetype = getBase64ImageMime(content);
    const base64EncodedImageString = content.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64EncodedImageString, 'base64');
    mimesBuffers.push([mimetype, buffer]);
  }
  return uploadAttachmentsToZendesk(mimesBuffers);
}

async function uploadAttachmentsToZendesk(mimesBuffers: Array<[string, Buffer]>): Promise<string> {
  const filesToUpload: Map<string, Buffer> = new Map<string, Buffer>();
  for (const mimeBuffer of mimesBuffers) {
    const mimetype = mimeBuffer[0];
    const buffer = mimeBuffer[1];
    const filename = `${uuid()}.${mimeTypes.detectExtension(mimetype)}`;
    filesToUpload.set(filename, buffer);
  }
  return zendesk.uploadFiles(filesToUpload);
}

function getZDTicketCustomFieldsAndBrandId(
  user: User,
  brand: ZENDESK_TICKET_BRANDS,
  reason: string,
  memberType: string,
): [Array<[number, any]>, number] {
  const customFields: Array<[number, any]> = [];

  const phoneNumber = user.phoneNumber;
  customFields.push([PHONE_NUMBER_FIELD_ID, phoneNumber]);

  let brandId = DAVE_BRAND_ID;
  let reasonFieldId = USER_SUBMITTED_REASON_FIELD_ID;
  if (brand === ZENDESK_TICKET_BRANDS.DAVE_BANKING) {
    brandId = DAVE_BANKING_BRAND_ID;
    reasonFieldId = BANKING_USER_SUBMITTED_REASON_FIELD_ID;
  }
  customFields.push([reasonFieldId, reason]);
  customFields.push([DAVE_USER_ID_FIELD_ID, user.id.toString()]);
  customFields.push([DAVE_MEMBER_TYPE_FIELD_ID, memberType]);
  return [customFields, brandId];
}

export async function createZendeskTicket(
  user: User,
  reason: string,
  description: string,
  memberType: string,
  brand: ZENDESK_TICKET_BRANDS,
  subject: string,
  uploadFiles: Express.Multer.File[],
  uploadBase64s: string[],
): Promise<number> {
  let attachmentToken: string;
  try {
    if (uploadFiles?.length) {
      attachmentToken = await uploadFilesToZendesk(uploadFiles);
    } else if (uploadBase64s?.length) {
      attachmentToken = await uploadBase64sToZendesk(uploadBase64s);
    }
  } catch (err) {
    dogstatsd.increment('help.ticket.attachment.upload.failed', { type: err.type });
    const formattedError = ErrorHelper.logFormat(err);
    logger.error(
      'zendesk: encountered error uploading attachments when creating ticket, continuing on without attachments',
      formattedError,
    );
  }

  const zendeskUserId = await getUserId(user);

  const customFieldsAndBrandId = getZDTicketCustomFieldsAndBrandId(user, brand, reason, memberType);
  const customFields = customFieldsAndBrandId[0];
  const brandId = customFieldsAndBrandId[1];

  let zendeskTicketId: number;
  try {
    zendeskTicketId = await zendesk.createTicket(
      zendeskUserId,
      brandId,
      subject,
      description,
      customFields,
      attachmentToken,
    );
  } catch (err) {
    dogstatsd.increment('help.ticket.create.failed', { type: err.type });
    throw err;
  }
  dogstatsd.increment('help.ticket.create.success');
  return zendeskTicketId;
}

export async function getUserTicketReasons(user: User): Promise<UserTicketReasonsResponse> {
  try {
    const [daveReasonsResponse, daveBankingReasonsResponse] = await Promise.all([
      zendesk.listTicketFieldOptions(USER_SUBMITTED_REASON_FIELD_ID),
      zendesk.listTicketFieldOptions(BANKING_USER_SUBMITTED_REASON_FIELD_ID),
    ]);
    const hasDaveBanking = await user.hasDaveBanking();
    const reasons = {
      dave: formatReasons(daveReasonsResponse.body.custom_field_options),
      daveBanking: hasDaveBanking
        ? formatReasons(daveBankingReasonsResponse.body.custom_field_options)
        : {},
    };

    return reasons;
  } catch (error) {
    dogstatsd.increment('zendesk.get_user_ticket_reasons.failed');
    logger.error('zendesk: failed to fetch user reasons for creating ticket', { error });
    throw new ZendeskError(ThirdPartySupportTicketError.ThirdPartySupportTicketUserReasonsFailure);
  }
}

export async function getUserId(user: User) {
  try {
    return zendesk.createOrUpdateZendeskEndUser(user).catch(_ => zendesk.searchUser(user));
  } catch (err) {
    dogstatsd.increment('help.ticket.user.createOrUpdate.failed', { type: err.type });
    throw err;
  }
}

function formatReasons(userReasons: UserReason[]) {
  const reasons = userReasons.map((userReason: UserReason) => {
    const { name, value } = userReason;
    const nameChunks = name.split('::');
    const hasCategoryInName = nameChunks.length >= 2; // Is it in Category::Name format
    const category = hasCategoryInName ? nameChunks[0] : DEFAULT_REASONS_CATEGORY;
    const reasonName = hasCategoryInName ? nameChunks[nameChunks.length - 1] : nameChunks[0];
    return {
      category,
      name: reasonName,
      value,
    };
  });

  const sortedReasons = sortReasons(reasons);

  const groupedReasons = groupBy(sortedReasons, 'category');
  for (const reasonsArray of Object.values(groupedReasons)) {
    reasonsArray.forEach(reason => {
      delete reason.category;
    });
  }
  return groupedReasons;
}

function sortReasons(reasons: Array<TicketReason & { category: string }>) {
  return reasons.sort((reasonA, reasonB) => {
    const categoryA = reasonA.category;
    const categoryB = reasonB.category;

    // Always want General category to be first
    if (categoryA === categoryB) {
      return 0;
    } else if (categoryA === DEFAULT_REASONS_CATEGORY) {
      return -1;
    } else if (categoryB === DEFAULT_REASONS_CATEGORY) {
      return 1;
    } else if (categoryA.toUpperCase() < categoryB.toUpperCase()) {
      return -1;
    } else {
      // categoryA > categoryB
      return 1;
    }
  });
}

export async function getHelpCenterArticles(redisKey: string): Promise<HelpCenter> {
  const helpCenterString = (await redisClient.getAsync(redisKey)) || '{}';
  return JSON.parse(helpCenterString) as HelpCenter;
}
