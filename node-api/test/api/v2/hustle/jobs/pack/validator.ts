import { HustlePartner } from '@dave-inc/wire-typings';
import { expect } from 'chai';
import * as sinon from 'sinon';
import factory from '../../../../../factories';
import {
  validateJobPackData,
  validateJobPackExistence,
} from '../../../../../../src/api/v2/hustle/jobs/pack/validator';
import { IDaveRequest } from '../../../../../../src/typings';
import { NotFoundError } from './../../../../../../src/lib/error';
import { InvalidParametersError } from '../../../../../../src/lib/error';
import {
  InvalidParametersMessageKey,
  NotFoundMessageKey,
} from '../../../../../../src/translations';
import { SIDE_HUSTLE_SORT_FIELDS } from '../../../../../../src/api/v2/side-hustle/jobs/constants';
import { HustleJobPack } from '../../../../../../src/models';
/* tslint:disable-next-line:no-require-imports */
import MockExpressRequest = require('mock-express-request');

describe('Hustle Job Pack Validator', () => {
  const sandbox = sinon.createSandbox();

  describe('validateJobPackData', () => {
    it('should not throw any errors if validation passes', () => {
      const req = new MockExpressRequest({
        body: {
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortOrder: 'asc',
          sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
          providers: [HustlePartner.Dave, HustlePartner.Appcast],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        },
      });

      expect(() => validateJobPackData(req as IDaveRequest)).to.not.throw();
    });

    it('should throw an InvalidParameters error if one of the required fields is missing', () => {
      const req = new MockExpressRequest({
        body: {
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortOrder: 'asc',
          providers: [HustlePartner.Dave, HustlePartner.Appcast],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        },
      });

      expect(() => validateJobPackData(req as IDaveRequest)).to.throw(
        InvalidParametersError,
        InvalidParametersMessageKey.BaseInvalidParametersError,
      );
    });

    it('should throw an InvalidParameters error if sort by value is invalid', () => {
      const req = new MockExpressRequest({
        body: {
          name: 'Lyft Driver Job Pack',
          searchTerms: [
            { term: 'keyword', value: 'driver' },
            { term: 'employer', value: 'lyft' },
          ],
          sortOrder: 'asc',
          sortBy: 'jeff',
          providers: [HustlePartner.Dave, HustlePartner.Appcast],
          image: '0xaaaaaa',
          bgColor: 'ff0000',
        },
      });

      expect(() => validateJobPackData(req as IDaveRequest)).to.throw(
        InvalidParametersError,
        `jeff is invalid for sorting Dave side hustles, only the following parameters are valid: ${SIDE_HUSTLE_SORT_FIELDS}`,
      );
    });
  });

  describe('validateJobPackExistence', () => {
    afterEach(() => sandbox.restore());

    it('should not throw any errors if validation passes', async () => {
      const hustleJobPack = await factory.build<HustleJobPack>('hustle-job-pack', {
        sortBy: SIDE_HUSTLE_SORT_FIELDS[0],
      });

      sandbox.stub(HustleJobPack, 'findByPk').resolves(hustleJobPack);

      await expect(validateJobPackExistence(1)).to.not.throw;
    });

    it('should throw a NotFoundError if we can not find a HustleJobPack with the given id', async () => {
      sandbox.stub(HustleJobPack, 'findByPk').resolves(null);

      await expect(validateJobPackExistence(1)).to.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.HustleJobPackNotFound,
      );
    });
  });
});
