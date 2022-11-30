import { expect } from 'chai';
import { createVerificationCode } from '../../test-helpers';
import verify from '../../../src/domain/phone-number-verification/verify';
import redis from '../../../src/lib/redis';

describe('verify', () => {
  beforeEach(() => redis.flushdb());
  after(() => redis.flushdb());

  const phoneNumber = '1234567890';

  it('is true when code supplied matches stored code associated with phone number', async () => {
    const code = '1234';

    await createVerificationCode({ phoneNumber, code });

    const isVerified = await verify(phoneNumber, code);
    expect(isVerified).to.be.true;
  });

  it('is false when code supplied does not match stored code associated with phone number', async () => {
    const code = '1234';
    const falseCode = '7890';

    await createVerificationCode({ phoneNumber, code });

    const isVerified = await verify(phoneNumber, falseCode);
    expect(isVerified).to.be.false;
  });

  it('is false when no stored code associated with phone number', async () => {
    const code = '1234';

    const isVerified = await verify(phoneNumber, code);
    expect(isVerified).to.be.false;
  });

  it('is false when there is no stored code and no code is supplied', async () => {
    const isVerified = await verify(phoneNumber, null);
    expect(isVerified).to.be.false;
  });

  it('is true when the valid override code is provided', async () => {
    const validOverride = '5678';
    const isVerified = await verify(phoneNumber, validOverride, validOverride);
    expect(isVerified).to.be.true;
  });

  it('is false when the invalid override code is provided', async () => {
    const validOverride = '1234';
    const invalidOverride = '5678';
    const isVerified = await verify(phoneNumber, validOverride, invalidOverride);
    expect(isVerified).to.be.false;
  });

  it('is true when valid verification code is provided, even when override code is also provided', async () => {
    const code = '1234';
    const validOverride = '5678';

    await createVerificationCode({ phoneNumber, code });

    const isVerified = await verify(phoneNumber, code, validOverride);
    expect(isVerified).to.be.true;
  });

  it('is false when user submitted code is undefined and override code is provided', async () => {
    const validOverride = '5678';
    const isVerified = await verify(phoneNumber, undefined, validOverride);
    expect(isVerified).to.be.false;
  });

  it('is false when user submitted code and override codes are undefined', async () => {
    const isVerified = await verify(phoneNumber, undefined, undefined);
    expect(isVerified).to.be.false;
  });
});
