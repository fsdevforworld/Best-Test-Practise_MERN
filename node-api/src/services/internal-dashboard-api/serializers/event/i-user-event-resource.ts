import { IApiResourceObject } from '../../../../typings';

interface IUserEventResource extends IApiResourceObject {
  type: 'user-event';
  attributes: {
    created: string;
    extra: unknown;
    message: string;
    name: string;
    successful: boolean;
  };
}

export default IUserEventResource;
