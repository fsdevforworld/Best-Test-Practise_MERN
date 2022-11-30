import { moment } from '@dave-inc/time-lib';
import { HustleCategory, HustlePartner } from '@dave-inc/wire-typings';
import * as sinon from 'sinon';
import { expect } from 'chai';
import factory from '../../../factories';
import { clean } from '../../../test-helpers';
import { Hustle } from '../../../../src/domain/hustle';
import * as SideHustleDao from '../../../../src/domain/hustle/dao/side-hustle-dao';
import { SideHustle, SideHustleCategory } from '../../../../src/models';

describe('Side Hustle Dao', () => {
  const sandbox = sinon.createSandbox();
  let appcastHustle: SideHustle;
  let activeDaveHustle: SideHustle;
  let inactiveDaveHustle: SideHustle;
  let technologyCategory: SideHustleCategory;

  before(async () => {
    await clean(sandbox);
    technologyCategory = await factory.create('side-hustle-category', {
      name: HustleCategory.TECHNOLOGY,
    });

    const [
      activeDaveHustlePromise,
      appcastHustlePromise,
      inactiveDaveHustlePromise,
    ] = await Promise.all([
      factory.create<SideHustle>('side-hustle', {
        id: 2,
        name: 'Widget Maker',
        company: 'Amazon',
        postedDate: moment('2020-03-18'),
        description: 'To be the maker of widgets.',
        affiliateLink: 'https://www.example.com',
        externalId: '98765',
        city: null,
        state: null,
        isActive: true,
        partner: HustlePartner.Dave,
        sideHustleCategoryId: technologyCategory.id,
        logo: 'https://logo.com',
      }),
      factory.create<SideHustle>('side-hustle', {
        id: 3,
        name: 'some appcast hustle',
        partner: HustlePartner.Appcast,
        externalId: '867318',
        city: 'Austin',
      }),
      factory.create<SideHustle>('side-hustle', {
        id: 1,
        name: 'inactive, bro',
        isActive: false,
        partner: HustlePartner.Dave,
        sideHustleCategoryId: technologyCategory.id,
      }),
    ]);
    activeDaveHustle = activeDaveHustlePromise;
    appcastHustle = appcastHustlePromise;
    inactiveDaveHustle = inactiveDaveHustlePromise;
  });

  after(() => clean(sandbox));

  describe('getActiveDaveHustles', () => {
    it('should get active Dave hustles.', async () => {
      const expectedHustle: Hustle = {
        name: 'Widget Maker',
        company: 'Amazon',
        postedDate: moment('2020-03-18 00:00:00'),
        description: 'To be the maker of widgets.',
        affiliateLink: 'https://www.example.com',
        category: HustleCategory.TECHNOLOGY,
        externalId: '98765',
        hustlePartner: HustlePartner.Dave,
        isActive: true,
        logo: 'https://logo.com',
        city: null,
        state: null,
      };
      const results = await SideHustleDao.getActiveDaveHustles();
      expect(results.length, 'Expected single result').to.equal(1);
      expect(results).to.deep.equal([expectedHustle]);
    });
  });

  describe('getHustle', () => {
    it('should return Dave Hustle', async () => {
      const expectedHustle: Hustle = {
        name: 'Widget Maker',
        company: 'Amazon',
        postedDate: moment('2020-03-18 00:00:00'),
        description: 'To be the maker of widgets.',
        affiliateLink: 'https://www.example.com',
        category: HustleCategory.TECHNOLOGY,
        externalId: activeDaveHustle.externalId,
        hustlePartner: HustlePartner.Dave,
        isActive: true,
        city: null,
        state: null,
        logo: 'https://logo.com',
      };
      const hustle = await SideHustleDao.getHustle(HustlePartner.Dave, activeDaveHustle.externalId);
      expect(hustle).to.eql(expectedHustle);
    });

    it('should return null if no Hustle found', async () => {
      const externalId = '867318'; // simulate Dave + Appcast externalId collision
      const result = await SideHustleDao.getHustle(HustlePartner.Dave, externalId);
      expect(result).to.be.null;
    });
  });

  describe('getSideHustleId', () => {
    it('should return the id of an active SideHustle', async () => {
      const sideHustleId = await SideHustleDao.getSideHustleId(
        HustlePartner.Appcast,
        appcastHustle.externalId,
      );
      expect(sideHustleId).to.equal(appcastHustle.id);
    });

    it('should return the id of an inactive SideHustle given flag', async () => {
      const sideHustleId = await SideHustleDao.getSideHustleId(
        inactiveDaveHustle.partner,
        inactiveDaveHustle.externalId,
        { includeExpired: true },
      );
      expect(sideHustleId).to.eql(inactiveDaveHustle.id);
    });

    it('should return undefined if no SideHustle exists', async () => {
      const sideHustleId = await SideHustleDao.getSideHustleId(
        inactiveDaveHustle.partner,
        inactiveDaveHustle.externalId,
      );
      expect(sideHustleId).to.be.undefined;
    });
  });

  describe('findOrCreateAppcastHustle', () => {
    it('should create new side hustle row', async () => {
      const hustle: Hustle = {
        city: 'Dallas',
        company: 'Dallas Company',
        externalId: 'externalId',
        hustlePartner: HustlePartner.Appcast,
        isActive: true,
        name: 'Dallas Job',
        logo: null,
        state: null,
        postedDate: moment(),
        description: 'some description',
        affiliateLink: 'link',
        category: HustleCategory.TRAVEL,
      };
      const [sideHustle] = await SideHustleDao.findOrCreateAppcastHustle(hustle);
      expect(sideHustle.id).not.to.be.null;
    });
  });
});
