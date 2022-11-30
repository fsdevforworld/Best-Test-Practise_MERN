import { expect } from 'chai';
import { moment, MOMENT_FORMATS } from '@dave-inc/time-lib';
import { userSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';

describe('serializeUserPromotion', () => {
  const serialize = userSerializers.serializeUserPromotion;

  const baseData = {
    campaignId: 1,
    segmentId: 'seg-1',
    startDate: '2021-01-01 00:11:02',
    endDate: '2021-12-31 23:59:59',
    trigger: '{}',
    reward: '{}',
    name: 'Celeb 200',
    description: 'JSON Derulo',
    eligibleDate: '2021-02-01 00:01:02',
    redeemed: false,
    userId: 10,
  };

  ['description', 'name', 'redeemed'].forEach((prop: keyof typeof baseData) => {
    it(`includes ${prop}`, async () => {
      const { attributes } = await serialize(baseData);
      expect((attributes as Record<string, unknown>)[prop]).to.equal(baseData[prop]);
    });
  });

  const oneWeekAgo = moment()
    .subtract(1, 'week')
    .format(MOMENT_FORMATS.YEAR_MONTH_DAY);
  const oneDayAgo = moment()
    .subtract(1, 'day')
    .format(MOMENT_FORMATS.YEAR_MONTH_DAY);
  const oneWeekAhead = moment()
    .add(1, 'week')
    .format(MOMENT_FORMATS.YEAR_MONTH_DAY);
  const oneYearAhead = moment()
    .add(1, 'year')
    .format(MOMENT_FORMATS.YEAR_MONTH_DAY);

  [
    {
      status: 'UPCOMING',
      startDate: oneWeekAhead,
      endDate: oneYearAhead,
    },
    { status: 'ACTIVE', startDate: oneWeekAgo, endDate: oneWeekAhead },
    {
      status: 'CLOSED',
      startDate: oneWeekAgo,
      endDate: oneDayAgo,
    },
  ].forEach(({ status, startDate, endDate }) => {
    it(`correctly sets the status to ${status}`, async () => {
      const data = {
        ...baseData,
        startDate,
        endDate,
      };

      const { attributes } = await serialize(data);

      expect(attributes.status).to.equal(status);
    });
  });

  it('maps eligibleDate to eligibleAt', async () => {
    const { attributes } = await serialize(baseData);
    expect(attributes.eligibleAt).to.equal(baseData.eligibleDate);
  });

  it('maps startDate to startAt', async () => {
    const { attributes } = await serialize(baseData);
    expect(attributes.startAt).to.equal(baseData.startDate);
  });

  it('maps endDate to endAt', async () => {
    const { attributes } = await serialize(baseData);
    expect(attributes.endAt).to.equal(baseData.endDate);
  });

  it('handles no redemptionInfo', async () => {
    const {
      attributes: { disbursedAt, disbursementAmount, disbursementReferenceId },
    } = await serialize(baseData);

    expect(disbursedAt).to.be.null;
    expect(disbursementAmount).to.be.null;
    expect(disbursementReferenceId).to.be.null;
  });

  it('shows disbursement data', async () => {
    const redemptionInfo = {
      created: '2020-03-01 00:00:00',
      referenceId: 'foo-1',
      transactionStatus: 'PENDING',
      redemptionAmount: 100,
    };

    const data = {
      ...baseData,
      redemptionInfo,
    };

    const {
      attributes: { disbursedAt, disbursementAmount, disbursementReferenceId },
    } = await serialize(data);

    expect(disbursedAt).equal(redemptionInfo.created);
    expect(disbursementAmount).to.equal(redemptionInfo.redemptionAmount);
    expect(disbursementReferenceId).to.equal(redemptionInfo.referenceId);
  });

  it('replaces empty endDate with null', async () => {
    const data = {
      ...baseData,
      endDate: '',
    };

    const { attributes } = await serialize(data);

    expect(attributes.endAt).to.be.null;
  });
});
