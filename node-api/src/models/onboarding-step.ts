import { INTEGER, STRING, Op } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table, DefaultScope } from 'sequelize-typescript';

import User from './user';

@DefaultScope({
  order: [['id', 'DESC']],
})
@Table({
  tableName: 'onboarding_step',
  updatedAt: false,
})
export default class OnboardingStep extends Model<OnboardingStep> {
  public static async removeSteps(userId: number, steps: string[]): Promise<OnboardingStep[]> {
    if (steps && steps.length > 0) {
      await OnboardingStep.destroy({
        where: {
          userId,
          step: { [Op.in]: steps },
        },
      });
    }
    return OnboardingStep.findAll({ where: { userId } });
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @Column({
    type: STRING(32),
  })
  public step: string;
}
