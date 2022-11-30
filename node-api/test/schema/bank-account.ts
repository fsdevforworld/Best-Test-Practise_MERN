export default {
  title: 'Bank accounts schema v2',
  type: 'array',
  items: {
    type: 'object',
    required: [
      'id',
      'bankConnectionId',
      'hasValidCredentials',
      'displayName',
      'current',
      'institution',
    ],
    properties: {
      id: { type: 'integer' },
      displayName: { type: 'string' },
      bankConnectionId: { type: 'integer' },
      hasValidCredentials: { type: 'boolean' },
      available: { type: 'number' },
      current: { type: 'number' },
      approval: {
        type: 'object',
        required: ['incomeNeeded', 'income', 'isSupportOverride'],
        properties: {
          incomeNeeded: { type: 'boolean' },
          income: {
            anyOf: [
              {
                type: 'null',
              },
              {
                type: 'object',
                required: ['date', 'amount', 'displayName'],
              },
            ],
          },
          isSupportOverride: { type: 'boolean' },
        },
      },
      institution: {
        type: 'object',
        required: ['displayName', 'primaryColor'],
        properties: {
          displayName: { type: 'string' },
          logo: { type: ['string', 'null'] },
          primaryColor: { type: 'string' },
        },
      },
      paymentMethod: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            required: ['displayName', 'invalid', 'scheme'],
            properties: {
              displayName: { type: 'string' },
              invalid: { type: ['null', 'string'] },
              scheme: { type: 'string' },
            },
          },
        ],
      },
    },
  },
};
