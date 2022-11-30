const paymentMethodSchema = {
  title: 'Payment method schema v1',
  type: 'object',
  required: ['payment_type', 'display_name', 'extras', 'payment_source_id'],
  properties: {
    payment_type: { type: 'string' },
    display_name: { type: 'string' },
    payment_source_id: { type: 'number' },
    extras: { type: 'object' },
  },
};

export default paymentMethodSchema;
