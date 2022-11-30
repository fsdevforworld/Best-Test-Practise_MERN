import { DefaultAdapter } from 'factory-girl';

export default function(factory: any) {
  factory.setAdapter(new DefaultAdapter(), 'pub-sub-event');
  factory.define('pub-sub-event', Object, {
    publishTime: () => new Date(),
    data: {},
    ack: () => noOp,
    nack: () => noOp,
  });
}

function noOp() {}
