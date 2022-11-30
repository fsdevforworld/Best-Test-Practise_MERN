import { isNil } from 'lodash';

const auditLogScreens = [
  'Advance',
  'AdvanceAmount',
  'AdvanceApply',
  'AdvanceDenied',
  'CustomAmount',
  'Email',
  'ExtraCash',
  'SelectDeleteReason',
];

export function shouldAuditLog(appScreen: string, overrideFlag?: boolean): boolean {
  if (isNil(overrideFlag)) {
    return appScreen === undefined || auditLogScreens.includes(appScreen);
  }

  return overrideFlag;
}
