import { IApiResourceObject, IRawRelationships } from '../../../../typings';
import { User } from '../../../../models';
import { serializeDate } from '../../../../serialization';
import { moment } from '@dave-inc/time-lib';
import { ACTIVE_TIMESTAMP } from '../../../../lib/sequelize';
import serializeRelationships from '../serialize-relationships';
import serialize from '../serialize';

interface IUserResource extends IApiResourceObject {
  attributes: {
    addressLine1: string;
    addressLine2: string;
    allowDuplicateCard: boolean;
    birthdate: string;
    city: string;
    created: string;
    defaultBankAccountId: number;
    deleted: string;
    email: string;
    emailVerified: boolean;
    firstName: string;
    fraud: boolean;
    isSubscribed: boolean;
    lastName: string;
    overrideSixtyDayDelete: boolean;
    daysDeleted: number;
    phoneNumber: string;
    settings: unknown;
    state: string;
    updated: string;
    zipCode: string;
  };
}

const serializeUser: serialize<User, IUserResource> = async (
  user: User,
  relationships?: IRawRelationships,
) => {
  const deletedMoment = moment(user.deleted);
  const daysDeleted = deletedMoment.isBefore(ACTIVE_TIMESTAMP)
    ? moment().diff(deletedMoment, 'days')
    : null;

  return {
    id: `${user.id}`,
    type: 'user',
    attributes: {
      addressLine1: user.addressLine1,
      addressLine2: user.addressLine2,
      allowDuplicateCard: user.allowDuplicateCard,
      birthdate: serializeDate(user.birthdate, 'YYYY-MM-DD'),
      city: user.city,
      created: serializeDate(user.created),
      defaultBankAccountId: user.defaultBankAccountId,
      deleted: serializeDate(user.deleted),
      email: user.email,
      emailVerified: user.emailVerified,
      firstName: user.firstName,
      fraud: user.fraud,
      isSubscribed: user.isSubscribed,
      lastName: user.lastName,
      overrideSixtyDayDelete: user.overrideSixtyDayDelete,
      daysDeleted,
      phoneNumber: user.phoneNumber,
      settings: user.settings,
      state: user.state,
      updated: serializeDate(user.updated),
      zipCode: user.zipCode,
    },
    relationships: serializeRelationships(relationships),
  };
};

export { IUserResource };
export default serializeUser;
