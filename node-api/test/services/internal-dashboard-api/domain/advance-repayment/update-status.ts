import { expect } from 'chai';
import { clean } from '../../../../test-helpers';
import factory from '../../../../factories';
import { DashboardAdvanceRepayment, sequelize } from '../../../../../src/models';
import {
  isTerminalStatus,
  statuses,
  terminalStatuses,
} from '../../../../../src/models/dashboard-advance-repayment';
import updateStatus from '../../../../../src/services/internal-dashboard-api/domain/advance-repayment/update-status';

describe('Advance Repayment - updateStatus', () => {
  before(() => clean());

  afterEach(() => clean());

  context('repayment has a non-terminal status', () => {
    statuses
      .filter(status => !isTerminalStatus(status))
      .forEach(status => {
        terminalStatuses.forEach(terminalStatus => {
          it(`allows the status to change from ${status} to ${terminalStatus}`, async () => {
            const advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
              'dashboard-advance-repayment',
              {
                status,
              },
            );

            await sequelize.transaction(async transaction => {
              await updateStatus(advanceRepayment, terminalStatus, transaction);
            });

            await advanceRepayment.reload();

            expect(advanceRepayment.status).to.equal(terminalStatus);
          });
        });
      });
  });

  context('repayment has a terminal status', () => {
    terminalStatuses.forEach(terminalStatus => {
      statuses.forEach(status => {
        it(`status remains ${terminalStatus} when update is ${status}`, async () => {
          const advanceRepayment = await factory.create<DashboardAdvanceRepayment>(
            'dashboard-advance-repayment',
            {
              status: terminalStatus,
            },
          );

          await sequelize.transaction(async transaction => {
            await updateStatus(advanceRepayment, status, transaction);
          });

          await advanceRepayment.reload();

          expect(advanceRepayment.status).to.equal(terminalStatus);
        });
      });
    });
  });
});
