import amplitude from '../../src/lib/amplitude';
import { expect } from 'chai';
import * as sinon from 'sinon';
import * as Utils from '../../src/lib/utils';
// tslint:disable-next-line:no-require-imports
import Amplitude = require('amplitude');

describe('amplitude', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('track', async () => {
    it('Should catch amplitude errors', async () => {
      sandbox.stub(Utils, 'isTestEnv').returns(false);
      const stub = sandbox.stub(Amplitude.prototype, 'track').rejects('bacon');
      await expect(amplitude.track({ eventType: 'asdf' })).to.be.fulfilled;
      expect(stub.callCount).to.eq(1);
    });
  });
});
