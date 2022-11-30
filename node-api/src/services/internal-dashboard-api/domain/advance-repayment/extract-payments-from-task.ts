import { flatMap } from 'lodash';
import { TaskInterleaved } from '../../../../lib/tivan-client';

function extractPaymentsFromTask(task: TaskInterleaved) {
  return flatMap(task.taskPaymentMethods, paymentMethod => paymentMethod.taskPaymentResults);
}

export default extractPaymentsFromTask;
