import { INTEGER, STRING } from 'sequelize';
import { Moment } from 'moment';
import { DATE } from 'sequelize';
import { Column, Model, Table, CreatedAt, UpdatedAt } from 'sequelize-typescript';

@Table({
  tableName: 'campaign_info_contributor',
})
export default class CampaignInfoContributor extends Model<CampaignInfoContributor> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @Column({
    type: STRING(256),
    field: 'appsflyer_device_id',
  })
  public appsflyerDeviceId: string;

  // Contributor 1
  @Column({
    type: STRING(512),
    field: 'network_1',
  })
  public network1: string;

  @Column({
    type: STRING(512),
    field: 'campaign_1',
  })
  public campaign1: string;

  @Column({
    type: DATE,
    field: 'touch_time_1',
  })
  public touchTime1: Moment;

  @Column({
    type: STRING(256),
    field: 'touch_type_1',
  })
  public touchType1: string;

  // Contributor 2
  @Column({
    type: STRING(512),
    field: 'network_2',
  })
  public network2: string;

  @Column({
    type: STRING(512),
    field: 'campaign_2',
  })
  public campaign2: string;

  @Column({
    type: DATE,
    field: 'touch_time_2',
  })
  public touchTime2: Moment;

  @Column({
    type: STRING(256),
    field: 'touch_type_2',
  })
  public touchType2: string;

  // Contributor 3
  @Column({
    type: STRING(512),
    field: 'network_3',
  })
  public network3: string;

  @Column({
    type: STRING(512),
    field: 'campaign_3',
  })
  public campaign3: string;

  @Column({
    type: DATE,
    field: 'touch_time_3',
  })
  public touchTime3: Moment;

  @Column({
    type: STRING(256),
    field: 'touch_type_3',
  })
  public touchType3: string;
}
