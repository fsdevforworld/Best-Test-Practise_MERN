import { Advance, Payment } from '../../src/models';

export default function(factory: any) {
  factory.define(
    'payment',
    Payment,
    {
      advanceId: factory.assoc('advance', 'id'),
      amount: 79.99,
      externalProcessor: 'TABAPAY',
      status: 'COMPLETED',
    },
    {
      afterBuild: async (model: any, attrs: any, buildOptions: any) => {
        if (!model.userId) {
          const advance = await Advance.findByPk(model.advanceId);
          model.userId = model.userId || advance.userId;
        }
        return model;
      },
    },
  );
}
