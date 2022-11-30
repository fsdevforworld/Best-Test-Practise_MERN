import { Moment } from '@dave-inc/time-lib';
import { BOOLEAN, FindOptions, INTEGER, JSON as SQLJSON, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';

import AdvanceApproval from './advance-approval';

@Table({
  tableName: 'advance_rule_log_2',
  updatedAt: false,
})
export default class AdvanceRuleLog extends Model<AdvanceRuleLog> {
  public static findByAdvanceApprovalId(advanceApprovalId: number): Promise<AdvanceRuleLog[]> {
    return AdvanceRuleLog.sequelize.query<AdvanceRuleLog>(
      `
      SELECT *
      FROM advance_rule_log
      WHERE
        advance_approval_id = :advanceApprovalId
      UNION
      SELECT *
      FROM advance_rule_log_2
      WHERE
        advance_approval_id = :advanceApprovalId
    `,
      {
        replacements: {
          advanceApprovalId,
        },
        model: AdvanceRuleLog,
        mapToModel: true,
      },
    );
  }

  public static async deleteByAdvanceApprovalId(advanceApprovalId: number) {
    await this.sequelize.query(
      `
      DELETE FROM advance_rule_log
        WHERE advance_approval_id = :advanceApprovalId;
      `,
      { replacements: { advanceApprovalId } },
    );

    await this.sequelize.query(
      `
      DELETE FROM advance_rule_log_2
        WHERE advance_approval_id = :advanceApprovalId;
      `,
      { replacements: { advanceApprovalId } },
    );
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @ForeignKey(() => AdvanceApproval)
  @Column({
    field: 'advance_approval_id',
    type: INTEGER,
  })
  public advanceApprovalId: number;

  @BelongsTo(() => AdvanceApproval)
  public advanceApproval: AdvanceApproval;

  public getAdvanceApproval: (options?: FindOptions) => PromiseLike<AdvanceApproval>;

  @Column({
    type: BOOLEAN,
  })
  public success: boolean;

  @Column({
    field: 'rule_name',
    type: STRING,
  })
  public ruleName: string;

  @Column({
    field: 'node_name',
    type: STRING,
  })
  public nodeName: string;

  @Column({
    type: SQLJSON,
  })
  public data: any;

  @Column({
    type: STRING,
  })
  public error: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
