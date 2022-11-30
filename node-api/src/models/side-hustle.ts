import { HustlePartner } from '@dave-inc/wire-typings';
import { Moment } from 'moment';
import { BIGINT, BOOLEAN, DATE, DECIMAL, ENUM, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  DeletedAt,
  ForeignKey,
  Model,
  Scopes,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import SideHustleCategory from './side-hustle-category';

@Scopes(() => ({
  dave: {
    where: {
      isActive: true,
      partner: HustlePartner.Dave,
    },
    include: [SideHustleCategory],
  },
}))
@Table({
  tableName: 'side_hustle',
})
export default class SideHustle extends Model<SideHustle> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @Column({
    type: ENUM('APPCAST', 'DAVE'),
    field: 'partner',
    unique: 'partner_external_unique',
  })
  public partner: HustlePartner;

  @Column({
    type: STRING(256),
    field: 'external_id',
    unique: 'partner_external_unique',
  })
  public externalId: string;

  @Column({
    type: BOOLEAN,
    field: 'is_active',
  })
  public isActive: boolean;

  @Column({
    type: STRING(256),
    field: 'name',
  })
  public name: string;

  @Column({
    type: STRING(256),
    field: 'company',
  })
  public company: string;

  @Column({
    type: DECIMAL(16, 2),
    field: 'cost_per_application',
  })
  public costPerApplication: number;

  @Column({
    type: DECIMAL(16, 2),
    field: 'cost_per_click',
  })
  public costPerClick: number;

  @Column({
    type: STRING(2048),
    field: 'affiliate_link',
  })
  public affiliateLink: string;

  @Column({
    type: STRING(500),
    field: 'description',
  })
  public description: string;

  @Column({
    type: STRING(500),
    field: 'logo',
  })
  public logo: string;

  @Column({
    type: STRING(256),
    field: 'city',
  })
  public city: string;

  @Column({
    type: STRING(256),
    field: 'state',
  })
  public state: string;

  @Column({
    type: STRING(32),
    field: 'zip_code',
  })
  public zipCode: string;

  @Column({
    type: STRING(256),
    field: 'country',
  })
  public country: string;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @DeletedAt
  public deleted: Moment;

  @Column({
    type: DATE,
    field: 'posted_date',
  })
  public postedDate: Moment;

  @ForeignKey(() => SideHustleCategory)
  @Column({
    type: STRING(32),
    field: 'side_hustle_category_id',
  })
  public sideHustleCategoryId: number;

  @BelongsTo(() => SideHustleCategory)
  public category: SideHustleCategory;
  public getCategory: () => PromiseLike<SideHustleCategory>;
}
