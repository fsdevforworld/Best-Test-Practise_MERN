import { expect } from 'chai';
import * as sinon from 'sinon';

import * as Amplitude from '../../../../src/services/analytics/integrations/amplitude';

describe('Amplitude', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('purchases', () => {
    it('validate simple event', async () => {
      const actual = Amplitude.validate({
        userId: '1',
        event: 'debit card funding account funding completed',
      });
      expect(actual).to.deep.equal({
        userId: '1',
        eventType: 'debit card funding account funding completed',
      });
    });

    it('validate converts event with revenue to purchase', async () => {
      const actual = Amplitude.validate({
        userId: '1',
        event: 'debit card funding account funding completed',
        properties: { revenue: 1.0, revenueType: 'foobar' },
      });
      expect(actual).to.deep.equal({
        userId: '1',
        eventType: 'debit card funding account funding completed',
        revenue: 1.0,
        revenueType: 'foobar',
      });
    });

    it('validate maps attributes', async () => {
      const actual = Amplitude.validate({
        userId: '1',
        event: 'debit card funding account funding completed',
        timestamp: '1627247539746',
        context: {
          traits: {
            rating: 5,
            firstName: 'Dave',
            lastName: 'DaBear',
            birthday: '2012-12-01',
            address: {
              city: 'Los Angeles',
              country: 'USA',
            },
          },
        },
      });
      expect(actual).to.deep.equal({
        userId: '1',
        eventType: 'debit card funding account funding completed',
        time: '1627247539746',
        userProperties: {
          rating: 5,
          address: { city: 'Los Angeles', country: 'USA' },
          birthday: '2012-12-01',
          firstName: 'Dave',
          lastName: 'DaBear',
        },
      });
    });

    it('throws InvalidParameters if userId does not exist', () => {
      expect(() => {
        // @ts-ignore
        Amplitude.validate({
          event: 'debit card funding account funding completed',
        });
      }).to.throw('BaseInvalidParametersError');
    });
  });
});
