import * as sinon from 'sinon';
import { expect } from 'chai';
import { replayHttp } from '../test-helpers';
import Twilio from '../../src/lib/twilio';
import * as Utils from '../../src/lib/utils';
import { dogstatsd } from '../../src/lib/datadog-statsd';

describe('twilio', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('getMobileCarrierInfo', () => {
    it(
      'should handle a 404 gracefully',
      replayHttp('lib/twilio/twilio-is-mobile-404.json', async () => {
        sandbox.stub(dogstatsd, 'increment');
        await expect(Twilio.getMobileInfo('+13555877777')).to.be.rejectedWith(
          'Phone number not valid',
        );
      }),
    );
  });

  describe('getName', () => {
    it(
      'should handle a 404 gracefully',
      replayHttp('lib/twilio/twilio-caller-name-404.json', async () => {
        sandbox.stub(Utils, 'isProdEnv').returns(true);
        await expect(Twilio.getName('+13555877777')).to.be.rejectedWith('Phone number not valid');
      }),
    );
  });
});
