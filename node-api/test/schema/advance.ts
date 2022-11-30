export default {
  title: 'Advance schema v2',
  type: 'array',
  items: {
    type: 'object',
    required: [
      'id',
      'amount',
      'created',
      'tip',
      'tipPercent',
      'fee',
      'outstanding',
      'disbursementStatus',
      'payments',
      'network',
      'isExperimental',
      'destination',
    ],
    properties: {
      id: { type: 'integer' },
      amount: { type: 'number' },
      created: { type: 'string' },
      tip: { type: 'number' },
      tipPercent: { type: 'integer' },
      fee: { type: 'number' },
      outstanding: { type: 'number' },
      disbursementStatus: { type: 'string' },
      delivery: { type: ['string', 'null'] },
      destination: {
        type: 'object',
        properties: {
          displayName: { type: ['string', 'null'] },
          lastFour: { type: 'string' },
          scheme: { type: 'string' },
        },
        required: ['displayName', 'lastFour'],
      },
      network: {
        type: ['object', 'null'],
        required: ['approvalCode', 'settlementNetwork', 'networkId'],
        properties: {
          approvalCode: { type: 'string' },
          networkId: { type: 'string' },
          settlementNetwork: { type: 'string' },
        },
      },
      payments: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'amount', 'status'],
          properties: {
            id: { type: 'integer' },
            amount: { type: 'number' },
            status: { type: 'string' },
          },
        },
      },
      isExperimental: { type: 'boolean' },
    },
  },
};
