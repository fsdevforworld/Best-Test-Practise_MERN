import { UserFeedback } from '../../src/models';

export default function(factory: any) {
  factory.define('user-feedback', UserFeedback, {
    userId: 1,
    feedback: 'Test feedback',
    contextId: 'Test Context Id',
  });
}
