import { expect } from 'chai';
import find from '../../../src/domain/phone-number-verification/find';
import redis from '../../../src/lib/redis';
import { toE164 } from '../../../src/lib/utils';

describe('find', () => {
  beforeEach(() => redis.flushdb());

  after(() => redis.flushdb());

  const phoneNumber = toE164('1234567890');

  it('finds verification associated with phone number in redis', async () => {
    await redis.hmsetAsync(phoneNumber, 'code', '1234');

    const verification = await find(phoneNumber);

    expect(verification.code).to.equal('1234');
  });

  it('returns null when there is no verification associated with phone number', async () => {
    const verification = await find(phoneNumber);

    expect(verification).to.be.null;
  });
});
