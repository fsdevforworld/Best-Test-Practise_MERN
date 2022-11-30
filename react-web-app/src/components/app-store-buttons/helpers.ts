import { getParams } from 'lib/urls';

export function getAppStoreUrl(url: string) {
  // `c` is for campaign, and is deliberately kept short to obfuscate in the URL
  // We pass this into AppsFlyer OneLinks for attribution
  const { c } = getParams(window.location.search);
  if (c) {
    return `${url}?c=${sanitizeCampaign(c)}`;
  }
  return url;
}

function sanitizeCampaign(campaign: string) {
  return campaign.replace(/[^\w-]+/g, '');
}
