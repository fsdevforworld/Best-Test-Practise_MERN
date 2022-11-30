import {
  BeforeUpdate,
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { BIGINT, DECIMAL, INTEGER, JSON as SQLJSON } from 'sequelize';
import { Moment } from 'moment';
import { moment } from '@dave-inc/time-lib';
import Advance from './advance';
import DonationOrganization from './donation-organization';

@Table({
  tableName: 'advance_tip',
})
export default class AdvanceTip extends Model<AdvanceTip> {
  @BeforeUpdate
  public static recordModifications(instance: AdvanceTip, { metadata }: { metadata: object }) {
    const changedKeys = instance.changed();

    if (Array.isArray(changedKeys)) {
      const modification = changedKeys.reduce(
        (mod: any, key: keyof AdvanceTip) => {
          mod.current[key] = instance.getDataValue(key);
          mod.previous[key] = instance.previous(key);

          return mod;
        },
        {
          time: moment().format(),
          current: {},
          previous: {},
        },
      );

      if (metadata) {
        modification.metadata = metadata;
      }

      if (!instance.modifications || Array.isArray(instance.modifications)) {
        instance.modifications = (instance.modifications || []).concat(modification);
      }
    }
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @Column({
    type: DECIMAL(16, 2),
  })
  public amount: number;

  @Column({
    type: INTEGER,
  })
  public percent: number;

  @ForeignKey(() => Advance)
  @Column({
    field: 'advance_id',
    type: INTEGER,
  })
  public advanceId: number;

  @BelongsTo(() => Advance, 'advance_id')
  public advance: Advance;

  @ForeignKey(() => DonationOrganization)
  @Column({
    field: 'donation_organization_id',
    type: BIGINT,
  })
  public donationOrganizationId: number;

  @BelongsTo(() => DonationOrganization, 'donation_organization_id')
  public donationOrganization: DonationOrganization;
  public getDonationOrganization: () => Promise<DonationOrganization>;

  @Column({
    type: SQLJSON,
  })
  public modifications: any;

  @Column({
    type: SQLJSON,
  })
  public extra: any;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  public async lazyGetOrganizationDonation(): Promise<DonationOrganization> {
    if (!this.donationOrganization) {
      this.donationOrganization = await DonationOrganization.findByPk(this.donationOrganizationId);
    }
    return this.donationOrganization;
  }
}
