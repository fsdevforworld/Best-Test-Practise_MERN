import { INTEGER, BelongsToGetAssociationMixin } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table, Scopes } from 'sequelize-typescript';
import DashboardActionLog from './dashboard-action-log';
import EmailVerification from './email-verification';

@Scopes(() => ({
  forUserId(userId: number) {
    return {
      include: [
        {
          model: EmailVerification,
          where: {
            userId,
          },
        },
      ],
    };
  },
  withActionLog: {
    include: [
      {
        model: DashboardActionLog.scope('withRelated'),
      },
    ],
  },
}))
@Table({
  tableName: 'dashboard_action_log_email_verification',
  timestamps: false,
})
export default class DashboardActionLogEmailVerification extends Model<
  DashboardActionLogEmailVerification
> {
  @ForeignKey(() => DashboardActionLog)
  @Column({
    field: 'dashboard_action_log_id',
    type: INTEGER,
    primaryKey: true,
  })
  public dashboardActionLogId: number;

  @BelongsTo(() => DashboardActionLog)
  public dashboardActionLog: DashboardActionLog;
  public getDashboardActionLog: BelongsToGetAssociationMixin<DashboardActionLog>;

  @ForeignKey(() => EmailVerification)
  @Column({
    field: 'email_verification_id',
    type: INTEGER,
    primaryKey: true,
  })
  public emailVerificationId: number;

  @BelongsTo(() => EmailVerification)
  public emailVerification: EmailVerification;
}
