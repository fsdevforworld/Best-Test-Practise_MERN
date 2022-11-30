import { DEFAULT_REASONS_CATEGORY } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as config from 'config';
import factory from '../../../factories';
import { clean, replayHttp } from '../../../test-helpers';
import {
  getUserTicketReasons,
  getHelpCenterArticles,
  getUserId,
} from '../../../../src/api/v2/help/controller';
import { User } from '../../../../src/models';
import zendesk from '../../../../src/lib/zendesk';
import redisClient from '../../../../src/lib/redis';
import { dogstatsd } from '../../../../src/lib/datadog-statsd';
import { ZendeskError } from '../../../../src/lib/error';
import { ThirdPartySupportTicketError } from '../../../../src/translations';
import { defaultBankingHelpCenterData } from '../../../../bin/dev-seed/help-center';

const bankingHelpCenterRedisKey = config.get<string>('helpCenter.bankingRedisKey');

const USER_SUBMITTED_REASON_FIELD_ID = config.get<number>(
  'zendesk.customTicketFields.userSubmittedReason',
);
const BANKING_USER_SUBMITTED_REASON_FIELD_ID = config.get<number>(
  'zendesk.customTicketFields.bankingUserSubmittedReason',
);

describe('Help Controller', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('getUserTicketReasons', () => {
    context('dave user', () => {
      it(
        'should return user and bank user submitted reasons separated by category alphabeticaly except for General',
        replayHttp('help/controller/get-ticket-reasons-dave-user-success.json', async () => {
          const user = await factory.create<User>('user');
          const reasons = await getUserTicketReasons(user);
          const { daveBanking, dave } = reasons;

          // test that it was sorted
          const reasonsCategories = Object.keys(dave);
          expect(reasonsCategories.shift()).to.be.eq(DEFAULT_REASONS_CATEGORY);
          expect(reasonsCategories).to.be.eq(reasonsCategories.sort());
          expect(daveBanking).to.be.empty;

          // test formatting
          for (const reasonsArray of Object.values(dave)) {
            reasonsArray.forEach(reason => {
              expect(reason.name).to.not.match(/::/);
              expect(reason.value).to.exist;
            });
          }
        }),
      );

      it('should return no reasons back if reasons do not exist', async () => {
        sandbox
          .stub(zendesk, 'listTicketFieldOptions')
          .resolves({ body: { custom_field_options: [] } });
        const user = await factory.create<User>('user');
        const reasons = await getUserTicketReasons(user);
        const { daveBanking, dave } = reasons;

        expect(daveBanking).to.be.empty;
        expect(dave).to.be.empty;
      });

      it('should return no bank reasons back if only user reasons exist', async () => {
        sandbox
          .stub(zendesk, 'listTicketFieldOptions')
          .withArgs(USER_SUBMITTED_REASON_FIELD_ID)
          .resolves({
            body: { custom_field_options: [{ name: 'Category::Jeff Hacked My Account' }] },
          })
          .withArgs(BANKING_USER_SUBMITTED_REASON_FIELD_ID)
          .resolves({ body: { custom_field_options: [] } });
        const user = await factory.create<User>('user');
        const reasons = await getUserTicketReasons(user);
        const { daveBanking, dave } = reasons;

        expect(daveBanking).to.be.empty;
        expect(dave).to.not.be.empty;
      });
    });

    context('dave banking user', () => {
      it(
        'should return user and bank user submitted reasons separated by category alphabeticaly except for General',
        replayHttp(
          'help/controller/get-ticket-reasons-dave-banking-user-success.json',
          async () => {
            const user = await factory.create<User>('user');
            await factory.create('bank-of-dave-bank-connection', { userId: user.id });
            const reasons = await getUserTicketReasons(user);
            const { daveBanking, dave } = reasons;

            // test that it was sorted
            const bankingReasonsCategories = Object.keys(daveBanking);
            const reasonsCategories = Object.keys(dave);
            expect(bankingReasonsCategories.shift()).to.be.eq(DEFAULT_REASONS_CATEGORY);
            expect(reasonsCategories.shift()).to.be.eq(DEFAULT_REASONS_CATEGORY);
            expect(bankingReasonsCategories).to.be.eq(bankingReasonsCategories.sort());
            expect(reasonsCategories).to.be.eq(reasonsCategories.sort());

            // test formatting
            const combinedReasons = Object.values(daveBanking).concat(Object.values(dave));
            for (const reasonsArray of Object.values(combinedReasons)) {
              reasonsArray.forEach(reason => {
                expect(reason.name).to.not.match(/::/);
                expect(reason.value).to.exist;
              });
            }
          },
        ),
      );

      it('should return no reasons back if reasons do not exist', async () => {
        sandbox
          .stub(zendesk, 'listTicketFieldOptions')
          .resolves({ body: { custom_field_options: [] } });
        const user = await factory.create<User>('user');
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const reasons = await getUserTicketReasons(user);
        const { daveBanking, dave } = reasons;

        expect(daveBanking).to.be.empty;
        expect(dave).to.be.empty;
      });

      it('should return no bank reasons back if only user reasons exist', async () => {
        sandbox
          .stub(zendesk, 'listTicketFieldOptions')
          .withArgs(USER_SUBMITTED_REASON_FIELD_ID)
          .resolves({
            body: { custom_field_options: [{ name: 'Category::Jeff Hacked My Account' }] },
          })
          .withArgs(BANKING_USER_SUBMITTED_REASON_FIELD_ID)
          .resolves({ body: { custom_field_options: [] } });
        const user = await factory.create<User>('user');
        await factory.create('bank-of-dave-bank-connection', { userId: user.id });
        const reasons = await getUserTicketReasons(user);
        const { daveBanking, dave } = reasons;

        expect(daveBanking).to.be.empty;
        expect(dave).to.not.be.empty;
      });
    });

    it('should return alphabetically regardless of case', async () => {
      sandbox
        .stub(zendesk, 'listTicketFieldOptions')
        .withArgs(USER_SUBMITTED_REASON_FIELD_ID)
        .resolves({
          body: {
            custom_field_options: [
              { name: 'AFakeCategory::Jeff Hacked My Account' },
              { name: 'Account::Jeff Hacked My Account' },
            ],
          },
        })
        .withArgs(BANKING_USER_SUBMITTED_REASON_FIELD_ID)
        .resolves({ body: { custom_field_options: [] } });
      const user = await factory.create<User>('user');
      const reasons = await getUserTicketReasons(user);
      const { dave } = reasons;
      expect(dave).to.not.be.empty;
      expect(Object.keys(dave)).to.be.deep.eq(['Account', 'AFakeCategory']);
    });

    it('should throw a ZendeskError if the zendesk call errors out', async () => {
      sandbox.stub(zendesk, 'listTicketFieldOptions').throws(new Error());
      const dogstatsdSpy = sandbox.spy(dogstatsd, 'increment');
      const user = await factory.create<User>('user');
      await expect(getUserTicketReasons(user)).to.be.rejectedWith(
        ZendeskError,
        ThirdPartySupportTicketError.ThirdPartySupportTicketUserReasonsFailure,
      );
      sinon.assert.calledWith(dogstatsdSpy, 'zendesk.get_user_ticket_reasons.failed');
    });
  });

  describe('getHelpCenterArticles', () => {
    it('should return articles for a redisKey if it exists', async () => {
      redisClient.setAsync(bankingHelpCenterRedisKey, JSON.stringify(defaultBankingHelpCenterData));
      const helpCenterArticles = await getHelpCenterArticles(bankingHelpCenterRedisKey);
      expect(helpCenterArticles.articles.length).to.be.greaterThan(0);
      expect(helpCenterArticles.sections.length).to.be.greaterThan(0);
      expect(helpCenterArticles.topArticles.length).to.be.greaterThan(0);
      await redisClient.flushallAsync();
    });

    it('should return an empty object for a redisKey if it does not exist', async () => {
      const helpCenterArticles = await getHelpCenterArticles(bankingHelpCenterRedisKey);
      expect(helpCenterArticles.articles).to.be.undefined;
      expect(helpCenterArticles.sections).to.be.undefined;
      expect(helpCenterArticles.topArticles).to.be.undefined;
    });
  });

  describe('getUserId', () => {
    it(
      'should successfully create or update user',
      replayHttp('help/controller/post-users-create-or-update-succes.json', async () => {
        const result = await getUserId({
          email: 'dave@dave.com',
          firstName: 'Dave',
          lastName: 'DaBear',
          id: 1,
        } as User);
        expect(result).to.equal(415969825371);
      }),
    );

    it(
      'should fallback to find user if create or update fails',
      replayHttp(
        'help/controller/post-users-create-or-update-failure-and-search-success.json',
        async () => {
          const result = await getUserId({
            email: 'dave@dave.com',
            firstName: 'Dave',
            lastName: 'DaBear',
            id: 1,
          } as User);
          expect(result).to.equal(415969825371);
        },
      ),
    );

    it(
      'should throw expection if fails to update and search',
      replayHttp(
        'help/controller/post-users-create-or-update-failure-and-search-failure.json',
        async () => {
          expect(
            getUserId({
              email: 'dave @dave.com',
              firstName: 'Dave',
              lastName: 'DaBear',
              id: 1,
            } as User),
          ).to.be.rejectedWith('error finding third party support ticketing end user');
        },
      ),
    );
  });
});
