import * as Bluebird from 'bluebird';
import { Config, SubscriptionBillingPromotion } from '../../src/models';

export async function up() {
  const covid19JobLossConfig = await Config.findAll({
    where: {
      key: 'COVID_19_JOBLOSS',
    },
  });

  if (covid19JobLossConfig.length === 0) {
    await Config.create({
      key: 'COVID_19_JOBLOSS',
      value: { enabled: true },
    });
  }

  const covid19SubscriptionBillingPromotion = await SubscriptionBillingPromotion.findAll({
    where: {
      code: 'COVID_19_JOBLOSS',
    },
  });

  if (covid19SubscriptionBillingPromotion.length === 0) {
    await SubscriptionBillingPromotion.create({
      description: 'COVID-19 jobloss help',
      code: 'COVID_19_JOBLOSS',
      months: 2,
    });
  }
}

export async function down() {
  const config = await Config.findAll({
    where: { key: 'COVID_19_JOBLOSS' },
  });
  await Bluebird.map(config, c => c.destroy({ force: true }));

  const promos = await SubscriptionBillingPromotion.findAll({
    where: { code: 'COVID_19_JOBLOSS' },
  });
  await Bluebird.map(promos, p => p.destroy({ force: true }));
}
