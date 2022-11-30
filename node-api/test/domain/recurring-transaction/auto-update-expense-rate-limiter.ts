import { expect } from 'chai';
import * as sinon from 'sinon';
import { Cache } from '../../../src/lib/cache';
import * as AutoUpdateExpenseRateLimiter from '../../../src/domain/recurring-transaction/auto-update-expense-rate-limiter';
import * as config from 'config';

describe('auto-update-expense-rate-limiter', () => {
  const sandbox = sinon.createSandbox();
  describe('getLimited', async () => {
    afterEach(async () => {
      sandbox.restore();
    });

    it('Should return false when user is not in the rate limit cache', async () => {
      const testUserId = 76767;
      const testBankConn = 111;
      sandbox
        .stub(Cache.prototype, 'get')
        .withArgs('.userId:76767:bankConn:111')
        .returns(null);

      const result = await AutoUpdateExpenseRateLimiter.getLimited(testUserId, testBankConn);

      expect(result).to.be.false;
    });

    it('Should return true when user is in the rate limit cache', async () => {
      const testUserId = 67676;
      const testBankConn = 999;
      sandbox
        .stub(Cache.prototype, 'get')
        .withArgs('.userId:67676:bankConn:999')
        .returns('true');

      const result = await AutoUpdateExpenseRateLimiter.getLimited(testUserId, testBankConn);

      expect(result).to.be.true;
    });
  });

  describe('setLimited', async () => {
    afterEach(async () => {
      sandbox.restore();
    });

    it('Should store user bank connection with true value and expected key and default to 1 week TTL', async () => {
      const testUserId = 12121;
      const testBankConn = 79;
      const setCacheStub = sandbox.stub(Cache.prototype, 'set');
      const oneWeekInSeconds = 604800;
      sandbox
        .stub(config, 'get')
        .withArgs('recurringTransaction.autoDetectNewExpensesTTL')
        .throws(new Error('Configuration Not Defined'));

      await AutoUpdateExpenseRateLimiter.setLimited(testUserId, testBankConn);

      sandbox.assert.calledOnce(setCacheStub);
      sandbox.assert.calledWithExactly(
        setCacheStub,
        '.userId:12121:bankConn:79',
        'true',
        oneWeekInSeconds,
      );
    });

    it('Should store user with true value when TTL config is a string', async () => {
      const testUserId = 22222;
      const testBankConn = 11111;
      const setCacheStub = sandbox.stub(Cache.prototype, 'set');
      const testTTL = 120;
      sandbox
        .stub(config, 'get')
        .withArgs('recurringTransaction.autoDetectNewExpensesTTL')
        .returns('120');

      await AutoUpdateExpenseRateLimiter.setLimited(testUserId, testBankConn);

      sandbox.assert.calledOnce(setCacheStub);
      sandbox.assert.calledWithExactly(
        setCacheStub,
        '.userId:22222:bankConn:11111',
        'true',
        testTTL,
      );
    });

    it('Should store user with true value when TTL config is a number', async () => {
      const testUserId = 333;
      const testBankConnId = 444;
      const setCacheStub = sandbox.stub(Cache.prototype, 'set');
      const testTTL = 7777;
      sandbox
        .stub(config, 'get')
        .withArgs('recurringTransaction.autoDetectNewExpensesTTL')
        .returns(testTTL);

      await AutoUpdateExpenseRateLimiter.setLimited(testUserId, testBankConnId);

      sandbox.assert.calledOnce(setCacheStub);
      sandbox.assert.calledWithExactly(setCacheStub, '.userId:333:bankConn:444', 'true', testTTL);
    });
  });
});
