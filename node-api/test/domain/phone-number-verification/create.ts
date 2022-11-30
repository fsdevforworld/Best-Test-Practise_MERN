import { expect } from 'chai';
import create from '../../../src/domain/phone-number-verification/create';
import find from '../../../src/domain/phone-number-verification/find';
import redis from '../../../src/lib/redis';
import { toE164 } from '../../../src/lib/utils';

describe('create', () => {
  beforeEach(() => redis.flushdb());

  after(() => redis.flushdb());

  const e164PhoneNumber = toE164('1234567890');
  const carrierName = 't-mobile';
  const carrierCode = '310|220';

  it('sets phone number as key with code, carrier name, carrier code and expiration in redis', async () => {
    await create({ e164PhoneNumber, carrierName, carrierCode });
    const verification = await find(e164PhoneNumber);
    expect(verification.code).to.exist;
    expect(verification.carrierName).to.equal(carrierName);
    expect(verification.carrierCode).to.equal(carrierCode);

    const ttl = await redis.ttlAsync(e164PhoneNumber);
    expect(ttl).to.be.greaterThan(0);
  });

  it('creates a new verification code if create is called again', async () => {
    const code0 = await create({ e164PhoneNumber, carrierName, carrierCode });
    const code1 = await create({ e164PhoneNumber, carrierName, carrierCode });
    expect(code0.code).to.not.equal(code1.code);
  });
});
