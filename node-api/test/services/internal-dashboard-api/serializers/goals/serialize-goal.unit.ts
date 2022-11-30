import { GoalStatus, IApiGoal } from '@dave-inc/banking-goals-internal-api-client';
import { expect } from 'chai';
import { goalsSerializers } from '../../../../../src/services/internal-dashboard-api/serializers';

describe('serializeGoal', () => {
  const serialize = goalsSerializers.serializeGoal;

  const goal: IApiGoal = {
    id: 'e3f7a1505ad611ebb6b9fbdaaa3455fa',
    created: '2021-01-19T22:53:54.000Z',
    status: GoalStatus.Active,
    currentBalance: 0,
    goalAccountId: '963c6840569111ebb6b9fbdaaa3455fa',
    goalType: 'medical_illness',
    motivation: 'Better',
    name: 'Rona',
    targetAmount: 200,
  };

  ['created', 'currentBalance', 'name', 'targetAmount', 'status', 'motivation'].forEach(
    (prop: keyof typeof goal) => {
      it(`includes ${prop}`, async () => {
        const { attributes } = await serialize(goal);
        expect((attributes as Record<string, unknown>)[prop]).to.equal(goal[prop]);
      });
    },
  );

  it('maps lastTransferDate to lastTransferAt', async () => {
    const lastTransferDate = '2021-02-05';
    const { attributes } = await serialize({ ...goal, lastTransferDate });
    expect(attributes.lastTransferAt).to.equal(lastTransferDate);
  });

  it('lastTransferAt is null when goal has no transfers', async () => {
    const { attributes } = await serialize(goal);
    expect(attributes.lastTransferAt).to.be.null;
  });
});
