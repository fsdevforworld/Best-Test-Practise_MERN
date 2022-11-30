import { expect } from 'chai';
import * as request from 'supertest';
import app from '../../../../src/services/internal-dashboard-api';
import { clean, createInternalUser, withInternalUser } from '../../../test-helpers';
import { InternalUser } from '../../../../src/models';
import {
  AdvanceApprovalEngineNodeJSON,
  AdvanceApprovalEngineEdgeJSON,
} from '../../../../src/services/advance-approval/advance-approval-engine/graph';

describe('/dashboard/approval_flow', () => {
  before(async () => clean());

  afterEach(() => clean());

  context('unauthorized internal user', () => {
    describe('GET', () => {
      it('should return a 403', async () => {
        await withInternalUser(
          request(app)
            .get('/dashboard/approval_flow')
            .expect(403),
          { roleAttrs: { name: 'Unauthorized role' } },
        );
      });
    });
  });

  context('admin user', () => {
    let admin: InternalUser;

    beforeEach(async () => {
      admin = await createInternalUser({ roleAttrs: { name: 'overdraftAdmin' } });
    });

    describe('GET', () => {
      it('should return an dot svg', async () => {
        const response = await withInternalUser(
          request(app)
            .get('/dashboard/approval_flow')
            .expect(200),
          admin,
        );

        expect(response.text).to.be.a('string');
        expect(response.text)
          .to.contain('<svg')
          .contain('>Payday Solvency Node<');
      });
    });

    describe('GET format=dot-svg', () => {
      it('should return a dot file', async () => {
        const response = await withInternalUser(
          request(app)
            .get('/dashboard/approval_flow?format=dot-svg')
            .expect(200),
          admin,
        );

        expect(response.text).to.be.a('string');
        expect(response.text)
          .to.contain('<svg')
          .contain('>Payday Solvency Node<');
      });
    });

    describe('GET format=dot-raw', () => {
      it('should return a dot file', async () => {
        const response = await withInternalUser(
          request(app)
            .get('/dashboard/approval_flow?format=dot-raw')
            .expect(200),
          admin,
        );

        expect(response.text).to.be.a('string');
        expect(response.text)
          .to.contain('digraph approval {')
          .contain('label="Account Age Node"');

        expect(response.text).does.not.contain('pos="');
      });
    });

    describe('GET format=json', () => {
      it('should return a dot file', async () => {
        const { body } = await withInternalUser(
          request(app)
            .get('/dashboard/approval_flow?format=json')
            .expect(200),
          admin,
        );

        expect(body).to.be.an('object');
        expect(body.nodes).to.be.a('array');
        expect(body.nodes).to.have.length.greaterThan(0);
        expect(body.edges).to.be.a('array');
        expect(body.edges).to.have.length.greaterThan(0);

        body.nodes.forEach((node: AdvanceApprovalEngineNodeJSON) => {
          expect(node.referenceId).to.be.a('string');
          expect(node.name).to.be.a('string');
          expect(node.metadata).to.be.a('object');
          expect(node.rules).to.be.a('array');
          expect(node.type).to.be.a('string');
        });

        body.edges.forEach((edge: AdvanceApprovalEngineEdgeJSON) => {
          expect(edge.source).to.be.a('string');
          expect(edge.target).to.be.a('string');
          expect(edge.name).to.be.a('string');
        });
      });
    });
  });
});
