import { expect } from 'chai';
import factory from '../../../factories';
import { clean, getHustleIdForSavedJob } from '../../../test-helpers';
import { createHustleId } from '../../../../src/domain/hustle';
import * as SavedHustleDao from '../../../../src/domain/hustle/dao/saved-hustle-dao';
import { SideHustle, SideHustleSavedJob, User } from '../../../../src/models';

describe('Saved Hustle Dao', () => {
  describe('getHustlesForUser', () => {
    let savedJobsForUser: SideHustleSavedJob[];
    let user: User;

    before(async () => {
      await clean();
      const [user1, user2] = await Promise.all([
        factory.create<User>('user'),
        factory.create<User>('user'),
      ]);

      const [savedHustle1ForUser1, savedHustle2ForUser1, savedHustle3ForUser1] = await Promise.all([
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user1.id,
        }),
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user1.id,
        }),
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user1.id,
        }),
      ]);
      await Promise.all([
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user2.id,
          sideHustleId: savedHustle1ForUser1.sideHustleId,
        }),
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user2.id,
          sideHustleId: savedHustle2ForUser1.sideHustleId,
        }),
      ]);
      user = user1;
      savedJobsForUser = [savedHustle1ForUser1, savedHustle2ForUser1, savedHustle3ForUser1];
    });

    after(() => clean());

    it('should return saved hustles for user', async () => {
      const results = await SavedHustleDao.getHustlesForUser(user.id);
      expect(results.length).to.equal(savedJobsForUser.length);
      const expectedHustleIds = await Promise.all(
        savedJobsForUser.map(async saved => await getHustleIdForSavedJob(saved)),
      );
      results.forEach(saved => {
        expect(expectedHustleIds).to.include(createHustleId(saved));
      });
    });

    it('returns empty array if there are no saved hustles', async () => {
      const userWithNoSavedJobs = await factory.create('user');
      const results = await SavedHustleDao.getHustlesForUser(userWithNoSavedJobs.id);
      expect(results).to.be.empty;
    });
  });

  describe('unsave', () => {
    let user1: User;
    let user2: User;
    let sideHustle: SideHustle;
    let savedHustleForUser1: SideHustleSavedJob;
    let savedHustleForUser2: SideHustleSavedJob;

    before(async () => {
      await clean();
      const [user1Promise, user2Promise, sideHustlePromise] = await Promise.all([
        factory.create<User>('user'),
        factory.create<User>('user'),
        factory.create<SideHustle>('side-hustle'),
      ]);
      user1 = user1Promise;
      user2 = user2Promise;
      sideHustle = sideHustlePromise;

      const [savedHustleForUser1Promise, savedHustleForUser2Promise] = await Promise.all([
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user1.id,
          sideHustleId: sideHustlePromise.id,
        }),
        factory.create<SideHustleSavedJob>('side-hustle-saved-job', {
          userId: user2.id,
          sideHustleId: sideHustlePromise.id,
        }),
      ]);
      savedHustleForUser1 = savedHustleForUser1Promise;
      savedHustleForUser2 = savedHustleForUser2Promise;
    });

    after(() => clean());

    it('unsaves a hustle', async () => {
      await SavedHustleDao.unsave({ sideHustleId: sideHustle.id, userId: user1.id });
      const unsavedHustle = await SideHustleSavedJob.findByPk(savedHustleForUser1.id);
      expect(unsavedHustle).to.not.exist;
    });

    it('does not throw an error when saved job row does not exist', async () => {
      await expect(
        SavedHustleDao.unsave({
          userId: user1.id,
          sideHustleId: savedHustleForUser2.id,
        }),
      ).to.not.be.rejected;
    });
  });
});
