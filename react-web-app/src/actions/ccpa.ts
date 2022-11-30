import { action } from 'typesafe-actions';

import { APIClientAction, APIError } from 'store/api-client-middleware';

type SubmitCCPARequestResponse = string[];

type SubmitCCPARequestType = {
  firstName: string;
  lastName: string;
  email: string;
  birthdate: string;
  ssn: string;
  requestType: string;
  details: string;
};

export const submitCCPARequestLoad = () => action('SUBMIT_CCPA_REQUEST_LOAD');
export const submitCCPARequestSuccess = (response: SubmitCCPARequestResponse) =>
  action('SUBMIT_CCPA_REQUEST_SUCCESS', response);
export const submitCCPARequestFail = (err: APIError) => action('SUBMIT_CCPA_REQUEST_FAIL', err);

export function submitCCPARequest(
  data: SubmitCCPARequestType,
): APIClientAction<SubmitCCPARequestResponse> {
  return {
    actions: [submitCCPARequestLoad, submitCCPARequestSuccess, submitCCPARequestFail],
    promise: (client) =>
      client.post('/v2/ccpa_request', {
        data,
      }),
  };
}
