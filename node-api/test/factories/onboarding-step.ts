import { OnboardingStep } from '../../src/models';

export default function(factory: any) {
  factory.define('onboarding-step', OnboardingStep, {
    userId: factory.assoc('user', 'id'),
    step: 'BiometricOnboarding',
  });
}
