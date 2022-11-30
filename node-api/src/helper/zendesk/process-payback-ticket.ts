import * as Notification from '../../domain/notifications';
import { Advance } from '../../models';
import { ZendeskTicket, AnalyticsEvent } from '../../typings';
import {
  ZENDESK_CUSTOM_FIELD_ID,
  ZENDESK_USER_SUBMITTED_REASONS,
  ZENDESK_BUCKETS,
  ZENDESK_TAGS,
} from '../../lib/zendesk/constants';
import getCustomFieldValue from '../../helper/zendesk/get-custom-field-value';
import zendesk from '../../lib/zendesk';
import amplitude from '../../lib/amplitude';
import { Op } from 'sequelize';

function hasTicketBeenAutorepliedto(zTicket: ZendeskTicket) {
  return zTicket.tags.includes('autorepliedto');
}

function isTicketReasonForPayback(zTicket: ZendeskTicket) {
  const userSubmittedReason = getCustomFieldValue(
    zTicket,
    ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON,
  );

  return (
    userSubmittedReason ===
    ZENDESK_USER_SUBMITTED_REASONS.BILLING_OR_PAYING_IT_BACK_PAY_WITH_DIFFERENT_CARD_OR_ACCOUNT
  );
}

export default async function processPaybackTicket(userId: number, zTicket: ZendeskTicket) {
  if (isTicketReasonForPayback(zTicket) && !hasTicketBeenAutorepliedto(zTicket)) {
    const advance = await Advance.findOne({
      where: {
        userId,
        outstanding: { [Op.gt]: 0 },
      },
      order: [['paybackDate', 'ASC']],
    });

    if (advance) {
      await Notification.sendAdvancePaymentForm(advance);

      await zendesk.update('tickets', zTicket.id, {
        ticket: {
          custom_fields: [
            {
              id: ZENDESK_CUSTOM_FIELD_ID.BUCKET,
              value: ZENDESK_BUCKETS.BILLING_EXPLANATION,
            },
          ],
          tags: [...zTicket.tags, ZENDESK_TAGS.AUTOREPLIEDTO, ZENDESK_TAGS.NOTRIGGER],
          status: 'solved',
        },
      });

      await amplitude.track({
        userId,
        eventType: AnalyticsEvent.AutoSentPaybackForm,
      });
    }
  }
}
