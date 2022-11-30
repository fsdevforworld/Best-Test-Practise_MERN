import merchantInfo from './merchant-info';

export default {
  title: 'Bank transactions schema v2',
  type: 'array',
  items: {
    type: 'object',
    required: ['id', 'amount', 'date', 'displayName'],
    properties: {
      id: { type: 'integer' },
      amount: { type: 'number' },
      date: { type: 'string' },
      displayName: { type: 'string' },
      merchantInfo,
    },
  },
};
