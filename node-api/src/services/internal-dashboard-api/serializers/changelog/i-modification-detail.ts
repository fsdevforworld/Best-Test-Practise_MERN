import IDetail from './i-detail';
import DetailDataType from './detail-data-type';

interface IModificationDetail extends IDetail {
  type: 'modification';
  attributes: {
    name: string;
    currentValue: unknown;
    previousValue: unknown;
    dataType?: DetailDataType;
  };
}

export default IModificationDetail;
