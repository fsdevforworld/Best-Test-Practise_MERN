import { AdvanceRuleLog } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';

interface IAdvanceRuleLogResource extends IApiResourceObject {
  type: 'advance-rule-log';
  attributes: {
    name: string;
    nodeName: string;
    success: boolean;
    created: string;
    data: object;
    error: string;
  };
}

const serializeAdvanceRuleLog: serialize<AdvanceRuleLog, IAdvanceRuleLogResource> = async (
  ruleLog: AdvanceRuleLog,
) => {
  return {
    type: 'advance-rule-log',
    id: `${ruleLog.id}`,
    attributes: {
      name: ruleLog.ruleName,
      nodeName: ruleLog.nodeName,
      success: ruleLog.success,
      created: serializeDate(ruleLog.created),
      data: typeof ruleLog.data === 'string' ? JSON.parse(ruleLog.data) : ruleLog.data, // raw query not mapping to JSON correctly
      error: ruleLog.error,
    },
  };
};

export { IAdvanceRuleLogResource };
export default serializeAdvanceRuleLog;
