import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import * as sinon from 'sinon';

import * as Braze from '../../../../src/services/analytics/integrations/braze';
import * as API from '../../../../src/services/analytics/integrations/braze/helpers/api';

describe('Braze', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('purchases', () => {
    it('converts event with revenue to purchase', async () => {
      const postStub = sandbox.stub(API, 'post').resolves();
      await Braze.track({
        userId: '1',
        event: 'debit card funding account funding completed',
        timestamp: '1627247539746',
        properties: { revenue: 1.0 },
      });
      expect(postStub).to.have.been.calledWith({
        purchases: [
          {
            external_id: '1',
            product_id: 'debit card funding account funding completed',
            time: '1627247539746',
            price: 1,
            currency: 'USD',
            properties: {},
          },
        ],
      });
    });

    it('track includes attributes', async () => {
      const postStub = sandbox.stub(API, 'post').resolves();
      await Braze.track({
        userId: '1',
        event: 'debit card funding account funding completed',
        timestamp: '1627247539746',
        properties: {
          amount: 20,
        },
        context: {
          traits: {
            rating: 5,
            firstName: 'Dave',
            lastName: 'DaBear',
            birthday: '2012-12-01',
            'advance amount': 75,
            address: {
              city: 'Los Angeles',
              country: 'USA',
            },
            sms_enabled: ['AUTO_ADVANCE_APPROVAL', 'LOW_BALANCE'],
          },
        },
      });
      expect(postStub).to.have.been.calledWith({
        attributes: [
          {
            external_id: '1',
            rating: 5,
            first_name: 'Dave',
            last_name: 'DaBear',
            dob: '2012-12-01',
            advance_amount: 75, // spaces converted to underscore
            country: 'USA',
            home_city: 'Los Angeles',
            sms_enabled: ['AUTO_ADVANCE_APPROVAL', 'LOW_BALANCE'], // string values are not transformed
          },
        ],
        events: [
          {
            external_id: '1',
            name: 'debit card funding account funding completed',
            time: '1627247539746',
            properties: {
              amount: 20,
            },
          },
        ],
      });
    });

    it('uses default time', async () => {
      sandbox.useFakeTimers(moment('2021-02-03T14:00:00Z').unix() * 1000);
      const postStub = sandbox.stub(API, 'post').resolves();
      await Braze.track({
        userId: '1',
        event: 'debit card funding account funding completed',
      });
      expect(postStub).to.have.been.calledWith({
        events: [
          {
            external_id: '1',
            name: 'debit card funding account funding completed',
            time: '2021-02-03T14:00:00Z',
          },
        ],
      });
    });
  });
});
