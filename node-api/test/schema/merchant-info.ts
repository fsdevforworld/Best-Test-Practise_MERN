export default {
  type: 'object',
  required: ['displayName', 'logo', 'url', 'categoryImage'],
  properties: {
    displayName: { type: 'string' },
    logo: { type: 'string' },
    url: { type: 'string' },
    categoryImage: { type: 'string' },
  },
};
