import { expect } from 'chai';
import { sample } from 'lodash';
import { getVerificationStatus } from '../../../src/domain/identity-verification-engine';
import {
  IdentityVerificationError,
  SynapsepayDocumentLicenseStatus,
  SynapsepayDocumentPermission,
  SynapsepayDocumentSSNStatus,
  SynapsepayDocumentWatchlists,
} from '../../../src/typings';
import { IdentityVerificationStatus } from '@dave-inc/wire-typings';

function generateDocument(overrides = {}) {
  const defaults = {
    permission: sample(SynapsepayDocumentPermission) as SynapsepayDocumentPermission,
    ssnStatus: sample(SynapsepayDocumentSSNStatus) as SynapsepayDocumentSSNStatus,
    licenseStatus: sample(SynapsepayDocumentLicenseStatus) as SynapsepayDocumentLicenseStatus,
    sanctionsScreeningMatch: sample([true, false]),
  };

  return Object.assign(defaults, overrides);
}

describe('domain: identity-verification', () => {
  it('requires a KYC document', () => {
    const result = getVerificationStatus();

    expect(result).to.deep.equal({
      success: false,
      error: 'Identity verification is required to take out an advance',
    });
  });

  it('is successful when permission is SEND-AND-RECEIVE and license is valid', () => {
    const document = generateDocument({
      permission: SynapsepayDocumentPermission.SendAndReceive,
      licenseStatus: SynapsepayDocumentLicenseStatus.Valid,
      ssnStatus: SynapsepayDocumentSSNStatus.Invalid,
      sanctionsScreeningMatch: true,
    });

    const result = getVerificationStatus(document);

    expect(result).to.deep.equal({
      success: true,
      error: null,
    });
  });

  it('is unsuccessful when permission is CLOSED', () => {
    const document = generateDocument({
      permission: SynapsepayDocumentPermission.Closed,
      licenseStatus: SynapsepayDocumentLicenseStatus.Valid,
      ssnStatus: SynapsepayDocumentSSNStatus.Valid,
      sanctionsScreeningMatch: false,
    });

    const result = getVerificationStatus(document);

    expect(result).to.deep.equal({
      success: false,
      error: IdentityVerificationError.CLOSED_PERMISSION,
      status: IdentityVerificationStatus.Invalid,
    });
  });

  it('is successful when permission is SEND-AND-RECEIVE and SSN is valid and no sanctions match', () => {
    const document = generateDocument({
      permission: SynapsepayDocumentPermission.SendAndReceive,
      licenseStatus: null,
      ssnStatus: SynapsepayDocumentSSNStatus.Valid,
      sanctionsScreeningMatch: false,
    });

    const result = getVerificationStatus(document);

    expect(result).to.deep.equal({
      success: true,
      error: null,
    });
  });

  it(`is successful when watchlists status requires upload but permission is ${SynapsepayDocumentPermission.SendAndReceive}`, () => {
    const doc = generateDocument({
      permission: SynapsepayDocumentPermission.SendAndReceive,
      ssnStatus: SynapsepayDocumentSSNStatus.Valid,
      licenseStatus: null,
      sanctionsScreeningMatch: false,
      watchlists: SynapsepayDocumentWatchlists.LicenseUploadRequired,
    });

    const result = getVerificationStatus(doc);

    expect(result).to.deep.equal({
      success: true,
      error: null,
    });
  });

  describe('status: REVIEWING_DOC', () => {
    const status = 'REVIEWING_DOC';
    const expectedResult = {
      success: false,
      status,
      error: 'Identity documents are still under review',
    };

    it(`is ${status} when the SSN is under review`, () => {
      const doc = generateDocument({
        ssnStatus: SynapsepayDocumentSSNStatus.Reviewing,
        permission: SynapsepayDocumentPermission.Unverified,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when the license is under review`, () => {
      const doc = generateDocument({
        licenseStatus: SynapsepayDocumentLicenseStatus.Reviewing,
        permission: SynapsepayDocumentPermission.Unverified,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when the license is under review and SSN is verified and sanctions match is true`, () => {
      const doc = generateDocument({
        licenseStatus: SynapsepayDocumentLicenseStatus.Reviewing,
        ssnStatus: SynapsepayDocumentSSNStatus.Valid,
        permission: SynapsepayDocumentPermission.SendAndReceive,
        sanctionsScreeningMatch: true,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('status: UPLOAD_LICENSE', () => {
    const status = 'UPLOAD_LICENSE';
    const expectedResult = {
      success: false,
      status,
      error: 'Please upload license',
    };

    it(`is ${status} when the SSN is invalid and license status is missing`, () => {
      const doc = generateDocument({
        ssnStatus: SynapsepayDocumentSSNStatus.Invalid,
        licenseStatus: null,
        permission: SynapsepayDocumentPermission.Unverified,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when the SSN is invalid and license status is invalid`, () => {
      const doc = generateDocument({
        ssnStatus: SynapsepayDocumentSSNStatus.Invalid,
        licenseStatus: SynapsepayDocumentLicenseStatus.Invalid,
        permission: SynapsepayDocumentPermission.Unverified,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when there is a sanctions screening match and license is missing`, () => {
      const doc = generateDocument({
        permission: SynapsepayDocumentPermission.SendAndReceive,
        ssnStatus: SynapsepayDocumentSSNStatus.Valid,
        licenseStatus: null,
        sanctionsScreeningMatch: true,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when there is a sanctions screening match and license is invalid`, () => {
      const doc = generateDocument({
        permission: SynapsepayDocumentPermission.SendAndReceive,
        ssnStatus: SynapsepayDocumentSSNStatus.Valid,
        licenseStatus: SynapsepayDocumentLicenseStatus.Invalid,
        sanctionsScreeningMatch: true,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });

    it(`is ${status} when watchlists status requires upload and permission is ${SynapsepayDocumentPermission.Unverified}`, () => {
      const doc = generateDocument({
        permission: SynapsepayDocumentPermission.Unverified,
        ssnStatus: SynapsepayDocumentSSNStatus.Valid,
        licenseStatus: SynapsepayDocumentLicenseStatus.Valid,
        sanctionsScreeningMatch: false,
        watchlists: SynapsepayDocumentWatchlists.LicenseUploadRequired,
      });

      const result = getVerificationStatus(doc);

      expect(result).to.deep.equal(expectedResult);
    });
  });
});
