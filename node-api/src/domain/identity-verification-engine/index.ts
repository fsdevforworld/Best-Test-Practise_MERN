import { IdentityVerificationStatus, IIdentityVerificationResult } from '@dave-inc/wire-typings';
import {
  IdentityVerificationError,
  SynapsepayDocumentSSNStatus,
  SynapsepayDocumentLicenseStatus,
  SynapsepayDocumentPermission,
  SynapsepayDocumentWatchlists,
} from '../../typings';

type IdentityDocument = {
  permission?: SynapsepayDocumentPermission;
  ssnStatus?: SynapsepayDocumentSSNStatus;
  licenseStatus?: SynapsepayDocumentLicenseStatus;
  sanctionsScreeningMatch: boolean;
  watchlists?: string;
};

export function getVerificationStatus(document?: IdentityDocument): IIdentityVerificationResult {
  if (!document) {
    return {
      success: false,
      error: IdentityVerificationError.NO_DOCUMENT,
    };
  }

  if (isUnderReview(document)) {
    return {
      success: false,
      error: IdentityVerificationError.UNDER_REVIEW,
      status: IdentityVerificationStatus.Reviewing,
    };
  }

  if (licenseUploadRequired(document)) {
    return {
      success: false,
      error: IdentityVerificationError.LICENSE_REQUIRED,
      status: IdentityVerificationStatus.RequiresLicenseUpload,
    };
  }

  if (isVerified(document)) {
    return {
      success: true,
      error: null,
    };
  }

  if (document.permission === SynapsepayDocumentPermission.Closed) {
    return {
      success: false,
      error: IdentityVerificationError.CLOSED_PERMISSION,
      status: IdentityVerificationStatus.Invalid,
    };
  }

  return {
    success: false,
    error: IdentityVerificationError.GENERAL_FAILURE,
    status: IdentityVerificationStatus.Invalid,
  };
}

function isVerified(document: IdentityDocument) {
  const { permission, licenseStatus, ssnStatus } = document;

  const hasValidLicense = licenseStatus === SynapsepayDocumentLicenseStatus.Valid;
  const hasValidSsn = ssnStatus === SynapsepayDocumentSSNStatus.Valid;
  const hasAllRequiredInfo = hasValidLicense || (hasValidSsn && !licenseUploadRequired(document));
  const hasValidPermission = SynapsepayDocumentPermission.SendAndReceive === permission;

  return hasValidPermission && hasAllRequiredInfo;
}

function isUnderReview({ ssnStatus, licenseStatus }: IdentityDocument) {
  return (
    ssnStatus === SynapsepayDocumentSSNStatus.Reviewing ||
    licenseStatus === SynapsepayDocumentLicenseStatus.Reviewing
  );
}

function licenseUploadRequired({
  permission,
  ssnStatus,
  licenseStatus,
  sanctionsScreeningMatch,
  watchlists,
}: IdentityDocument) {
  const noValidLicense =
    !licenseStatus || licenseStatus === SynapsepayDocumentLicenseStatus.Invalid;

  const licenseRequiredForSsnOrSanctions =
    noValidLicense &&
    (ssnStatus === SynapsepayDocumentSSNStatus.Invalid || sanctionsScreeningMatch);

  const licenseRequiredForWatchlist =
    permission === SynapsepayDocumentPermission.Unverified &&
    watchlists === SynapsepayDocumentWatchlists.LicenseUploadRequired;

  return licenseRequiredForWatchlist || licenseRequiredForSsnOrSanctions;
}
