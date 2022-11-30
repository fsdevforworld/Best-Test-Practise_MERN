import { AdvanceDelivery, DonationOrganizationCode } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';

import factory from '../../factories';
import { clean, stubLoomisClient } from '../../test-helpers';
import { moment } from '@dave-inc/time-lib';
import { serializeAdvanceComplexResponse } from '../../../src/serialization';

describe('expectedDelivery', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());

  beforeEach(() => stubLoomisClient(sandbox));

  afterEach(() => clean(sandbox));

  const dateFormat = 'YYYY-MM-DD';
  context('standard advances', () => {
    it('returns correct delivery date when created date is Monday before 3PM Pacific Time', async () => {
      const created = '2019-12-02T15:27:47.000Z'; // Mon Dec 2 7AM PST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-05 15:27:47')
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Monday after 3PM PT', async () => {
      const created = '2019-12-03T01:15:47.000Z'; // Mon Dec 2 5PM PST/ 7PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-07 01:15:47') // Fri Dec 6 5PM/ 7PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Tuesday before 3PM PT', async () => {
      const created = '2019-12-03T17:27:47.000Z'; // Tue Dec 3 9AM PST/ 11AM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-06 17:27:47') // Fri Dec 6 9AM/ 11AM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Tuesday after 3PM PT', async () => {
      const created = '2019-12-04T03:27:47.000Z'; // Tue, Dec 3 7PM PST/ 9PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-10 03:27:47') // Mon Dec 9 7PM/ 9PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Wednesday before 3PM PT', async () => {
      const created = '2019-12-04T20:27:47.000Z'; // Wed, Dec 4 12PM PST/ 2PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-09 20:27:47') // Mon Dec 9 12PM PST/ 2PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Wednesday after 3PM PT', async () => {
      const created = '2019-12-05 06:50:18.000Z'; // Wed, Dec 4 10PM PST/ Dec 5 12AM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-11 06:50:18') // Tue Dec 10 10PM PST/ Dec 11 12AM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Thursday before 3PM PT', async () => {
      const created = '2019-12-05T08:27:47.000Z'; // Thu, Dec 5 12AM PST/ 2AM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-10 08:27:47') // Tue Dec 10 12AM/ 2AM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Thursdy after 3PM PT', async () => {
      const created = '2019-12-06T07:59:47.000Z'; // Thu, Dec 5 12AM PST/ Dec 6 2AM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-12 07:59:47') // Wed Dec 11 11PM PST/ Dec 12 1AM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is Friday before 3PM PT', async () => {
      const created = '2019-12-06T19:27:47.000Z'; // Fri, Dec 6 11AM PST/ 1PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-11 19:27:47') // Wed Dec 11 11AM PST/ 1PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date falls on a Friday after 3PM Pacific Time', async () => {
      const created = '2019-12-06T23:00:47.000Z'; // Fri, Dec 6 3PM PST/ 5PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-12 23:00:47') // Thu, Dec 12 3PM/ 5PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date falls on a Saturday', async () => {
      const created = '2019-12-07T19:45:00.000Z'; // Sat Dec 7 11AM PST/ 1PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-12 19:45:00') // Thu Dec 12 4PM PST/ 6PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date falls on a Sunday', async () => {
      const created = '2019-12-08T19:45:00.000Z'; // Sun Dec 8 11AM PST/ 1PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-12 19:45:00') // Thu Dec 12 4PM PST/ 6PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date falls after 3PM the day before a holiday', async () => {
      const created = '2019-12-25T00:00:47.000Z'; // Tue, Dec 24 4PM PST/ 6PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2020-01-01 00:00:47') // Tue, Dec 31 4PM PST/ 6PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date falls on holiday', async () => {
      const created = '2019-12-25T21:00:47.000Z'; // Wed, Dec 25 1PM PST/ 3PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-31 21:00:47') // Tue, Dec 31 1PM PST/ 3PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('returns correct delivery date when created date is less than 3 business days before a holiday', async () => {
      const created = '2019-12-24T21:00:47.000Z'; // Tue, Dec 24 1PM PST/ 3PM CST
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Standard,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-30 21:00:47') // Mon Dec 30 1PM PST/ 3PM CST
        .utc()
        .format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });
  });

  context('express advance', () => {
    it('rounds down delivery time when created time minutes < 30', async () => {
      const created = '2019-12-02T05:29:47.000Z';
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Express,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-02 13:00:00').format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });

    it('rounds up delivery time when created time minutes >= 30', async () => {
      const created = '2019-12-02T05:30:47.000Z';
      const [advance, donationOrganization] = await Promise.all([
        factory.create('advance', {
          created,
          delivery: AdvanceDelivery.Express,
        }),
        factory.create('donation-organization', { code: DonationOrganizationCode.TREES }),
      ]);
      await factory.create('advance-tip', {
        advanceId: advance.id,
        donationOrganizationId: donationOrganization.id,
      });
      const expected = moment('2019-12-02 14:00:00').format();
      const serializedAdvanceWithTip = await advance.serializeAdvanceWithTip();
      const serializedAdvanceComplexResponse = await serializeAdvanceComplexResponse(
        advance,
        dateFormat,
      );
      expect(serializedAdvanceWithTip.expectedDelivery).to.equal(expected);
      expect(serializedAdvanceComplexResponse.expectedDelivery).to.equal(expected);
    });
  });
});
