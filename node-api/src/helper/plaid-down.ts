import { Config as dbConfig } from '../models';
import braze from '../lib/braze';
import * as envConfig from 'config';

async function showPlaidDownScreen() {
  await dbConfig.update({ value: true }, { where: { key: 'PLAID_DOWN' } });
}

async function hidePlaidDownAndSendNotifications() {
  await dbConfig.update({ value: false }, { where: { key: 'PLAID_DOWN' } });

  // The Plaid Down campaign is configured, through the braze dashboard, to filter to users that have the plaid down attribute
  // To prevent duplicate notifcations, the attribute is removed once the user re-opens the app and views the plaid link screen
  const iosCampaign = '' + envConfig.get('braze.plaidDownCampaign.ios');
  const androidCampaign = '' + envConfig.get('braze.plaidDownCampaign.android');

  return Promise.all([
    braze.triggerCampaign({ campaign_id: iosCampaign, broadcast: true }),
    braze.triggerCampaign({ campaign_id: androidCampaign, broadcast: true }),
  ]);
}

export default {
  showPlaidDownScreen,
  hidePlaidDownAndSendNotifications,
};
