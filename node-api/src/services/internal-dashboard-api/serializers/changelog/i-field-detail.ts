import IDetail from './i-detail';
import DetailDataType from './detail-data-type';

interface IFieldDetail extends IDetail {
  type: 'field';
  attributes: {
    name: string;
    value: unknown;
    dataType?: DetailDataType;
  };
}

export default IFieldDetail;
