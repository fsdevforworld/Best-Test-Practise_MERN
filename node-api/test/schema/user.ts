export default {
  title: 'User schema v2',
  type: 'object',
  required: [
    'phoneNumber',
    'token',
    'tester',
    'identityVerified',
    'coolOffStatus',
    'nextSubscriptionPaymentDate',
    'created',
    'roles',
  ],
  properties: {
    phoneNumber: {
      type: 'string',
    },
    firstName: {
      type: ['string', 'null'],
    },
    lastName: {
      type: ['string', 'null'],
    },
    email: {
      type: ['string', 'null'],
    },
    externalId: {
      type: ['string', 'null'],
    },
    imageUrl: {
      type: ['string', 'null'],
    },
    identityVerified: {
      type: 'boolean',
    },
    identityVerificationStatus: {
      type: 'string',
    },
    coolOffStatus: {
      coolOffDate: { type: ['null', 'string'] },
      isCoolingOff: { type: ['boolean'] },
    },
    nextSubscriptionPaymentDate: {
      type: ['null', 'string'],
    },
    tester: {
      type: 'boolean',
    },
    token: {
      type: 'string',
    },
    hasPassword: {
      type: 'boolean',
    },
    created: {
      type: 'string',
    },
    roles: {
      type: 'array',
    },
  },
};
