import { clean } from '../../test-helpers';
import { expect } from 'chai';
import * as sinon from 'sinon';
import Zendesk from '../../../src/lib/zendesk';
import {
  ZENDESK_BUCKETS,
  ZENDESK_CUSTOM_FIELD_ID,
  ZENDESK_TAGS,
  ZENDESK_USER_SUBMITTED_REASONS,
} from '../../../src/lib/zendesk/constants';
import { ZendeskTicket } from '../../../src/typings/zendesk';
import factory from '../../factories';
import braze from '../../../src/lib/braze';
import amplitude from '../../../src/lib/amplitude';
import { moment } from '@dave-inc/time-lib';
import processPaybackTicket from '../../../src/helper/zendesk/process-payback-ticket';
import * as Notification from '../../../src/domain/notifications';
import { User } from '../../../src/models';
import { AnalyticsEvent } from '../../../src/typings';

describe('Zendesk Payback Ticket Helper Functions', () => {
  const sandbox = sinon.createSandbox();

  let zendeskUpdateStub: sinon.SinonStub;
  let brazeTrackStub: sinon.SinonStub;
  let brazeTriggerCampaignStub: sinon.SinonStub;
  let zTicket: ZendeskTicket;
  let user: User;

  before(() => clean());

  beforeEach(async () => {
    zendeskUpdateStub = sandbox.stub(Zendesk, 'update');
    brazeTrackStub = sandbox.stub(braze, 'track');
    brazeTriggerCampaignStub = sandbox.stub(braze, 'triggerCampaign');

    user = await factory.create('user');

    zTicket = {
      id: 123,
      created_at: '2009-07-20T22:55:29Z',
      custom_fields: [
        {
          id: ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON,
          value:
            ZENDESK_USER_SUBMITTED_REASONS.BILLING_OR_PAYING_IT_BACK_PAY_WITH_DIFFERENT_CARD_OR_ACCOUNT,
        },
      ],
      tags: ['something random'],
    } as ZendeskTicket;
  });

  afterEach(() => clean(sandbox));

  describe('processPaybackTicket', () => {
    it('should send payback form email to user and update ticket when reason is to pay back with different card/account', async () => {
      const amplitudeStub = sandbox.stub(amplitude, 'track');
      await factory.create('advance', { userId: user.id });

      await processPaybackTicket(user.id, zTicket);

      expect(zendeskUpdateStub.getCall(0).args).to.eql([
        'tickets',
        123,
        {
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
        },
      ]);

      expect(amplitudeStub.getCall(1).args[0]).to.eql({
        userId: user.id,
        eventType: AnalyticsEvent.AutoSentPaybackForm,
      });
      expect(brazeTrackStub).to.have.callCount(1);
      expect(brazeTriggerCampaignStub).to.have.callCount(1);
    });

    it('should send payback form email for the oldest unpaid advance', async () => {
      const sendAdvancePaymentFormStub = sandbox.stub(Notification, 'sendAdvancePaymentForm');

      const oldestAdvance = await factory.create('advance', {
        userId: user.id,
        createdDate: moment().subtract(60, 'days'),
        paybackDate: moment().subtract(45, 'days'),
      });

      await factory.create('advance', {
        userId: user.id,
        createdDate: moment().subtract(30, 'days'),
        paybackDate: moment().subtract(15, 'days'),
      });

      await factory.create('advance', {
        userId: user.id,
        createdDate: moment().subtract(13, 'days'),
        paybackDate: moment().subtract(5, 'days'),
      });

      await processPaybackTicket(user.id, zTicket);

      const [advanceArgInCall] = sendAdvancePaymentFormStub.getCall(0).args;
      expect(advanceArgInCall.id).to.equal(oldestAdvance.id);
    });

    context('when not to send payback form email or update the zendesk ticket', () => {
      it('if the user submitted reason is not to pay back with a different card', async () => {
        zTicket.custom_fields = [
          {
            id: ZENDESK_CUSTOM_FIELD_ID.USER_SUBMITTED_REASON,
            value: ZENDESK_USER_SUBMITTED_REASONS.BORROWING_MONEY_CANT_SET_INCOME,
          },
        ];

        await processPaybackTicket(user.id, zTicket);

        expect(brazeTrackStub).to.have.callCount(0);
        expect(brazeTriggerCampaignStub).to.have.callCount(0);
        expect(zendeskUpdateStub).to.have.callCount(0);
      });

      it('if the ticket already has an "autorepliedto" tag', async () => {
        zTicket.tags = [ZENDESK_TAGS.AUTOREPLIEDTO];

        await processPaybackTicket(user.id, zTicket);

        expect(brazeTrackStub).to.have.callCount(0);
        expect(brazeTriggerCampaignStub).to.have.callCount(0);
        expect(zendeskUpdateStub).to.have.callCount(0);
      });

      it('if no advance is found', async () => {
        await processPaybackTicket(user.id, zTicket);

        expect(brazeTrackStub).to.have.callCount(0);
        expect(brazeTriggerCampaignStub).to.have.callCount(0);
        expect(zendeskUpdateStub).to.have.callCount(0);
      });

      it('if no unpaid advance is found', async () => {
        await factory.create('advance', {
          userId: user.id,
          outstanding: 0,
        });

        await processPaybackTicket(user.id, zTicket);

        expect(brazeTrackStub).to.have.callCount(0);
        expect(brazeTriggerCampaignStub).to.have.callCount(0);
        expect(zendeskUpdateStub).to.have.callCount(0);
      });
    });
  });
});
