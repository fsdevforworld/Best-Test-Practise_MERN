import { expect } from 'chai';
import { moment } from '@dave-inc/time-lib';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';

import { changelogSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';
import {
  DashboardActionLog,
  DashboardActionLogDeleteRequest,
  DeleteRequest,
  User,
} from '../../../../../src/models';

const { serializeDeleteRequest } = changelogSerializers;

function hasReasonDetail(response: changelogSerializers.IChangelogEntryResource) {
  return response.attributes.details.some(
    detail => detail.type === 'field' && detail.attributes.name === 'reason',
  );
}

const coolOffFieldName = 'cool-off period ends';

describe('serializeDeleteRequest', () => {
  before(() => clean());

  afterEach(() => clean());

  it('includes the required fields', async () => {
    const deleteRequest = await factory.create('delete-request');
    await deleteRequest.reload();

    const response = await serializeDeleteRequest(deleteRequest);

    const { id, type, attributes } = response;

    expect(id).to.exist;
    expect(type).to.equal('changelog-entry');
    expect(attributes.title).to.equal('Closed account');
    expect(attributes.initiator).to.exist;
    expect(attributes.occurredAt).to.equal(deleteRequest.created.format());
    expect(attributes.details[0]).to.deep.equal({
      type: 'field',
      attributes: {
        name: 'closed request date',
        value: deleteRequest.created.format('YYYY-MM-DD'),
        dataType: 'date',
      },
    });
  });

  context('successful delete request', () => {
    let deleteRequest: DeleteRequest;
    let unsuccessfulDeleteRequest: DeleteRequest;
    let user: User;
    let response: changelogSerializers.IChangelogEntryResource;
    beforeEach(async () => {
      user = await factory.create<User>('user');
      unsuccessfulDeleteRequest = await factory.create<DeleteRequest>('delete-request', {
        userId: user.id,
        created: moment().subtract(1, 'day'),
      });
      deleteRequest = await factory.create<DeleteRequest>('delete-request', { userId: user.id });
      await user.destroy();

      response = await serializeDeleteRequest(deleteRequest);
    });

    it('includes the cool-off period', () => {
      expect(response.attributes.details[1]).to.deep.equal({
        type: 'field',
        attributes: {
          name: coolOffFieldName,
          value: user.deleted
            .clone()
            .add(60, 'days')
            .format('YYYY-MM-DD'),
          dataType: 'date',
        },
      });
    });

    it('has a CLOSED status', () => {
      expect(response.attributes.status).to.equal('CLOSED');
    });

    it('is has a high priority', () => {
      expect(response.attributes.priority).to.equal('high');
    });

    it('reports older delete requests as unsuccessful', async () => {
      await unsuccessfulDeleteRequest.reload();
      const {
        attributes: { status },
      } = await serializeDeleteRequest(unsuccessfulDeleteRequest);

      expect(status).to.equal('CLOSE FAILED');
    });

    context('cool-off period waived', () => {
      it('does not include the cool-off period ends detail', async () => {
        await user.update({ overrideSixtyDayDelete: true });

        const {
          attributes: { details },
        } = await serializeDeleteRequest(deleteRequest);

        const hasCooloffField = details.some(
          detail => detail.type === 'field' && detail.attributes.name === coolOffFieldName,
        );

        expect(hasCooloffField).to.equal(false);
      });
    });
  });

  context('unsuccessful delete request', () => {
    let deleteRequest: DeleteRequest;
    let response: changelogSerializers.IChangelogEntryResource;

    beforeEach(async () => {
      deleteRequest = await factory.create<DeleteRequest>('delete-request');
      response = await serializeDeleteRequest(deleteRequest);
    });

    it('has a CLOSE FAILED status', () => {
      expect(response.attributes.status).to.equal('CLOSE FAILED');
    });

    it('has a low priorty', () => {
      expect(response.attributes.priority).to.equal('low');
    });
  });

  context('action log associated with delete request', () => {
    let deleteRequest: DeleteRequest;
    let actionLog: DashboardActionLog;
    let response: changelogSerializers.IChangelogEntryResource;

    beforeEach(async () => {
      [deleteRequest, actionLog] = await Promise.all([
        factory.create<DeleteRequest>('delete-request'),
        factory.create<DashboardActionLog>('dashboard-action-log'),
      ]);

      await DashboardActionLogDeleteRequest.create({
        deleteRequestId: deleteRequest.id,
        dashboardActionLogId: actionLog.id,
      });

      response = await serializeDeleteRequest(deleteRequest);
    });

    it('has the agent initiator', () => {
      expect(response.attributes.initiator).to.equal('agent');
    });

    it('includes the action log as a detail', () => {
      const hasActionLog = response.attributes.details.some(detail => detail.type === 'action-log');
      expect(hasActionLog).to.equal(true);
    });

    it('does not include the reason detail field', () => {
      const hasReasonField = hasReasonDetail(response);
      expect(hasReasonField).to.equal(false);
    });
  });

  context('no action log', () => {
    it('includes the reason field', async () => {
      const deleteRequest = await factory.create('delete-request');

      const response = await serializeDeleteRequest(deleteRequest);

      expect(hasReasonDetail(response)).to.equal(true);
    });
  });
});
