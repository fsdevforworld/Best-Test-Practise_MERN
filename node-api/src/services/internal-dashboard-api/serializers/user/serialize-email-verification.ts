import { EmailVerification } from '../../../../models';
import { serializeDate } from '../../../../serialization';

import { IApiResourceObject } from '../../../../typings';
import serialize from '../serialize';

export interface IEmailVerificationResource extends IApiResourceObject {
  attributes: {
    userId: number;
    email: string;
    verified: string;
    created: string;
    updated: string;
  };
}

const serializeEmailVerification: serialize<EmailVerification, IEmailVerificationResource> = async (
  emailVerification: EmailVerification,
) => {
  return {
    id: `${emailVerification.id}`,
    type: 'email-verification',
    attributes: {
      userId: emailVerification.userId,
      email: emailVerification.email,
      verified: serializeDate(emailVerification.verified),
      created: serializeDate(emailVerification.created),
      updated: serializeDate(emailVerification.updated),
    },
  };
};

export default serializeEmailVerification;
