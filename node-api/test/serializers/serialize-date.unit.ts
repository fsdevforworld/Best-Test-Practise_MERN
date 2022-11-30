import { moment } from '@dave-inc/time-lib';
import { expect } from 'chai';
import { serializeDate } from '../../src/serialization';

describe('Serialize date', () => {
  it('serializes Moment', () => {
    const asMoment = moment('2020-01-01 09:30');

    const serialized = serializeDate(asMoment, 'YYYY-MM-DD');
    expect(serialized).to.equal('2020-01-01');
  });

  it('serializes Date', () => {
    const asDate = new Date('2020-01-01T09:30');

    const serialized = serializeDate(asDate, 'YYYY-MM-DD');
    expect(serialized).to.equal('2020-01-01');
  });

  it('serializes string', () => {
    const asString = '2020-01-01T09';

    const serialized = serializeDate(asString, 'YYYY-MM-DD');
    expect(serialized).to.equal('2020-01-01');
  });

  it('handles null', () => {
    const serialized = serializeDate(undefined);

    expect(serialized).to.be.null;
  });

  it('handles non-moment string', () => {
    const serialized = serializeDate('goo goo gah gah');

    expect(serialized).to.be.null;
  });
});
