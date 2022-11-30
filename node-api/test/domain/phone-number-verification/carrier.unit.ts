import { expect } from 'chai';
import formatPhoneNumberWithCarrierDomain from '../../../src/domain/phone-number-verification/carriers';

const carrierNames = [
  'alltel',
  'at&t',
  'at&t wireless',
  'boost mobile',
  'c-spire',
  'cellular_south_inc',
  'consumer cellular',
  'cricket wireless',
  'google fi (project fi)',
  'metro pcs',
  'page plus',
  'project fi',
  'sprint',
  't-mobile',
  'ting',
  'u.s. cellular',
  'us_cellular_corp.',
  'verizon',
  'virgin mobile',
  'xfinity mobile',
  'republic wireless',
];

const attCodes = [
  '310|070',
  '310|150',
  '310|170',
  '310|410',
  '310|380',
  '310|560',
  '310|680',
  '310|980',
];
const verizonCodes = [
  '310|004',
  '311|278',
  '311|483',
  '310|890',
  '311|283',
  '311|488',
  '311|272',
  '311|288',
  '311|277',
  '311|482',
  '310|590',
  '311|282',
  '311|487',
  '311|271',
  '311|287',
  '311|276',
  '311|481',
  '310|013',
  '311|281',
  '311|486',
  '311|270',
  '311|286',
  '311|275',
  '311|480',
  '310|012',
  '311|280',
  '311|485',
  '311|110',
  '311|285',
  '311|274',
  '311|390',
  '310|010',
  '311|279',
  '311|484',
  '310|910',
  '311|284',
  '311|489',
  '311|273',
  '311|289',
];
const sprintCodes = ['312|530', '312|190', '311|880', '311|870', '311|490', '310|120', '316|010'];
const tmobileCodes = [
  '310|220',
  '310|270',
  '310|210',
  '310|260',
  '310|200',
  '310|250',
  '310|160',
  '310|240',
  '310|660',
  '310|230',
  '310|031',
  '310|300',
  '310|280',
  '310|330',
  '310|800',
  '310|310',
  '311|660',
];

const usCellularCodes = ['311|580'];
const cellularSouthCodes = ['311|230'];

describe('formatPhoneNumberWithCarrierDomain', () => {
  const phoneNumber = '+11234567890';

  it('returns formatted phone number and carrier email address given a confirmed carrier code', () => {
    attCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@txt.att.net');
    });
    sprintCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@messaging.sprintpcs.com');
    });
    tmobileCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@tmomail.net');
    });
    verizonCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@vtext.com');
    });
    usCellularCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@email.uscc.net');
    });
    cellularSouthCodes.forEach(code => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, code, 'carrier');
      expect(email).to.equal('1234567890@csouth1.com');
    });
  });

  it('returns formatted phone number and carrier email address given a carrier name', () => {
    carrierNames.forEach(name => {
      const email = formatPhoneNumberWithCarrierDomain(phoneNumber, '000|000', name);
      expect(email).to.match(/^1234567890\@.+\.(com|net)$/);
    });
  });

  it('returns undefined when both mobile and carrier are not found', () => {
    const result = formatPhoneNumberWithCarrierDomain(
      phoneNumber,
      '000|000',
      'nonexistent carrier',
    );
    expect(result).to.be.undefined;
  });
});
