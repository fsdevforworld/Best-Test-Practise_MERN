export default {
  title: 'Recurring transaction schema v2',
  type: 'object',
  required: [
    /* 'id', TODO Add back after we start saving */ '' + 'userDisplayName',
    'transactionDisplayName',
    'userAmount',
    'interval',
    'params',
  ],
  properties: {
    id: { type: 'integer' },
    userDisplayName: { type: 'string' },
    transactionDisplayName: { type: 'string' },
    userAmount: { type: 'number' },
    interval: { type: 'string' },
    params: { type: 'array' },
  },
};
