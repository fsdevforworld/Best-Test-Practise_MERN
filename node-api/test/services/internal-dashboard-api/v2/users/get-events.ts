import * as request from 'supertest';
import { clean, withInternalUser } from '../../../../test-helpers';
import app from '../../../../../src/services/internal-dashboard-api';
import factory from '../../../../factories';
import { expect } from 'chai';
import { IUserEventResource } from '../../serializers/event';
import { serializeDate } from '../../../../../src/serialization';
import * as qs from 'qs';
import { moment } from '@dave-inc/time-lib';

describe('GET /v2/users/:id/events', () => {
  before(() => clean());
  afterEach(() => clean());

  let userId: number;
  let req: request.Test;

  beforeEach(async () => {
    ({ id: userId } = await factory.create('user'));

    req = request(app)
      .get(`/v2/users/${userId}/events`)
      .expect(200);
  });

  describe('Audit log events', () => {
    it('Serializes audit log', async () => {
      const auditLog = await factory.create('audit-log', {
        userId,
        type: 'TAX_FRAUD',
        message: 'Bad!',
        extra: { hi: 'ho' },
        successful: true,
      });

      await auditLog.reload();

      const {
        body: { data },
      } = await withInternalUser(req);

      const [serializedAuditLog] = data;

      expect(serializedAuditLog.id).to.equal(`audit-log-${auditLog.id}`);
      expect(serializedAuditLog.type).to.equal('user-event');
      expect(serializedAuditLog.attributes).to.deep.equal({
        created: serializeDate(auditLog.created),
        name: 'TAX_FRAUD',
        message: 'Bad!',
        extra: { hi: 'ho' },
        successful: true,
      });
    });

    it('Returns all audit log events for user', async () => {
      const [auditLog1, auditLog2] = await Promise.all([
        factory.create('audit-log', { userId }),
        factory.create('audit-log', { userId }),
      ]);

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(2);
      expect(data.map((event: IUserEventResource) => event.id)).to.include(
        `audit-log-${auditLog1.id}`,
        `audit-log-${auditLog2.id}`,
      );
    });

    it('Filters by name (type)', async () => {
      const [matchingAuditLog] = await Promise.all([
        factory.create('audit-log', { userId, type: 'EXACT_MATCH' }),
        factory.create('audit-log', { userId, type: 'NO_MATCH' }),
      ]);

      const query = {
        filter: {
          name: { in: ['EXACT_MATCH'] },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${matchingAuditLog.id}`);
    });

    it('Filters by multiple names (type)', async () => {
      const [matchingAuditLog1, matchingAuditLog2] = await Promise.all([
        factory.create('audit-log', { userId, type: 'EXACT_MATCH' }),
        factory.create('audit-log', { userId, type: 'OTHER_EXACT_MATCH' }),
        factory.create('audit-log', { userId, type: 'NO_MATCH' }),
      ]);

      const query = {
        filter: {
          name: { in: ['EXACT_MATCH', 'OTHER_EXACT_MATCH'] },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(2);
      expect(data.map((event: IUserEventResource) => event.id)).to.include(
        `audit-log-${matchingAuditLog1.id}`,
        `audit-log-${matchingAuditLog2.id}`,
      );
    });

    it('filters by created date lte', async () => {
      const now = moment();

      const maxCreated = now.subtract(2, 'days');

      const [beforeMaxCreated] = await Promise.all([
        factory.create('audit-log', {
          userId,
          created: maxCreated.clone().subtract(1, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: maxCreated.clone().add(1, 'day'),
        }),
      ]);

      const query = {
        filter: {
          created: {
            lte: maxCreated.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${beforeMaxCreated.id}`);
    });

    it('filters by created date lt', async () => {
      const now = moment();

      const maxCreated = now.subtract(2, 'days');

      const [beforeMaxCreated] = await Promise.all([
        factory.create('audit-log', {
          userId,
          created: maxCreated.clone().subtract(1, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: maxCreated,
        }),
      ]);

      const query = {
        filter: {
          created: {
            lt: maxCreated.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${beforeMaxCreated.id}`);
    });

    it('filters by created date gte', async () => {
      const now = moment();

      const minCreated = now.subtract(2, 'days');

      const [afterMinCreated] = await Promise.all([
        factory.create('audit-log', {
          userId,
          created: minCreated.clone().add(1, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: minCreated.clone().subtract(1, 'day'),
        }),
      ]);

      const query = {
        filter: {
          created: {
            gte: minCreated.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${afterMinCreated.id}`);
    });

    it('filters by created date gt', async () => {
      const now = moment();

      const minCreated = now.subtract(2, 'days');

      const [afterMinCreated] = await Promise.all([
        factory.create('audit-log', {
          userId,
          created: minCreated.clone().add(1, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: minCreated,
        }),
      ]);

      const query = {
        filter: {
          created: {
            gt: minCreated.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${afterMinCreated.id}`);
    });

    it('filters by created date lte, gte, lt, and gt', async () => {
      const now = moment();

      const minCreated = now.clone().subtract(3, 'days');
      const maxCreated = now.clone().subtract(1, 'days');

      const [inBetween] = await Promise.all([
        factory.create('audit-log', {
          userId,
          created: now.clone().subtract(2, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: minCreated.clone().subtract(1, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: maxCreated.clone().add(1, 'day'),
        }),
      ]);

      const query = {
        filter: {
          created: {
            gte: minCreated.format(),
            lte: maxCreated.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [matching] = data;

      expect(matching.id).to.equal(`audit-log-${inBetween.id}`);
    });

    it('uses lt when it is earlier than lte', async () => {
      const now = moment();

      const lt = now.clone().subtract(3, 'day');
      const lte = now.clone().subtract(1, 'day');

      await Promise.all([
        factory.create('audit-log', {
          userId,
          created: now.clone().subtract(4, 'day'),
        }),
        factory.create('audit-log', {
          userId,
          created: lt,
        }),
        factory.create('audit-log', {
          userId,
          created: now.clone().subtract(2, 'day'),
        }),
      ]);

      const query = {
        filter: {
          created: {
            lt: lt.format(),
            lte: lte.format(),
          },
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);
    });

    it('paginates', async () => {
      const [olderAuditLog] = await Promise.all([
        factory.create('audit-log', { userId, created: moment().subtract(1, 'week') }),
        factory.create('audit-log', { userId }),
      ]);

      const query = {
        page: {
          limit: 1,
          offset: 1,
        },
      };

      req = req.query(qs.stringify(query));

      const {
        body: { data },
      } = await withInternalUser(req);

      expect(data).to.have.length(1);

      const [serializedAuditLog] = data;

      expect(serializedAuditLog.id).to.equal(`audit-log-${olderAuditLog.id}`);
    });
  });
});
