import * as Bluebird from 'bluebird';
import { flatten, uniqBy } from 'lodash';
import { EmailVerification, SynapsepayDocument, User, UserSession } from '../../../../models';
import { Includeable, Op } from 'sequelize';

async function searchUsers(searchTerms: string, limit = 1000) {
  const digits = searchTerms.replace(/\D/g, '');
  const lowerSearch = searchTerms.toLowerCase();
  const isValidNumber = /^\d+$/.test(searchTerms);

  const latestUnverifiedEagerLoad: Includeable = {
    model: EmailVerification,
    order: [['created', 'DESC']],
    limit: 1,
    where: {
      verified: null,
    },
    required: false,
  };

  const attributes = {
    exclude: ['password', 'fcmToken'],
  };

  const results = await Bluebird.props({
    matchesOnUserProps: User.findAll({
      attributes,
      where: {
        [Op.or]: [
          { phoneNumber: [`+1${digits}`, `+${digits}`] },
          {
            phoneNumber: {
              [Op.like]: `${digits}-deleted%`,
            },
          },
          {
            phoneNumber: {
              [Op.like]: `1${digits}-deleted%`,
            },
          },
          {
            phoneNumber: {
              [Op.like]: `+1${digits}-deleted%`,
            },
          },
          {
            phoneNumber: {
              [Op.like]: `+${digits}-deleted%`,
            },
          },
          { lowerEmail: lowerSearch },
          { lowerFullName: lowerSearch },
          { lowerFirstName: lowerSearch },
          { lowerLastName: lowerSearch },
          { ...(isValidNumber ? { id: parseInt(searchTerms, 10) } : {}) },
        ],
      },
      limit,
      include: [latestUnverifiedEagerLoad],
      paranoid: false,
    }),
    matchesOnUnverifiedEmail: User.findAll({
      attributes,
      include: [
        {
          model: EmailVerification,
          order: [['created', 'DESC']],
          where: {
            verified: null,
            email: searchTerms,
          },
        },
      ],
      paranoid: false,
    }),
    matchesOnSynapsepayUserId: User.findAll({
      attributes,
      include: [
        latestUnverifiedEagerLoad,
        {
          model: SynapsepayDocument,
          where: {
            synapsepayUserId: searchTerms,
          },
          paranoid: false,
        },
      ],
      paranoid: false,
    }),
    matchesOnDeviceId: User.findAll({
      attributes,
      include: [
        latestUnverifiedEagerLoad,
        {
          model: UserSession,
          where: {
            deviceId: searchTerms,
          },
          paranoid: false,
        },
      ],
      paranoid: false,
    }),
  });

  return uniqBy(flatten(Object.values(results)), 'id').map(user => ({
    ...user.toJSON(),
    latestUnverifiedEmail:
      user.emailVerifications?.length > 0 ? user.emailVerifications[0].email : null,
  }));
}

export default searchUsers;
