import * as request from 'superagent';
import { compact, get, map, orderBy, round, some, toUpper } from 'lodash';
import * as config from 'config';
import {
  Coordinates,
  EmpyrConfig,
  EmpyrMerchant,
  EmpyrOffer,
  EmpyrOfferRewardType,
  ISuperAgentAgent,
} from '../../typings';
import fetchEmpyrAuth from './fetch-empyr-auth';
import fetchRewards from './fetch-rewards';
import { MerchantRewardOffer, OffersPayload } from '@dave-inc/wire-typings';
// tslint:disable-next-line:no-require-imports
import haversine = require('haversine');

const agent = request.agent() as ISuperAgentAgent<request.SuperAgentRequest>;
const empyrConfig: EmpyrConfig = config.get('empyr');

const TEST_EMPYR_IMAGE_URL: string = 'https://test.mogl.com:444';
const VALID_EMPYR_IMAGE_URL: string = 'https://d10ukqbetc2okm.cloudfront.net';

/** We want to try and find a number of offers that are located a reasonable distance from the user */
const OFFER_SEARCH_RADIUS: number = 20;
const EMPYR_RESULTS_SIZE: number = 100;

/** Empyr sends back test urls for their images which are not usable, so in the test environment you have to convert them to their actual urls  */
function fixTestImageUrls(origUrl: string) {
  return origUrl.replace(TEST_EMPYR_IMAGE_URL, VALID_EMPYR_IMAGE_URL);
}

/** Returns the number of dollars to spend to get a free Dave month  */
function calculateFreeMonthSpendRate(offer: EmpyrOffer): number {
  if (offer.rewardType === EmpyrOfferRewardType.PERCENT) {
    // Reward value comes in 5, 10, 20, not .05, .10, .20
    return offer.rewardValue;
  }
  // rewardValue is in cents
  if (offer.rewardType === EmpyrOfferRewardType.FIXED) {
    return 1 / offer.rewardValue;
  }
}

function getDistance(startCoordinates: Coordinates, endCoordinates: Coordinates) {
  if (!startCoordinates) {
    return;
  }

  const miles = haversine(startCoordinates, endCoordinates, {
    unit: 'miles',
  });

  return round(miles, 1);
}

function formatOffers(
  startCoordinates: Coordinates,
  merchants: EmpyrMerchant[],
  supportClickToActivate: boolean,
): MerchantRewardOffer[] {
  const results = compact(
    map(merchants, (merchant: EmpyrMerchant) => {
      if (!supportClickToActivate && some(merchant.offers, offer => offer.requiresActivation)) {
        return;
      }

      const address = merchant.address;

      return {
        id: merchant.id,
        name: merchant.name,
        rating: merchant.rating,
        ratingCount: merchant.ratingCount,
        primaryCategory: merchant.primaryCategory,
        categories: merchant.categories,
        address: `${address.streetAddress}, ${address.city}, ${toUpper(address.state)} ${
          address.postalCode
        }`,
        phoneNumber: merchant.phone,
        distance: getDistance(startCoordinates, {
          latitude: merchant.latitude,
          longitude: merchant.longitude,
        }),
        thumbnailUrl: fixTestImageUrls(merchant.thumbnailUrl),
        images: map(merchant.medias, media => fixTestImageUrls(media.largeUrl)),
        offers: map(merchant.offers, (offer: EmpyrOffer) => {
          return {
            id: offer.id,
            requiresActivation: offer.requiresActivation,
            // Number of dollars to spend to get a free Dave month
            freeMonthSpendRate: calculateFreeMonthSpendRate(offer),
            rewardType: offer.rewardType,
            finePrint: offer.finePrint,
            hasActivated: get(offer, 'link.status') === 'ACTIVE' || !offer.requiresActivation,
          };
        }),
      };
    }),
  );

  if (startCoordinates) {
    return orderBy(results, ['distance']);
  }

  return results;
}

/** Check API integration guidebook here for details:
 * https://drive.google.com/a/dave.com/file/d/1Dpm0JY6pzE28ixEwybRSSzPF9pUfTg7k/view?usp=sharing
 */
export default async function fetchOffers(
  userId: number,
  location?: string,
  searchLatitude?: number,
  searchLongitude?: number,
  userLatitude?: number,
  userLongitude?: number,
  category?: string,
  distance: number = OFFER_SEARCH_RADIUS,
  supportClickToActivate: boolean = true,
): Promise<OffersPayload> {
  const url: string = `${empyrConfig.url}api/v2/venues/search`;
  const auth = await fetchEmpyrAuth(userId);

  let offerRequest = agent
    .post(url)
    .set('Accept', 'application/json')
    .query({ client_id: empyrConfig.clientId })
    .retry()
    .field('access_token', auth.accessToken)
    .field('distance', distance)
    .field('numResults', EMPYR_RESULTS_SIZE)
    .field('checkLinks', 1);

  let startLocation;

  if (searchLatitude && searchLongitude) {
    offerRequest = offerRequest.field('lat', searchLatitude).field('long', searchLongitude);
    startLocation = {
      latitude: searchLatitude,
      longitude: searchLongitude,
    };
  } else if (userLatitude && userLongitude) {
    offerRequest = offerRequest.field('lat', userLatitude).field('long', userLongitude);
    startLocation = {
      latitude: userLatitude,
      longitude: userLongitude,
    };
  } else if (location) {
    offerRequest = offerRequest.field('queryLocation', location);
  }

  if (category) {
    offerRequest = offerRequest.field('categories', [category]);
  }

  const [response, userReward] = await Promise.all([offerRequest, fetchRewards(userId)]);

  const formattedOffers: MerchantRewardOffer[] = formatOffers(
    startLocation,
    response.body.response.results.results,
    supportClickToActivate,
  );

  return {
    offers: formattedOffers,
    userReward,
    auth: {
      clientId: auth.clientId,
      userToken: auth.userToken,
    },
  };
}
