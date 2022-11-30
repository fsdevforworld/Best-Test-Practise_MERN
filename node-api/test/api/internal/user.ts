import { expect } from 'chai';
import * as request from 'supertest';

import app from '../../../src/api';
import { EmailVerification, User } from '../../../src/models';
import factory from '../../factories';
import { clean } from '../../test-helpers';
import { AUTH_SECRET, CLIENT_ID } from './test-constants';

describe('GET /internal/user/:id', () => {
  const authHeader = `Basic ${Buffer.from(`${CLIENT_ID}:${AUTH_SECRET}`).toString('base64')}`;

  it('should respond with a 404 if no user exists by the specified id', () => {
    return request(app)
      .get('/internal/user/0')
      .set('Authorization', authHeader)
      .expect(404);
  });

  context('when a user exists with an address', () => {
    let body: any;
    let user: User;
    let emailVerification: EmailVerification;

    before(async () => {
      user = await factory.create<User>('user', {
        email: 'test@test.com',
        addressLine1: '123 Adams St',
        addressLine2: 'Apt 456',
        city: 'Melrose',
        firstName: 'Suzie',
        lastName: 'Q',
        state: 'CA',
        zipCode: '12345',
        fraud: false,
      });
      emailVerification = await factory.create('email-verification', {
        userId: user.id,
      });

      ({ body } = await request(app)
        .get(`/internal/user/${user.id}`)
        .set('Authorization', authHeader)
        .expect(200));
    });

    after(() => clean());

    it("should respond with the user's address information", () => {
      expect(body.address.addressLine1).to.equal(user.addressLine1);
      expect(body.address.addressLine2).to.equal(user.addressLine2);
      expect(body.address.city).to.equal(user.city);
      expect(body.address.state).to.equal(user.state);
      expect(body.address.zipCode).to.equal(user.zipCode);
    });

    it("should respond with the user's phone number", () => {
      expect(body.phoneNumber).to.equal(user.phoneNumber);
    });

    it("should respond with the user's first and last names", () => {
      expect(body.firstName).to.equal(user.firstName);
      expect(body.lastName).to.equal(user.lastName);
    });

    it("should respond with the user's email", () => {
      expect(body.email).to.equal(user.email);
      expect(body.emailVerified).to.equal(true);
    });

    it("should respond with the user's most recent email", () => {
      expect(body.mostRecentEmail).to.equal(emailVerification.email);
    });

    it('should respond with whether the user has a Dave Banking account', () => {
      expect(body.hasDaveBanking).to.equal(false);
    });

    it("should respond with the user's fraud status", () => {
      expect(body.fraud).to.equal(user.fraud);
    });
  });

  context('when a user exists without an address', () => {
    let body: any;
    let user: User;

    before(async () => {
      user = await factory.create<User>('user');

      ({ body } = await request(app)
        .get(`/internal/user/${user.id}`)
        .set('Authorization', authHeader)
        .expect(200));
    });

    after(() => clean());

    it('should not have an address field', () => {
      expect(body.address).to.equal(undefined);
    });
  });

  context('when a user is soft deleted', () => {
    let user: User;

    before(async () => {
      user = await factory.create<User>('user', {
        email: 'test@test.com',
      });

      await user.destroy();
    });

    after(() => clean());

    it('should return a 404 for a deleted user', async () => {
      await request(app)
        .get(`/internal/user/${user.id}`)
        .set('Authorization', authHeader)
        .expect(404);
    });

    it('should return the user if "allowDeleted" query is passed', async () => {
      const { body } = await request(app)
        .get(`/internal/user/${user.id}?allowDeleted`)
        .set('Authorization', authHeader)
        .expect(200);

      expect(body.email).to.equal(user.email);
    });
  });
});
