import { DonationOrganizationCode } from '@dave-inc/wire-typings';
import { CreatedAt, Column, Table, Model, UpdatedAt } from 'sequelize-typescript';
import { STRING, BIGINT } from 'sequelize';
import { Moment } from 'moment';

/**
 * In app versions before 2.12.5 and after 2.10.4, when a user requested an advance we did not include the tip donation organization
 * in the request data even if a portion of their tip was going to be donated. We chose to represent this by including an UNKNOWN
 * donation organization since it is possible the user is donating to either FEEDING_AMERICA or TREES. This UNKNOWN organization
 * helps us distinguish between advances that have a donation organization associated with them vs advances that do not
 * include a donation org at all (ex tiny money advances).
 */
@Table({
  tableName: 'donation_organization',
})
export default class DonationOrganization extends Model<DonationOrganization> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @Column({
    type: STRING,
  })
  public name: string;

  @Column({
    type: STRING,
  })
  public code: DonationOrganizationCode;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
