import { get, toString } from 'lodash';

export const CUSTOM_ERROR_CODES = {
  INVALID_VERIFICATION_CODE_ERROR: '200',
  MESSAGES_UNSUBSCRIBED_ERROR: '201',
  DELETED_ACCOUNT_TOO_SOON_ERROR: '202',
  BANK_CONNECTION_PLAID_ERROR: '300',
  CONFLICT_ERROR_STATUS_CODE: '409',
  UNSUPPORTED_PLAID_ITEM_ERROR_STATUS_CODE: '422',
  DEFAULT_ERROR: '500',
  MICRODEPOSIT_REQUIRED_ERROR_CODE: 'microdeposit_required',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorToString(error: any, clipErrorId: boolean = false): string {
  let output;
  if (error === undefined) {
    output = 'Unknown Error';
  } else if (typeof error === 'string') {
    output = error;
  } else if (
    error.response &&
    error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    output = error.response.data.message;
  } else if (typeof error.reason === 'string') {
    output = error.reason;
  } else {
    output = 'Oops, something went wrong.';
  }
  if (clipErrorId) {
    const match = output.match(/(.+?)\nConfused\? Send us this error ID: .+$/);
    if (match) {
      [, output] = match;
    }
  }
  return output;
}

export function getErrorStatus(error: any) {
  const status = get(error, 'response.status');
  return toString(status);
}

export function getErrorCode(error: any) {
  const code = get(error, 'response.data.customCode');
  return toString(code);
}
