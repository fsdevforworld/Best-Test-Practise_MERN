import * as sinon from 'sinon';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import {
  HustleCategory,
  HustlePartner,
  HustleCategoryResponse,
  HustleSortOrder,
} from '@dave-inc/wire-typings';
import * as AppcastProvider from '../../../src/domain/hustle/appcast-provider';
import * as SavedHustleDao from '../../../src/domain/hustle/dao/saved-hustle-dao';
import * as SideHustleDao from '../../../src/domain/hustle/dao/side-hustle-dao';
import * as CategoryDao from '../../../src/domain/hustle/dao/category-dao';
import * as JobPackDao from '../../../src/domain/hustle/dao/job-pack-dao';
import * as HustleService from '../../../src/domain/hustle';
import { dogstatsd } from '../../../src/lib/datadog-statsd';
import {
  AppcastInvalidJobIdError,
  AppcastResponseError,
  InvalidParametersError,
  NotFoundError,
} from '../../../src/lib/error';
import logger from '../../../src/lib/logger';
import { InvalidParametersMessageKey, NotFoundMessageKey } from '../../../src/translations';
import { createHustleId } from '../../../src/domain/hustle';
import { HustleSearchResult, HustleCategoryConfig, HustleJobPack } from './types';

describe('Hustle Service', () => {
  const sandbox = sinon.createSandbox();

  const emptySearchResult: HustleSearchResult = {
    page: 0,
    totalPages: 0,
    hustles: [],
  };
  const examples: { [key: string]: HustleService.Hustle } = {
    lyftHustle: {
      name: 'Lyft Driver',
      company: 'Lyft',
      postedDate: null,
      description: 'Driving for Lyft in a pink car.',
      affiliateLink: 'https://www.lyft.com',
      category: HustleCategory.TRANSPORTATION,
      externalId: '123',
      hustlePartner: HustlePartner.Dave,
      isActive: true,
      city: null,
      state: null,
      logo: null,
    },
    paintHustle: {
      name: 'House Painter',
      company: 'Custom Paint Inc',
      description: 'Skilled painter needed, building experience a plus. Full time.',
      affiliateLink: 'fakelink',
      externalId: '124',
      hustlePartner: HustlePartner.Dave,
      category: HustleCategory.CONSTRUCTION,
      isActive: true,
      logo: null,
      city: null,
      state: null,
      postedDate: null,
    },
    bearHustle: {
      name: 'Store Associate',
      company: 'Build a Bear Co',
      description:
        'Part time retail associate, looking for a people person, prior experience a plus.',
      affiliateLink: 'fakelink',
      externalId: '125',
      hustlePartner: HustlePartner.Dave,
      category: HustleCategory.RETAIL,
      isActive: true,
      logo: null,
      city: null,
      state: null,
      postedDate: null,
    },
    driverHustle: {
      name: 'Driver',
      company: 'Unmarked Black SUV Inc',
      postedDate: moment('2019-03-18'),
      description: 'Drive and dont ask questions',
      affiliateLink: 'https://www.blackopsforreal.com',
      category: HustleCategory.TRANSPORTATION,
      externalId: '126',
      hustlePartner: HustlePartner.Appcast,
      isActive: true,
      city: 'New York',
      state: 'NY',
      logo: null,
    },
    airbnbHustle: {
      name: 'Airbnb Host',
      company: 'Airbnb',
      postedDate: moment('2019-07-31'),
      description:
        "Make money hosting your place. You'll want to have at least 1 high quality photo of your place to feature it for a listing.",
      affiliateLink: 'https://www.airbnb.com',
      category: HustleCategory.TRAVEL,
      externalId: '2',
      hustlePartner: HustlePartner.Dave,
      isActive: true,
      logo: null,
      city: null,
      state: null,
    },
  };

  afterEach(() => sandbox.restore());

  describe('Search Hustles', () => {
    it('Should return hustles on page 0 for empty criteria.', async () => {
      const driverHustle = examples.driverHustle;
      const lyftHustle = examples.lyftHustle;

      sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([lyftHustle]);
      sandbox
        .stub(AppcastProvider, 'searchHustles')
        .resolves({ page: 0, totalPages: 1, hustles: [driverHustle] });

      const searchResults = await HustleService.searchHustles({});

      expect(searchResults).to.deep.equal({
        page: 0,
        totalPages: 1,
        hustles: [lyftHustle, driverHustle],
      });
    });

    it('Should return Dave hustles on page 0.', async () => {
      const daveHustle = examples.lyftHustle;
      const appcastHustle = examples.driverHustle;

      sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([daveHustle]);
      sandbox
        .stub(AppcastProvider, 'searchHustles')
        .resolves({ page: 0, totalPages: 1, hustles: [appcastHustle] });

      const searchResults = await HustleService.searchHustles({ page: 0 });

      expect(searchResults).to.deep.equal({
        page: 0,
        totalPages: 1,
        hustles: [daveHustle, appcastHustle],
      });
    });

    it('Should not return Dave hustles on pages > 0', async () => {
      const daveHustle = examples.lyftHustle;
      const appcastHustle = examples.driverHustle;

      sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([daveHustle]);
      sandbox
        .stub(AppcastProvider, 'searchHustles')
        .withArgs({ page: 1 })
        .resolves({ page: 1, totalPages: 2, hustles: [appcastHustle] });

      const searchResults = await HustleService.searchHustles({ page: 1 });

      expect(searchResults).to.deep.equal({ page: 1, totalPages: 2, hustles: [appcastHustle] });
    });

    it('Should return empty results if requested page is greater than total pages.', async () => {
      const daveHustle = examples.lyftHustle;
      const appcastHustle = examples.driverHustle;

      sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([daveHustle]);
      const appcastProviderStub = sandbox.stub(AppcastProvider, 'searchHustles');
      appcastProviderStub
        .withArgs({ page: 0 })
        .resolves({ page: 0, totalPages: 1, hustles: [appcastHustle] });
      appcastProviderStub.withArgs({ page: 1 }).resolves({ page: 1, totalPages: 1, hustles: [] });

      const searchResults = await HustleService.searchHustles({ page: 0 });
      expect(searchResults).to.deep.equal({
        page: 0,
        totalPages: 1,
        hustles: [daveHustle, appcastHustle],
      });

      const page2Results = await HustleService.searchHustles({ page: 1 });
      expect(page2Results).to.deep.equal({ page: 1, totalPages: 1, hustles: [] });
    });

    describe('Search Filters', () => {
      describe('Hustle Partner Filter', () => {
        it('should only return Dave hustles when search criteria specifies', async () => {
          const daveHustle = examples.lyftHustle;
          const appcastHustle = examples.driverHustle;

          sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([daveHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves([appcastHustle]);

          const { hustles } = await HustleService.searchHustles({
            hustlePartner: HustlePartner.Dave,
          });

          expect(hustles).to.deep.equal([daveHustle]);
        });

        it('should only return Appcast hustles when search criteria specifies', async () => {
          const daveHustle = examples.lyftHustle;
          const appcastHustle = examples.driverHustle;

          sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([daveHustle]);
          sandbox
            .stub(AppcastProvider, 'searchHustles')
            .resolves({ page: 0, totalPages: 1, hustles: [appcastHustle] });

          const { hustles } = await HustleService.searchHustles({
            hustlePartner: HustlePartner.Appcast,
          });

          expect(hustles).to.deep.equal([appcastHustle]);
        });
      });

      describe('Category Filter', () => {
        it('should return hustles which match the filter category', async () => {
          const driverHustle = examples.driverHustle;
          const lyftHustle = examples.lyftHustle;
          const airbnbHustle = examples.airbnbHustle;
          sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([lyftHustle, airbnbHustle]);
          sandbox
            .stub(AppcastProvider, 'searchHustles')
            .resolves({ page: 0, totalPages: 1, hustles: [driverHustle] });

          const { hustles } = await HustleService.searchHustles({
            category: HustleCategory.TRANSPORTATION,
          });

          expect(hustles.length).to.equal(2);
          expect(hustles).to.deep.include.members([lyftHustle, driverHustle]);
        });
      });

      describe('Keyword Searches', () => {
        it('Should return Dave hustles matching a keyword from description', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([lyftHustle, paintHustle, bearHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['painter'] });

          expect(hustles).to.deep.equal([paintHustle]);
        });

        it('Should return Dave hustles matching a keyword from company', async () => {
          const paintHustle = examples.paintHustle;
          const bearHustle = examples.bearHustle;
          sandbox.stub(SideHustleDao, 'getActiveDaveHustles').resolves([paintHustle, bearHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['Bear'] });

          expect(hustles).to.deep.equal([bearHustle]);
        });

        it('Should return Dave hustles matching a keyword from job name', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['Driver'] });

          expect(hustles).to.deep.equal([lyftHustle]);
        });

        it('Should return Dave hustles when keyword is upper or lower cased', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['DrIvEr'] });

          expect(hustles).to.deep.equal([lyftHustle]);
        });

        it('Should return Dave hustles on partial keyword matches', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['build'] });

          expect(hustles).to.deep.equals([paintHustle, bearHustle]);
        });

        it('Should return Dave hustles mathing any keyword in the list', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({ keywords: ['pink', 'bear'] });

          expect(hustles.length).to.equal(2);
          expect(hustles).to.deep.include.members([lyftHustle, bearHustle]);
        });

        it('Should return empty list for zero matches.', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({
            keywords: ['abcdefghtkasdlfkadf'],
          });

          expect(hustles).to.be.empty;
        });

        it('Should sanitize keywords to alphanum in case user enters regex chars', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({
            keywords: ['.*', 'abcdefghtkasdlfkadf'],
          });

          expect(hustles).to.be.empty;
        });

        it('Should only return results for keywords of 3 charcters or longer', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').resolves(emptySearchResult);

          const { hustles } = await HustleService.searchHustles({
            keywords: ["drive'a"],
          });

          expect(hustles).to.deep.equals([lyftHustle]);
        });

        it('Should return Dave hustles with message when Appcast is down', async () => {
          const paintHustle = examples.paintHustle;
          const lyftHustle = examples.lyftHustle;
          const bearHustle = examples.bearHustle;
          sandbox
            .stub(SideHustleDao, 'getActiveDaveHustles')
            .resolves([paintHustle, bearHustle, lyftHustle]);
          sandbox.stub(AppcastProvider, 'searchHustles').rejects(new AppcastResponseError());

          const { hustles, message } = await HustleService.searchHustles({
            keywords: ['pink', 'bear'],
          });

          expect(hustles.length).to.equal(2);
          expect(hustles).to.deep.include.members([lyftHustle, bearHustle]);
          expect(message).to.equal(
            "Whoops, Dave wasn't able to load all the current job openings. Please try again in a few minutes.",
          );
        });
      });
    });
  });

  describe('Get Hustle', () => {
    let datadogStub: sinon.SinonStub;
    let loggerStub: sinon.SinonStub;

    beforeEach(() => {
      datadogStub = sandbox.stub(dogstatsd, 'increment');
      loggerStub = sandbox.stub(logger, 'error');
    });

    it('should throw an InvalidParametersError if provider name is invalid', async () => {
      const invalidHustleId = 'NotARealProvider|externalId';
      await expect(HustleService.getHustle(invalidHustleId)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidHustleId,
      );
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledWithExactly('Invalid HustleId', {
        hustleId: invalidHustleId,
      });
    });

    describe('Dave Hustles', () => {
      it('should return a Dave hustle given valid externalId', async () => {
        const daveHustle = examples.airbnbHustle;
        const hustleId = createHustleId(daveHustle);
        sandbox.stub(SideHustleDao, 'getHustle').resolves(daveHustle);
        const hustle = await HustleService.getHustle(hustleId);
        expect(hustle).to.eql(daveHustle);
      });

      it('should throw NotFoundError if no hustle is found', async () => {
        const externalId = 'nonexistentExternalId';
        const hustleId = `${HustlePartner.Dave}|nonexistentExternalId`;
        sandbox.stub(SideHustleDao, 'getHustle').resolves();
        await expect(HustleService.getHustle(hustleId)).to.be.rejectedWith(
          NotFoundError,
          NotFoundMessageKey.HustleExternalIdNotFound,
        );
        expect(datadogStub).to.be.calledOnce;
        expect(loggerStub).to.be.calledWithExactly('Hustle not found by externalId', {
          partner: HustlePartner.Dave,
          externalId,
        });
      });
    });

    describe('Appcast Hustles', () => {
      it('should return an Appcast Hustle given valid externalId', async () => {
        const appcastHustle = examples.driverHustle;
        const hustleId = createHustleId(appcastHustle);
        sandbox.stub(AppcastProvider, 'getHustle').resolves(appcastHustle);
        const hustle = await HustleService.getHustle(hustleId);
        expect(hustle).to.eql(appcastHustle);
      });

      it('should throw a NotFoundError if no hustle is found', async () => {
        const externalId = 'nonexistentExternalId';
        const hustleId = `${HustlePartner.Appcast}|${externalId}`;
        sandbox.stub(AppcastProvider, 'getHustle').rejects(new AppcastInvalidJobIdError());
        await expect(HustleService.getHustle(hustleId)).to.be.rejectedWith(
          NotFoundError,
          NotFoundMessageKey.HustleExternalIdNotFound,
        );
        expect(datadogStub).to.be.calledOnce;
        expect(loggerStub).to.be.calledWithExactly('Hustle not found by externalId', {
          partner: HustlePartner.Appcast,
          externalId,
        });
      });

      it('should propagate any error that is not an instance of AppcastInvalidJobIdError', async () => {
        const hustleId = `${HustlePartner.Appcast}|validExternalId`;
        sandbox.stub(AppcastProvider, 'getHustle').rejects(new Error('Something went wrong!'));
        await expect(HustleService.getHustle(hustleId)).to.be.rejectedWith(
          Error,
          'Something went wrong!',
        );
      });
    });
  });

  describe('Get Saved Hustles', () => {
    it('should return saved hustles in correct shape', async () => {
      const userId = 123456;
      const expectedHustles = Object.values(examples);
      sandbox.stub(SavedHustleDao, 'getHustlesForUser').resolves(expectedHustles);

      const savedHustles = await HustleService.getSavedHustles(userId);

      expect(savedHustles).to.eql(expectedHustles);
    });

    it('should propagate errors', async () => {
      const userId = 123456;
      sandbox.stub(SavedHustleDao, 'getHustlesForUser').rejects(new Error('some error!'));
      const datadogStub = sandbox.stub(dogstatsd, 'increment');
      const loggerStub = sandbox.stub(logger, 'error');
      await expect(HustleService.getSavedHustles(userId)).to.be.rejectedWith(Error, 'some error!');
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledOnce;
    });
  });

  describe('Save / Unsave Hustle', () => {
    let datadogStub: sinon.SinonStub;
    let loggerStub: sinon.SinonStub;

    beforeEach(() => {
      datadogStub = sandbox.stub(dogstatsd, 'increment');
      loggerStub = sandbox.stub(logger, 'error');
    });

    it('successful saveHustle should return updated saved hustles when hustle has an id', async () => {
      const userId = 123456;
      const expectedHustles = Object.values(examples);
      const existingHustleId = 999;
      sandbox
        .stub(SavedHustleDao, 'save')
        .withArgs(userId, existingHustleId)
        .resolves();
      sandbox.stub(SavedHustleDao, 'getHustlesForUser').resolves(expectedHustles);
      sandbox
        .stub(SideHustleDao, 'getSideHustleId')
        .withArgs(HustlePartner.Dave, '123')
        .resolves(existingHustleId);

      const savedHustles = await HustleService.saveHustle(userId, 'DAVE|123');

      expect(savedHustles).to.eql(expectedHustles);
    });

    it('successful saveHustle should return updated saved hustles when appcast hustle has no id, but is valid', async () => {
      const userId = 123456;
      const expectedHustles = Object.values(examples);
      const appcastHustle = examples.driverHustle;
      const externalId = '123';
      sandbox
        .stub(SavedHustleDao, 'save')
        .withArgs(userId, undefined, appcastHustle)
        .resolves(); // wait
      sandbox.stub(SavedHustleDao, 'getHustlesForUser').resolves(expectedHustles);
      sandbox
        .stub(AppcastProvider, 'getHustle')
        .withArgs(externalId)
        .resolves(appcastHustle);
      sandbox
        .stub(SideHustleDao, 'getSideHustleId')
        .withArgs(HustlePartner.Dave, externalId)
        .resolves(undefined);

      const savedHustles = await HustleService.saveHustle(userId, 'APPCAST|123');

      expect(savedHustles).to.eql(expectedHustles);
    });

    it('successful unsaveHustle should return updated saved hustles.', async () => {
      const userId = 123456;
      const expectedHustles = Object.values(examples);
      const existingHustleId = 999;
      sandbox.stub(SideHustleDao, 'getSideHustleId').resolves(existingHustleId);
      sandbox
        .stub(SavedHustleDao, 'unsave')
        .withArgs({ sideHustleId: existingHustleId, userId })
        .resolves();
      sandbox.stub(SavedHustleDao, 'getHustlesForUser').resolves(expectedHustles);

      const savedHustles = await HustleService.unsaveHustle(userId, 'DAVE|123');

      expect(savedHustles).to.eql(expectedHustles);
    });

    it('should throw an error given invalid hustleId to saveHustle', async () => {
      const userId = 1234;
      const invalidHustleId = 'WHATEVER|999';
      await expect(HustleService.saveHustle(userId, invalidHustleId)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidHustleId,
      );
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledWithExactly('Invalid HustleId', {
        hustleId: invalidHustleId,
      });
    });

    it('should throw an error given invalid hustleId to unsaveHustle', async () => {
      const userId = 1234;
      const invalidHustleId = 'INVALID_PROVIDER|123';
      await expect(HustleService.unsaveHustle(userId, invalidHustleId)).to.be.rejectedWith(
        InvalidParametersError,
        InvalidParametersMessageKey.InvalidHustleId,
      );
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledWithExactly('Invalid HustleId', {
        hustleId: invalidHustleId,
      });
    });

    it('should throw an error given nonexistant SideHustle to saveHustle', async () => {
      const userId = 1234;
      const externalId = 'nonexsitent_external_id';
      const hustleId = `${HustlePartner.Dave}|${externalId}`;
      sandbox.stub(SideHustleDao, 'getSideHustleId').resolves(undefined);
      await expect(HustleService.saveHustle(userId, hustleId)).to.be.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.HustleExternalIdNotFound,
      );
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledWithExactly('Hustle not found by externalId', {
        partner: `${HustlePartner.Dave}`,
        externalId,
      });
    });

    it('should throw an error given nonexistant SideHustle to unsaveHustle', async () => {
      const userId = 1234;
      const externalId = 'nonexsitent_external_id';
      const hustleId = `${HustlePartner.Dave}|${externalId}`;
      sandbox.stub(SideHustleDao, 'getSideHustleId').resolves(undefined);
      await expect(HustleService.unsaveHustle(userId, hustleId)).to.be.rejectedWith(
        NotFoundError,
        NotFoundMessageKey.HustleExternalIdNotFound,
      );
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledWithExactly('Hustle not found by externalId', {
        partner: `${HustlePartner.Dave}`,
        externalId,
      });
    });

    it('should propagates errors caught during unsaveHustle call', async () => {
      const userId = 1234;
      sandbox.stub(SideHustleDao, 'getSideHustleId').resolves(1);
      sandbox.stub(SavedHustleDao, 'unsave').rejects(new Error('Something went wrong!'));
      await expect(
        HustleService.unsaveHustle(userId, `${HustlePartner.Appcast}|123`),
      ).to.be.rejectedWith(Error, 'Something went wrong!');
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledOnce;
    });

    it('should propagates errors caught during saveHustle call', async () => {
      const userId = 1234;
      sandbox.stub(SideHustleDao, 'getSideHustleId').resolves(1);
      sandbox.stub(SavedHustleDao, 'save').rejects(new Error('Something went wrong!'));
      await expect(
        HustleService.saveHustle(userId, `${HustlePartner.Appcast}|123`),
      ).to.be.rejectedWith(Error, 'Something went wrong!');
      expect(datadogStub).to.be.calledOnce;
      expect(loggerStub).to.be.calledOnce;
    });
  });

  describe('Get Categories', () => {
    it('should return categories with the correct shape.', async () => {
      const testCategoryConfigs: HustleCategoryConfig[] = [
        { name: HustleCategory.BEAUTY, image: 's3://fakebucket/beauty.jpg', priority: 1 },
        {
          name: HustleCategory.LAW_ENFORCEMENT,
          image: 's3://fakebucket/lawEnforcement.jpg',
          priority: 2,
        },
        { name: HustleCategory.MARKETING, image: 's3://fakebucket/marketing.jpg', priority: 3 },
      ];
      sandbox.stub(CategoryDao, 'getCategories').resolves(testCategoryConfigs);

      const categoryResponses: HustleCategoryResponse[] = await HustleService.getCategories();

      expect(categoryResponses).to.eql(testCategoryConfigs);
    });
  });

  describe('Get Job Packs', () => {
    it('should return job packs with the correct shape.', async () => {
      const testJobPacks: HustleJobPack[] = [
        {
          id: 1,
          name: 'Underwater Jobs',
          image: 's3://fakebucket/underwater.jpg',
          bgColor: 'blue',
          sortBy: 'cpc',
          sortOrder: HustleSortOrder.ASC,
          created: moment().toString(),
          updated: moment.toString(),
        },
        {
          id: 2,
          name: 'Outer Space Jobs',
          image: 's3://fakebucket/space.jpg',
          bgColor: 'purple',
          sortBy: 'distance',
          sortOrder: HustleSortOrder.DESC,
          created: moment().toString(),
          updated: moment.toString(),
        },
      ];
      sandbox.stub(JobPackDao, 'findAll').resolves(testJobPacks);

      const jobPacks: HustleJobPack[] = await HustleService.getJobPacks();

      expect(jobPacks).to.eql(testJobPacks);
    });
  });
});
