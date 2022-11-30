import { Moment } from 'moment';
import { INTEGER, DATE, JSON as SQLJSON, TEXT } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import FraudRule from './fraud-rule';
import User from './user';
import { FraudAlertReason } from '../typings';

@Table({
  tableName: 'fraud_alert',
  updatedAt: false,
})
export default class FraudAlert extends Model<FraudAlert> {
  public static async createFromUserAndReason(user: User, reason: FraudAlertReason, extra?: any) {
    return this.sequelize.transaction(async transaction => {
      await user.update({ fraud: true }, { transaction });

      await FraudAlert.create(
        {
          userId: user.id,
          reason,
          extra,
        },
        { transaction },
      );
    });
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

  @BelongsTo(() => User, 'user_id')
  public user: User;

  @Column({
    type: TEXT,
  })
  public reason: string;

  @Column({
    type: SQLJSON,
    defaultValue: {},
  })
  public extra: any;

  @Column({
    type: DATE,
  })
  public resolved: Moment;

  @ForeignKey(() => FraudRule)
  @Column({
    field: 'fraud_rule_id',
    type: INTEGER,
  })
  public fraudRuleId: number;

  @BelongsTo(() => FraudRule, 'fraud_rule_id')
  public fraudRule: FraudRule;
}
