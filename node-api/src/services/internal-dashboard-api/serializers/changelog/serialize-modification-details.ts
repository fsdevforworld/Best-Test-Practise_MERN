import { IDashboardModification } from '../../../../typings';
import DetailDataType from './detail-data-type';
import IModificationDetail from './i-modification-detail';

const dataTypesByName: Record<string, DetailDataType> = {
  advanceOutstanding: 'dollar',
  phoneNumber: 'phone-number',
  birthdate: 'date',
  deleted: 'date',
  paybackDate: 'date',
  tipPercent: 'percent',
  tipAmount: 'dollar',
  fee: 'dollar',
  outstanding: 'dollar',
};

function getDataType(name: string): DetailDataType {
  return dataTypesByName[name] || 'string';
}

type Options = {
  modificationNames?: Record<string, string>;
};

function serializeModificationDetails(
  modification: IDashboardModification,
  options?: Options,
): IModificationDetail[] {
  return Object.entries(modification).map(([name, { previousValue, currentValue }]) => ({
    type: 'modification',
    attributes: {
      name: options?.modificationNames[name] || name,
      previousValue,
      currentValue,
      dataType: getDataType(name),
    },
  }));
}

export { Options };
export default serializeModificationDetails;
