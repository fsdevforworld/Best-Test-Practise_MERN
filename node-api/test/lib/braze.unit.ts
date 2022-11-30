import * as Bluebird from 'bluebird';
import { expect } from 'chai';
import * as config from 'config';
import * as sinon from 'sinon';
import * as request from 'superagent';
import * as braze from '../../src/lib/braze';
import logger from '../../src/lib/logger';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import { BrazeError } from '../../src/lib/error';
import { moment } from '@dave-inc/time-lib';
import { BrazeCurrency } from '../../src/typings';
import { replayHttp } from '../test-helpers';

describe('Braze', () => {
  const BRAZE_KEY = config.get('braze.key');

  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('track', () => {
    it('submits the data successfully to Braze', async () => {
      const sendResponse = { body: { success: true } };
      const sendStub = sandbox.stub().resolves(sendResponse);
      sandbox.stub(request, 'post').returns({
        send: sendStub,
      });

      const data = {
        attributes: [
          {
            externalId: 'foo-bar',
            firstName: 'Cardi',
            lastName: 'Offset',
            email: 'cardib@gmail.com',
          },
        ],
        events: [
          {
            externalId: 'user-1',
            name: 'advance-applied',
            time: moment('2018-08-19'),
            properties: {
              amount: 10,
            },
          },
        ],
        purchases: [
          {
            externalId: 'user-1',
            productId: 'advance-payment',
            currency: BrazeCurrency.USA,
            price: 75.5,
            time: moment('2018-08-19'),
            properties: {
              remainingBalance: 5.5,
              advanceId: 1,
            },
          },
        ],
      };

      const transformed = {
        api_key: BRAZE_KEY,
        attributes: [
          {
            external_id: 'foo-bar',
            first_name: 'Cardi',
            last_name: 'Offset',
            email: 'cardib@gmail.com',
          },
        ],
        events: [
          {
            external_id: 'user-1',
            name: 'advance-applied',
            time: '2018-08-19T00:00:00Z',
            properties: {
              amount: 10,
            },
          },
        ],
        purchases: [
          {
            external_id: 'user-1',
            product_id: 'advance-payment',
            currency: 'USD',
            price: 75.5,
            time: '2018-08-19T00:00:00Z',
            properties: {
              remainingBalance: 5.5,
              advanceId: 1,
            },
          },
        ],
      };

      const response = await braze.track(data);
      // Note: transformed data has snake_case keys and times as strings
      expect(sendStub).to.be.calledWith(transformed);
      expect(response).to.deep.equal(sendResponse);
    });

    it('throws for a non-fatal errors', async () => {
      const sendResponse = { body: { errors: true } };
      sandbox.stub(request, 'post').returns({
        send() {
          return Bluebird.resolve(sendResponse);
        },
      });

      const data = {
        attributes: [
          {
            externalId: 'foo-bar',
            firstName: 'Cardi',
            lastName: 'Offset',
            email: '@gmail.com',
          },
        ],
        events: [
          {
            externalId: 'user-1',
            name: 'advance-applied',
            time: moment('2018-08-19'),
            properties: {
              amount: 10,
            },
          },
        ],
        purchases: [
          {
            externalId: 'user-1',
            productId: 'advance-payment',
            currency: BrazeCurrency.USA,
            price: 75.5,
            time: moment('2018-08-19'),
            properties: {
              remainingBalance: 5.5,
              advanceId: 1,
            },
          },
        ],
      };
      const response = braze.track(data);
      await expect(response).to.be.rejectedWith(BrazeError);
    });
  });

  describe('deleteUser', () => {
    it(
      'should delete the braze user properly',
      replayHttp('../fixtures/lib/braze/delete-user.json', async () => {
        const loggerSpy = sandbox.stub(logger, 'info');
        const data = {
          attributes: [
            {
              externalId: '123',
              firstName: 'Cardi',
              lastName: 'Offset',
              email: 'cardib@gmail.com',
            },
          ],
          events: [
            {
              externalId: '123',
              name: 'advance-applied',
              time: moment('2018-08-19'),
              properties: {
                amount: 10,
              },
            },
          ],
          purchases: [
            {
              externalId: '123',
              productId: 'advance-payment',
              currency: BrazeCurrency.USA,
              price: 75.5,
              time: moment('2018-08-19'),
              properties: {
                remainingBalance: 5.5,
                advanceId: 1,
              },
            },
          ],
        };

        await braze.track(data);

        await braze.deleteUser(123);
        expect(loggerSpy.firstCall.args[0]).to.be.eq('Successfully sent delete request to braze');
        expect(loggerSpy.firstCall.args[1].body.deleted).to.be.eq(1);
        expect(loggerSpy.firstCall.args[1].body.message).to.be.eq('success');
      }),
    );

    it(
      'should log the error if there is an error making the api call',
      replayHttp('../fixtures/lib/braze/delete-user-error.json', async () => {
        sandbox.stub(braze, 'BRAZE_KEY').value(123);
        const loggerSpy = sandbox.stub(logger, 'error');
        await braze.deleteUser(123);
        expect(loggerSpy.firstCall.args[0]).to.be.eq('Error deleting user from braze');
        expect(loggerSpy.firstCall.args[1].error.status).to.be.eq(401);
      }),
    );
  });

  describe('triggerCampaign', () => {
    it('triggers the campaign successfully', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const sendResponse = { body: { success: true } };
      sandbox.stub(request, 'post').returns({
        send() {
          return Bluebird.resolve(sendResponse);
        },
      });
      const response = await braze.triggerCampaign({ campaign_id: 'testing' });
      expect(response).to.deep.equal(sendResponse);
      expect(datadogStub).to.be.calledWith(braze.BrazeMetrics.BRAZE_TRIGGER_CAMPAIGN_SUCCESS);
    });

    it('throws BrazeError if response errors', async () => {
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const sendResponse = { body: { errors: true } };
      sandbox.stub(request, 'post').returns({
        send() {
          return Bluebird.resolve(sendResponse);
        },
      });
      const response = braze.triggerCampaign({ campaign_id: 'testing' });
      await expect(response).to.be.rejectedWith(BrazeError);
      expect(datadogStub).to.be.calledWith(braze.BrazeMetrics.BRAZE_TRIGGER_CAMPAIGN_ERROR);
    });
  });
});
