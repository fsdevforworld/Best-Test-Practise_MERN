import { DATE, STRING, BOOLEAN, TEXT, DECIMAL, BIGINT, FindOptions } from 'sequelize';
import {
  Column,
  CreatedAt,
  DeletedAt,
  Model,
  Table,
  UpdatedAt,
  ForeignKey,
  BelongsTo,
} from 'sequelize-typescript';
import { Moment } from 'moment';
import { SideHustleJobResponse } from '@dave-inc/wire-typings';
import { ISerializable } from '../typings';
import SideHustleCategory from './side-hustle-category';
import SideHustleProvider from './side-hustle-provider';

@Table({
  tableName: 'side_hustle_jobs',
})
export default class SideHustleJob extends Model<SideHustleJob>
  implements ISerializable<Promise<SideHustleJobResponse>> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

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
    type: STRING(256),
    field: 'tagline',
  })
  public tagline: string;

  @Column({
    type: new TEXT('medium'),
  })
  public logo: string;

  @Column({
    type: BOOLEAN,
    field: 'active',
  })
  public active: boolean;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @DeletedAt
  public deleted: Moment;

  @Column({
    type: STRING(2048),
    field: 'affiliate_link',
  })
  public affiliateLink: string;

  @Column({
    type: STRING(300),
    field: 'email_blurb',
  })
  public emailBlurb: string;

  @Column({
    type: new TEXT('medium'),
    field: 'email_img',
  })
  public emailImg: string;

  @Column({
    type: STRING(256),
    field: 'sms_blurb',
  })
  public smsBlurb: string;

  @Column({
    type: STRING(256),
    field: 'description',
  })
  public description: string;

  @Column({
    type: DECIMAL(11, 4),
    field: 'cost_per_click',
  })
  public costPerClick: number;

  @Column({
    type: DECIMAL(11, 4),
    field: 'cost_per_application',
  })
  public costPerApplication: number;

  @Column({
    type: STRING(256),
    field: 'country',
  })
  public country: string;

  @Column({
    type: STRING(256),
    field: 'state',
  })
  public state: string;

  @Column({
    type: STRING(256),
    field: 'city',
  })
  public city: string;

  @Column({
    type: STRING(32),
    field: 'zip',
  })
  public zip: string;

  @ForeignKey(() => SideHustleCategory)
  @Column({
    type: STRING(32),
    field: 'side_hustle_category_id',
  })
  public sideHustleCategoryId: number;

  @BelongsTo(() => SideHustleCategory)
  public category: SideHustleCategory;

  public getCategory: (options?: FindOptions) => PromiseLike<SideHustleCategory>;

  @ForeignKey(() => SideHustleProvider)
  @Column({
    type: STRING(32),
    field: 'side_hustle_provider_id',
    unique: 'provider_external_unique',
  })
  public sideHustleProviderId: number;

  @BelongsTo(() => SideHustleProvider)
  public provider: SideHustleProvider;

  public getProvider: (options?: FindOptions) => PromiseLike<SideHustleProvider>;

  @Column({
    type: STRING(256),
    field: 'external_id',
    unique: 'provider_external_unique',
  })
  public externalId: string;

  @Column({
    type: DATE,
    field: 'posted_date',
  })
  public postedDate: Moment;

  public async serialize(): Promise<SideHustleJobResponse> {
    {
      return {
        id: this.id,
        name: this.name,
        tagline: this.tagline,
        logo: this.logo,
        company: this.company,
        description: this.description,
        costPerClick: this.costPerClick,
        costPerApplication: this.costPerApplication,
        country: this.country,
        state: this.state,
        city: this.city,
        zip: this.zip,
        provider: null,
        category: null,
        externalId: this.externalId,
      };
    }
  }
}
