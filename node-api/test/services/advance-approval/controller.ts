import * as request from 'supertest';

import app, { GetAdvanceSummaryPath } from '../../../src/services/advance-approval';
import { clean } from '../../test-helpers';
import factory from '../../factories';
import { User, Advance } from '../../../src/models';
import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';

describe('services/advance-approval/controller', () => {
  before(() => clean());
  afterEach(() => clean());

  describe('GET /advance-summary', () => {
    let user: User;
    beforeEach(async () => {
      user = await factory.create('user');
    });

    it('returns empty response when user has no advances', async () => {
      const { body } = await request(app)
        .get(GetAdvanceSummaryPath)
        .send({ userId: user.id })
        .expect(200);

      expect(body.totalAdvancesTaken).to.eq(0);
      expect(body.outstandingAdvance).to.be.undefined;
    });

    it('returns 400 when userId is not passed', async () => {
      await request(app)
        .get(GetAdvanceSummaryPath)
        .expect(400);
    });

    it('returns 400 when today param is not a date string', async () => {
      await request(app)
        .get(GetAdvanceSummaryPath)
        .send({ userId: 1, today: 'just try and parse me' })
        .expect(400);
    });

    context('when user has past advances', () => {
      let advance: Advance;
      beforeEach(async () => {
        advance = await factory.create<Advance>('advance', {
          userId: user.id,
        });

        await factory.create('advance-tip', {
          advanceId: advance.id,
        });
      });

      it('returns advance summary', async () => {
        const { body } = await request(app)
          .get(GetAdvanceSummaryPath)
          .send({ userId: user.id })
          .expect(200);

        expect(body.totalAdvancesTaken).to.eq(1);
        expect(body.outstandingAdvance.id).to.eq(advance.id);
      });

      it('allows specifying date param for filtering', async () => {
        const { body } = await request(app)
          .get(GetAdvanceSummaryPath)
          .send({
            userId: user.id,
            today: moment()
              .subtract(1, 'day')
              .format(),
          })
          .expect(200);

        expect(body.totalAdvancesTaken).to.eq(0);
        expect(body.outstandingAdvance).to.be.undefined;
      });
    });
  });
});
