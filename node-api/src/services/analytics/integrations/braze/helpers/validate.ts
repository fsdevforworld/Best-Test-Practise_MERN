import { snakeCase, transform, omitBy, isNil } from 'lodash';
import { moment } from '@dave-inc/time-lib';
import { InvalidParametersError } from '@dave-inc/error-types';

import { TrackBody, UserTrackBody } from '../../../types';
import { BrazeUserAttributes, BrazeCurrency, BrazeEvent, BrazePurchase } from '../types';

export default function validate(body: TrackBody) {
  if (!('userId' in body)) {
    throw new InvalidParametersError(null, {
      required: ['userId'],
      provided: Object.keys(body),
    });
  }

  const purchase = getTrackPurchases(body);
  const attribute = getTrackAttributes(body);
  const event = getTrackEvents(body);

  const attributes = attribute ? [attribute] : null;
  const purchases = purchase ? [purchase] : null;
  const events = purchase ? null : event ? [event] : null;

  const data = omitBy({ attributes, events, purchases }, isNil);
  return transform(data, getSerializeFunction({ transformArrays: true, transformObjects: false }));
}

function getTrackPurchases(body: UserTrackBody): BrazePurchase {
  const time = body.timestamp ?? moment().format();
  if (body.properties?.revenue) {
    const { revenue, ...properties } = body.properties;
    return {
      externalId: String(body.userId),
      productId: body.event,
      time,
      price: Number(revenue),
      currency: BrazeCurrency.USA,
      properties,
    };
  }
  return null;
}

function getTrackAttributes(body: UserTrackBody): BrazeUserAttributes {
  const traits = body.context?.traits;
  if (traits) {
    return Object.keys(traits).reduce<BrazeUserAttributes>(
      (acc, key) => {
        if (key === 'birthday') {
          acc.dob = moment(traits[key]).format('YYYY-MM-DD');
        } else if (key === 'avatar') {
          acc.imageUrl = traits[key];
        } else if (key === 'address') {
          const { city, country } = traits[key];
          if (city) {
            acc.homeCity = city;
          }
          if (country) {
            acc.country = country;
          }
        } else {
          acc[key] = traits[key];
        }
        return acc;
      },
      { externalId: String(body.userId) },
    );
  }

  return null;
}

function getTrackEvents(body: UserTrackBody): BrazeEvent {
  const event = body.event;
  const time = body.timestamp ?? moment().format();
  return omitBy<BrazeEvent>(
    {
      externalId: String(body.userId),
      name: event,
      time,
      properties: body.properties,
    },
    isNil,
  ) as BrazeEvent;
}

function getSerializeFunction(options: { transformObjects?: boolean; transformArrays?: boolean }) {
  const { transformObjects, transformArrays } = options;
  return function serialize(result: { [key: string]: any }, value: any, key: string) {
    function getValue() {
      if (moment.isMoment(value)) {
        return value.format();
      } else if (Array.isArray(value) && transformArrays) {
        return value.map(a => (typeof a === 'object' ? transform(a, serialize) : a));
      } else if (typeof value === 'object' && transformObjects) {
        return transform(value, serialize);
      }
      return value;
    }

    const snakeCaseExcludes = ['AND', 'OR'];
    const resultKey = snakeCaseExcludes.indexOf(key) === -1 ? snakeCase(key) : key;
    result[resultKey] = getValue();
    return result;
  };
}
