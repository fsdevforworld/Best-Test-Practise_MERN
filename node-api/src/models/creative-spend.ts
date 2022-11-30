import { STRING, INTEGER, DATE, DATEONLY, BOOLEAN } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'creative_spend',
})
export default class CreativeSpend extends Model<CreativeSpend> {
  @Column({
    field: 'spend_date_pacific_time',
    type: DATEONLY,
    primaryKey: true,
  })
  public spendDatePacificTime: Moment;

  @Column({
    type: STRING(256),
    primaryKey: true,
  })
  public network: string;

  @Column({
    field: 'campaign_id',
    type: STRING(128),
    primaryKey: true,
  })
  public campaignId: string;

  @Column({
    type: STRING(256),
  })
  public campaign: string;

  @Column({
    field: 'device_type',
    type: STRING(256),
    primaryKey: true,
  })
  public deviceType: string;

  @Column({
    type: STRING(128),
    primaryKey: true,
  })
  public adset: string;

  @Column({
    field: 'creative_id',
    type: STRING(128),
    primaryKey: true,
  })
  public creativeId: string;

  @Column({
    type: STRING(256),
  })
  public keyword: string;

  @Column({
    field: 'adset_id',
    type: STRING(128),
  })
  public adsetId: string;

  @Column({
    field: 'creative_name',
    type: STRING(256),
  })
  public creativeName: string;

  @Column({
    field: 'creative_text',
    type: STRING(256),
  })
  public creativeText: string;

  @Column({
    field: 'creative_width',
    type: INTEGER,
  })
  public creativeWidth: number;

  @Column({
    field: 'creative_height',
    type: INTEGER,
  })
  public creativeHeight: number;

  @Column({
    field: 'creative_is_video',
    type: BOOLEAN,
  })
  public creativeIsVideo: boolean;

  @Column({
    type: INTEGER,
  })
  public impressions: number;

  @Column({
    type: STRING(256),
  })
  public spend: string;

  @Column({
    type: INTEGER,
  })
  public clicks: number;

  @Column({
    type: INTEGER,
  })
  public installs: number;

  @Column({
    type: DATE,
  })
  public created: Moment;

  @Column({
    type: DATE,
  })
  public updated: Moment;
}
