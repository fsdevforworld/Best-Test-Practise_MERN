import { DEFAULT_TIMEZONE } from '@dave-inc/time-lib';
import { TimeoutError } from 'bluebird';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { dogstatsd } from '../../src/lib/datadog-statsd';
import logger from '../../src/lib/logger';

import {
  compareAccountRouting,
  generateMFACode,
  generateRandomNumber,
  generateRandomNumberString,
  getAvailableOrCurrentBalance,
  MFA_LENGTH,
  getTimezoneFromZipCode,
  obfuscateEmail,
  poll,
  processInBatches,
  sleep,
  toNonE164Format,
  validateMFACode,
  validateEmail,
  validateLastFourSSNFormat,
  validatePhoneNumber,
  validateZipCode,
  MFACodeValidation,
  getRandomInt,
} from '../../src/lib/utils';
import * as crypto from 'crypto';

describe('Utils', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('getAvailableOrCurrentBalance', () => {
    it('gets the avaiable balance if it exists', () => {
      expect(getAvailableOrCurrentBalance({ available: 10, current: 25 })).to.equal(10);
    });

    it('falls back to the current balance for null', () => {
      expect(getAvailableOrCurrentBalance({ available: null, current: 100 })).to.equal(100);
    });

    it('allows a zero available balance', () => {
      expect(getAvailableOrCurrentBalance({ available: 0, current: 100 })).to.equal(0);
    });
  });

  describe('validatePhoneNumber', () => {
    it('should return true if it is a phone number without the E164 format', () => {
      expect(validatePhoneNumber('3231234567')).to.be.true;
    });

    it('should return true if it is a phone number with the E164 format', () => {
      expect(validatePhoneNumber('+13231234567')).to.be.true;
    });

    it('should return true if it is just 3 numbers', () => {
      expect(validatePhoneNumber('333')).to.be.false;
    });

    it('should return false if it is an empty string', () => {
      expect(validatePhoneNumber('')).to.be.false;
    });

    it('should return false if it is a non empty string but not a phone number', () => {
      expect(validatePhoneNumber('failure4eva')).to.be.false;
    });
  });

  describe('validateLastFourSSNFormat', () => {
    it('should return true if the SSN is 4 digits', () => {
      expect(validateLastFourSSNFormat('1234')).to.be.true;
    });

    it('should return false if the SSN is null', () => {
      expect(validateLastFourSSNFormat(null)).to.be.false;
    });

    it('should return false if the SSN is a size 4 string mixed with numbers and letters', () => {
      expect(validateLastFourSSNFormat('1a3b')).to.be.false;
    });

    it('should return false if the SSN is a 5 digit string', () => {
      expect(validateLastFourSSNFormat('12345')).to.be.false;
    });

    it('should return false if the SSN is a size 5 string with the first one being a letter and 4 digits', () => {
      expect(validateLastFourSSNFormat('a1234')).to.be.false;
    });

    it('should return false if the SSN is a size 5 string with 4 digits and the last one being a letter', () => {
      expect(validateLastFourSSNFormat('1234a')).to.be.false;
    });
  });

  describe('validateZipCode', () => {
    it('should accept a 5 digit zip code', () => {
      expect(validateZipCode('00000')).to.equal(true);
      expect(validateZipCode('11111')).to.equal(true);
      expect(validateZipCode('22222')).to.equal(true);
      expect(validateZipCode('33333')).to.equal(true);
      expect(validateZipCode('44444')).to.equal(true);
      expect(validateZipCode('55555')).to.equal(true);
      expect(validateZipCode('66666')).to.equal(true);
      expect(validateZipCode('77777')).to.equal(true);
      expect(validateZipCode('88888')).to.equal(true);
      expect(validateZipCode('99999')).to.equal(true);
    });
    it('should accept a 9 digit zip code with a dash after the fifth', () => {
      expect(validateZipCode('00000-0000')).to.equal(true);
    });
    it('should not accept a 9 digit zip code with a dash after the fourth', () => {
      expect(validateZipCode('0000-00000')).to.equal(false);
    });
    it('should not accept a 9 digit zip code with a dash after the sixth', () => {
      expect(validateZipCode('000000-000')).to.equal(false);
    });
    it('should not accept a 9 digit zip code without a dash', () => {
      expect(validateZipCode('000000000')).to.equal(false);
    });
    it('should not accept an 8 digit zip code', () => {
      expect(validateZipCode('00000-000')).to.equal(false);
    });
    it('should not accept a 10 digit zip code', () => {
      expect(validateZipCode('00000-00000')).to.equal(false);
    });
    it('should not accept a 6 digit zip code', () => {
      expect(validateZipCode('000000')).to.equal(false);
    });
    it('should not accept a 4 digit zip code', () => {
      expect(validateZipCode('0000')).to.equal(false);
    });
    it('should not accept a zip code with letters in it', () => {
      expect(validateZipCode('aaaaa')).to.equal(false);
    });
    it('should not accept an empty zip code', () => {
      expect(validateZipCode('')).to.equal(false);
    });
  });

  describe('validateEmail', () => {
    it('should validate email', () => {
      expect(validateEmail('00000')).to.equal(false);
      expect(validateEmail('chris@dave')).to.equal(false);
      expect(validateEmail('chrisdave.com')).to.equal(false);
      expect(validateEmail('bruce hornsby@dead.net')).to.equal(false);
      expect(validateEmail('brucehornsby@dead .net')).to.equal(false);
      expect(validateEmail('chris@dave.com')).to.equal(true);
    });
  });

  describe('processInBatches', () => {
    let batchCount: number;
    const getItems = () => [1, 2, 3, 4, 5, 6, 7].map(x => ({ value: x }));
    const getBatch = (items: any[]) => (limit: number, offset: number) =>
      items.slice(offset, offset + limit);
    const processBatch = (x: any[]) => {
      batchCount += 1;
      x.forEach(y => (y.added = y.value + 2));
    };

    beforeEach(() => {
      batchCount = 0;
    });

    it('should process in batches with batch size 1', async () => {
      const items = getItems();
      await processInBatches(getBatch(items), processBatch, 1);
      expect(batchCount).to.equal(7);
      items.forEach((item: any) => {
        expect(item.added).to.equal(item.value + 2);
      });
    });

    it('should process in batches with batch size 2', async () => {
      const items = getItems();
      await processInBatches(getBatch(items), processBatch, 2);
      expect(batchCount).to.equal(4);
      items.forEach((item: any) => {
        expect(item.added).to.equal(item.value + 2);
      });
    });

    it('will not run forever if there are no results', async () => {
      const batch: (limit?: number, offset?: number) => any[] = () => [];
      await processInBatches(batch, processBatch, 2);
    });
  });

  describe('compareAccountRouting', () => {
    const account = '322112';
    const routing = '123345784';
    it('pass/fail when account|routing are exact match and not a match respectively', async () => {
      const match = compareAccountRouting(`${account}|${routing}`, `${account}|${routing}`);
      expect(match).to.equal(true);
      const account2 = '342311';
      const noMatch = compareAccountRouting(`${account2}|${routing}`, `${account}|${routing}`);
      expect(noMatch).to.equal(false);
    });

    it('pass when account number match after removing prefixed zeros', async () => {
      const account2 = `0000${account}`;
      let match = compareAccountRouting(`${account2}|${routing}`, `${account}|${routing}`);
      expect(match).to.equal(true);
      match = compareAccountRouting(`${account}|${routing}`, `${account2}|${routing}`);
      expect(match).to.equal(true);
    });

    it('fail when account number does not match after removing prefixed zeros', async () => {
      const account2 = '0000342311';
      const noMatch = compareAccountRouting(`${account2}|${routing}`, `${account}|${routing}`);
      expect(noMatch).to.equal(false);
    });
  });

  describe('obfuscateEmail', () => {
    it('should successfully obfuscate an email', () => {
      expect(obfuscateEmail('jeffThings@allThingsJeff.com')).to.eq('j****s@allThingsJeff.com');
    });
  });

  describe('toNonE164Format', () => {
    it('should return a phone number without the +1', () => {
      expect(toNonE164Format('+11234567890')).to.equal('1234567890');
    });

    it('should return the same phone number if it does not have a +1', () => {
      expect(toNonE164Format('1234567890')).to.equal('1234567890');
    });
  });

  describe('poll', () => {
    xit('should throw a TimeoutError if polling passes the specified timeout period', async () => {
      const promiseCreator = sandbox.stub().returns(Promise.resolve());

      let errorThrown: TimeoutError;
      const onSuccessFullPollSub = sandbox.stub();

      try {
        await poll(promiseCreator, {
          delayMs: 100,
          timeoutMs: 1000,
          shouldKeepPolling: () => true,
          onSuccessfulPoll: onSuccessFullPollSub,
        });
      } catch (err) {
        errorThrown = err;
      }

      // Should have been called between 5 - 10 times
      const callCount = promiseCreator.callCount;
      expect(callCount).to.be.least(5);
      expect(callCount).to.be.most(10);

      expect(onSuccessFullPollSub.callCount).to.eq(callCount);
      expect(errorThrown).to.exist;
      expect(errorThrown).to.be.instanceOf(TimeoutError);
      expect(errorThrown.message).to.eq('Timed out polling after 1000ms');

      await sleep(200);

      // Ensure call count has not changed
      expect(promiseCreator.callCount).to.eq(callCount);
    });

    xit('should stop polling and return response when polling is no longer required based on provided criteria', async () => {
      let counter = 0;

      const promiseCreator = sandbox.stub().callsFake(async () => (counter += 1));
      const onSuccessFullPollSub = sandbox.stub();

      const result = await poll(promiseCreator, {
        delayMs: 1,
        timeoutMs: 1000,
        shouldKeepPolling: count => count < 10,
        onSuccessfulPoll: onSuccessFullPollSub,
      });

      expect(promiseCreator.callCount).to.eq(10);
      expect(onSuccessFullPollSub.callCount).to.eq(10);
      expect(result).to.eq(10);

      await sleep(200);

      // Ensure call count has not changed
      expect(promiseCreator.callCount).to.eq(10);
    });
  });

  describe('validateMFACode', () => {
    context('4 digit codes', () => {
      it('throw an error on legacy 4 digit codes', () => {
        const codes = ['1111', '2345'];
        //const expected = [MFACodeValidation.InvalidLegacyMFA, MFACodeValidation.InvalidLegacyMFA]
        codes.forEach(code =>
          expect(validateMFACode(code)).to.equal(MFACodeValidation.InvalidLegacyMFA),
        );
      });

      it('throws an error for non 4 or 6 digit codes', () => {
        const codes = ['123', '12345', 'aaaa'];
        codes.forEach(code => expect(validateMFACode(code)).to.equal(MFACodeValidation.InvalidMFA));
      });
    });

    context('6 digit codes', () => {
      it('validate 6 digit codes', () => {
        const codes = ['111111', '234568'];
        codes.forEach(code => expect(validateMFACode(code)).to.equal(MFACodeValidation.ValidMFA));
      });

      it('throws an error for non 6 digit codes', () => {
        const codes = ['12345', '1234567', 'aaaaaa'];
        codes.forEach(code => expect(validateMFACode(code)).to.equal(MFACodeValidation.InvalidMFA));
      });
    });
  });

  describe('getTimezoneFromZipCode', () => {
    it(`tracks not found zip codes and uses ${DEFAULT_TIMEZONE} as default`, () => {
      const metricStub = sandbox.stub(dogstatsd, 'increment');
      const loggerStub = sandbox.stub(logger, 'warn');
      const timezone = getTimezoneFromZipCode('00000');
      expect(timezone).to.equal(DEFAULT_TIMEZONE);
      expect(metricStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledOnce;
    });

    it(`does not track null zip codes and uses ${DEFAULT_TIMEZONE} as default`, () => {
      const metricStub = sandbox.stub(dogstatsd, 'increment');
      const loggerStub = sandbox.stub(logger, 'warn');
      const timezone = getTimezoneFromZipCode(null);
      expect(timezone).to.equal(DEFAULT_TIMEZONE);
      expect(metricStub).to.not.be.called;
      expect(loggerStub).to.not.be.called;
    });
  });

  describe('Random Functions', () => {
    for (const func of [
      { name: 'getRandomInt', test: () => getRandomInt(5, 10) },
      { name: 'generateRandomNumber', test: () => generateRandomNumber(6) },
      { name: 'generateRandomNumberString', test: () => generateRandomNumberString(6) },
      { name: 'generateMFACode', test: () => generateMFACode() },
    ]) {
      it(`${func.name} should use crypto.randomInt as randomInt is a CSPRNG, and not use Math.random`, () => {
        const randomStub = sandbox.stub(Math, 'random').returns(1);
        const randomIntStub = sandbox.stub(crypto, 'randomInt').returns(1);
        func.test();

        expect(randomStub.called).to.be.false;
        expect(randomIntStub.called).to.be.true;
      });
    }

    describe('generateRandomNumber', () => {
      it('should generate a random number with N digits always', () => {
        const N = 5;
        const res = Array.from({ length: 10000 }, (_, i) => generateRandomNumber(N));
        const lens = res.every((next: number) => Math.ceil(Math.log10(next + 1)) === N);
        expect(lens).to.be.true;
      });
    });

    describe('generateRandomNumberString', () => {
      it('should generate a random number string with N digits always', () => {
        const N = 5;
        const res = Array.from({ length: 10000 }, (_, i) => generateRandomNumberString(N));
        const lens = res.every((next: string) => next.length === N);
        expect(lens).to.be.true;
      });
    });

    describe('generateMFACode', () => {
      it('should generate a random number code with MFA_LENGTH digits always', () => {
        const res = Array.from({ length: 10000 }, (_, i) => generateMFACode());
        const lens = res.every((next: string) => next.length === MFA_LENGTH);
        expect(lens).to.be.true;
      });
    });
  });
});
