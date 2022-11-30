import { DefaultAdapter } from 'factory-girl';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'external-payment');
  factory.define('external-payment', Object, {
    id: factory.sequence((n: any) => `external-${n}`),
    type: 'ach',
    status: 'COMPLETED',
    amount: 1,
    processor: 'RISEPAY',
    chargeable: factory.assoc('checking-account'),
  });
}
