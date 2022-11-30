import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import { FraudAlert, FraudRule } from '../../../../src/models';
import { expect } from 'chai';
import { clean, withInternalUser, createInternalUser } from '../../../test-helpers';
import factory from '../../../factories';

describe('/admin/fraud_rule', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('POST /admin/fraud_rule', () => {
    const rules = [
      { attribute: 'email', value: 'fraud-test-suite@dave.com' },
      { attribute: 'firstName', value: 'Boo' },
      { attribute: 'lastName', value: 'Radley' },
      { attribute: 'birthdate', value: '1990-01-04' },
      { attribute: 'phoneNumber', value: '+12813308004' },
      { attribute: 'addressLine1', value: '123 Main St' },
      { attribute: 'addressLine2', value: 'Apt 304' },
      { attribute: 'city', value: 'Los Angeles' },
      { attribute: 'state', value: 'CA' },
      { attribute: 'zipCode', value: '90019' },
    ];

    rules.forEach(rule => {
      context(`attribute: ${rule.attribute}`, () => {
        const ruleData = { [rule.attribute]: rule.value };

        it('creates a new fraud rule', async () => {
          const req = request(app)
            .post('/admin/fraud-rule')
            .send({ rules: [ruleData] })
            .expect(200);

          const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

          expect(res.body.status).to.match(/ok/);

          const matchedRule = await FraudRule.findOne({ where: ruleData });

          expect(matchedRule).to.exist;
        });

        it('creates fraud alerts for matching users', async () => {
          const newFraudUser = await factory.create('user', {
            ...ruleData,
            emailVerified: true,
          });

          const req = request(app)
            .post('/admin/fraud-rule')
            .send({ rules: [ruleData] });

          await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

          const matchedRule = await FraudRule.findOne({ where: ruleData });

          const [fraudAlertCreated] = await Promise.all([
            FraudAlert.findOne({ where: { userId: newFraudUser.id, fraudRuleId: matchedRule.id } }),
            newFraudUser.reload(),
          ]);

          expect(fraudAlertCreated).to.not.be.null;
          expect(newFraudUser.fraud).to.be.true;
        });
      });
    });

    it('returns duplicate fraud rules when request contains both new and existing rules', async () => {
      await factory.create('fraud-rule', { email: 'fraud-test-suite@dave.com' });
      const data = {
        rules: [
          {
            email: 'fraud-test-suite@dave.com',
            phoneNumber: '1111111111',
          },
          {
            email: 'fraud-test-suite@dave.com',
          },
        ],
      };

      const req = request(app)
        .post('/admin/fraud-rule')
        .send(data)
        .expect(200);

      const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(res.body.status).to.match(/ok/);
      expect(res.body.duplicates[0].email).to.equal('fraud-test-suite@dave.com');
    });

    it('returns warning message and duplicate fraud rules when request contains all existing rules', async () => {
      await factory.create('fraud-rule', { email: 'fraud-test-suite@dave.com' });
      const data = {
        rules: [
          {
            email: 'fraud-test-suite@dave.com',
          },
        ],
      };

      const req = request(app)
        .post('/admin/fraud-rule')
        .send(data)
        .expect(200);

      const res = await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      expect(res.body.status).to.match(/All rules provided already exist/);
      expect(res.body.duplicates[0].email).to.equal('fraud-test-suite@dave.com');
    });
  });

  describe('PATCH /admin/fraud_rule/:id', async () => {
    it('allows admins to toggle certain rules as active and inactive', async () => {
      const createData = {
        rules: [
          {
            email: 'fraud-test-suite@dave.com',
          },
        ],
      };

      const req = request(app)
        .post('/admin/fraud-rule')
        .send(createData);

      await withInternalUser(req, { roleAttrs: { name: 'overdraftAdmin' } });

      const fraudRule = await FraudRule.findOne({ where: { email: createData.rules[0].email } });

      const updateData = {
        active: false,
      };

      const updateReq = request(app)
        .patch(`/admin/fraud-rule/${fraudRule.id}`)
        .send(updateData);

      const updateRes = await withInternalUser(updateReq, {
        roleAttrs: { name: 'overdraftAdmin' },
      });

      expect(updateRes).to.be.ok;

      await fraudRule.reload();
      expect(fraudRule.isActive).to.be.false;
    });

    it("marks associated fraud alerts as resolved, users' fraud flag to false, when a rule is switched to inactive", async () => {
      const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
      const newFraudUser = await factory.create('user', {
        email: 'fraud-test-suite@dave.com',
        emailVerified: true,
      });
      const createData = {
        rules: [
          {
            email: 'fraud-test-suite@dave.com',
          },
        ],
      };

      const req = request(app)
        .post('/admin/fraud-rule')
        .send(createData);

      await withInternalUser(req, adminUser);

      const fraudRule = await FraudRule.findOne({ where: { email: createData.rules[0].email } });
      const updateData = {
        active: false,
      };

      const updateRes = await withInternalUser(
        request(app)
          .patch(`/admin/fraud-rule/${fraudRule.id}`)
          .send(updateData),
        adminUser,
      );

      expect(updateRes).to.be.ok;

      await fraudRule.reload();
      await newFraudUser.reload();
      const fraudAlertCreated = await FraudAlert.findOne({ where: { userId: newFraudUser.id } });
      expect(fraudRule.isActive).to.be.false;
      expect(newFraudUser.fraud).to.be.false;
      expect(fraudAlertCreated.resolved).to.not.be.null;
    });

    it("marks associated fraud alerts as unresolved, users' fraud flag to true, when a rule is switched to active", async () => {
      const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
      const newFraudUser = await factory.create('user', {
        email: 'fraud-test-suite@dave.com',
        emailVerified: true,
      });
      const createData = {
        rules: [
          {
            email: 'fraud-test-suite@dave.com',
          },
        ],
      };

      await withInternalUser(
        request(app)
          .post('/admin/fraud-rule')
          .send(createData),
        adminUser,
      );
      const fraudRule = await FraudRule.findOne({ where: { email: createData.rules[0].email } });
      const fraudAlertCreated = await FraudAlert.findOne({ where: { userId: newFraudUser.id } });
      const firstUpdateData = {
        active: false,
      };

      await withInternalUser(
        request(app)
          .patch(`/admin/fraud-rule/${fraudRule.id}`)
          .send(firstUpdateData)
          .expect(200),
        adminUser,
      );

      const thirdUpdateData = {
        active: true,
      };

      const updateRes = await withInternalUser(
        request(app)
          .patch(`/admin/fraud-rule/${fraudRule.id}`)
          .send(thirdUpdateData),
        adminUser,
      );

      expect(updateRes).to.be.ok;

      await fraudRule.reload();
      await newFraudUser.reload();
      await fraudAlertCreated.reload();
      expect(fraudRule.isActive).to.be.true;
      expect(newFraudUser.fraud).to.be.true;
      expect(fraudAlertCreated.resolved).to.be.null;
    });
  });

  describe('GET /admin/fraud_rule', async () => {
    it("allows admins to preview affected users' details before creating fraud rule", async () => {
      const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });

      const user = await factory.create('user', { firstName: 'Testy', lastName: 'Dave' });

      const res = await withInternalUser(
        request(app)
          .get('/admin/fraud-rule/preview')
          .query({ rules: JSON.stringify([{ firstName: 'Testy', lastName: 'Dave' }]) })
          .expect(200),
        adminUser,
      );

      expect(res.body.data.length).to.be.above(0);
      expect(res.body.data[0].firstName).to.equal(user.firstName);
      expect(res.body.data[0].lastName).to.equal(user.lastName);
    });
  });

  describe('GET /admin/fraud_rule/search', async () => {
    it('allows admins to search for fraud rules by fraud rule attributes', async () => {
      const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });

      await factory.create('fraud-rule', { email: 'fraud-test-suite@dave.com' });
      await factory.create('fraud-rule', { phoneNumber: '9999999999' });
      await factory.create('fraud-rule', { firstName: 'fraudy', lastName: 'bear' });

      const res1 = await withInternalUser(
        request(app)
          .get('/admin/fraud-rule/search')
          .query({ searchTerm: 'fraud-test-suite@dave.com' })
          .expect(200),
        adminUser,
      );

      expect(res1.body.results.length).to.be.above(0);
      expect(res1.body.results[0].email).to.equal('fraud-test-suite@dave.com');

      const res2 = await withInternalUser(
        request(app)
          .get('/admin/fraud-rule/search')
          .query({ searchTerm: '9999999999' })
          .expect(200),
        adminUser,
      );

      expect(res2.body.results.length).to.be.above(0);
      expect(res2.body.results[0].phoneNumber).to.equal('9999999999');

      const res3 = await withInternalUser(
        request(app)
          .get('/admin/fraud-rule/search')
          .query({ searchTerm: 'fraudy' })
          .expect(200),
        adminUser,
      );

      expect(res3.body.results.length).to.be.above(0);
      expect(res3.body.results[0].firstName).to.equal('fraudy');
      expect(res3.body.results[0].lastName).to.equal('bear');

      const res4 = await withInternalUser(
        request(app)
          .get('/admin/fraud-rule/search')
          .query({ searchTerm: 'fraudy bear' })
          .expect(200),
        adminUser,
      );

      expect(res4.body.results.length).to.be.above(0);
      expect(res4.body.results[0].firstName).to.equal('fraudy');
      expect(res4.body.results[0].lastName).to.equal('bear');
    });
  });

  describe('GET /admin/fraud_rule/:id', async () => {
    it('allows admins to find fraud rules by id', async () => {
      const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
      const fraudRule = await factory.create('fraud-rule', { email: 'fraud-test-suite@dave.com' });

      const res = await withInternalUser(
        request(app)
          .get(`/admin/fraud-rule/${fraudRule.id}`)
          .expect(200),
        adminUser,
      );

      expect(res.body.id).to.be.equal(fraudRule.id);
    });

    it('should throw a 404 when ', () => {
      it('allows admins to find fraud rules by id', async () => {
        const adminUser = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });

        const fraudRule = await factory.create('fraud-rule', {
          email: 'fraud-test-suite@dave.com',
        });
        const fakeFraudRuleId = fraudRule.id + 1;

        const res = await withInternalUser(
          request(app)
            .get(`/admin/fraud-rule/${fakeFraudRuleId}`)
            .expect(404),
          adminUser,
        );

        expect(res.body.type).to.be.equal('not_found');
      });
    });
  });
});
