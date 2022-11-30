import { PaymentMethodType } from '@dave-inc/loomis-client';
import { IApiResourceObject } from '../../../../typings';

interface IPaymentMethodResource extends IApiResourceObject {
  type: 'payment-method';
  attributes: {
    created: string;
    deleted: string | null;
    displayName: string;
    invalid: string | null;
    type: PaymentMethodType;
  };
}

export default IPaymentMethodResource;
