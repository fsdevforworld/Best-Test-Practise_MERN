import { action } from 'typesafe-actions';

import { APIClientAction, APIError } from 'store/api-client-middleware';

type SubmitOnboardingStepResponse = string[];

export type SubmitOnboardingStepType = (step: string) => Promise<SubmitOnboardingStepResponse>;

export const submitOnboardingStepLoad = () => action('SUBMIT_ONBOARDING_STEP_LOAD');
export const submitOnboardingStepSuccess = (response: SubmitOnboardingStepResponse) =>
  action('SUBMIT_ONBOARDING_STEP_SUCCESS', response);
export const submitOnboardingStepFail = (err: APIError) =>
  action('SUBMIT_ONBOARDING_STEP_FAIL', err);

export function submitOnboardingStep(step: string): APIClientAction<SubmitOnboardingStepResponse> {
  return {
    actions: [submitOnboardingStepLoad, submitOnboardingStepSuccess, submitOnboardingStepFail],
    promise: (client) =>
      client.post('/v2/onboarding_step', {
        data: { step },
      }),
  };
}
