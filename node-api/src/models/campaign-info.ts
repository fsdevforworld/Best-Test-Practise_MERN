import { DATE, INTEGER, STRING, BOOLEAN, JSON as SQLJSON } from 'sequelize';
import { Moment } from 'moment';
import { result } from 'lodash';
import {
  BelongsTo,
  Column,
  ForeignKey,
  Model,
  Table,
  CreatedAt,
  UpdatedAt,
} from 'sequelize-typescript';
import { ISerializable } from '../typings';
import User from './user';
import { CampaignInfoResponse } from '@dave-inc/wire-typings';
import { serializeDate } from '../serialization';

@Table({
  tableName: 'campaign_info',
})
export default class CampaignInfo extends Model<CampaignInfo>
  implements ISerializable<CampaignInfoResponse> {
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
    type: STRING(256),
    field: 'device_id',
  })
  public deviceId: string;

  @Column({
    type: STRING(512),
  })
  public network: string;

  @Column({
    type: STRING(512),
  })
  public campaign: string;

  @Column({
    type: STRING,
    field: 'campaign_id',
  })
  public campaignId: string;

  @Column({
    type: STRING(512),
  })
  public adgroup: string;

  @Column({
    type: STRING(512),
  })
  public adset: string;

  @Column({
    type: STRING(512),
  })
  public keywords: string;

  @Column({
    type: STRING(512),
    field: 'click_label',
  })
  public clickLabel: string;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  @Column({
    type: DATE,
    field: 'bank_connected_date',
  })
  public bankConnectedDate: Moment;

  @Column({
    type: STRING(256),
    field: 'appsflyer_device_id',
  })
  public appsflyerDeviceId: string;

  @Column({
    type: DATE,
    field: 'appsflyer_installed_date',
  })
  public appsflyerInstalledDate: Moment;

  @Column({
    type: DATE,
    field: 'dave_installed_date',
  })
  public daveInstalledDate: Moment;

  @Column({
    type: STRING(256),
    field: 'app_version',
  })
  public appVersion: string;

  @Column({
    type: STRING(256),
    field: 'device_type',
  })
  public deviceType: string;

  @Column({
    type: DATE,
    field: 'attributed_touch_time',
  })
  public attributedTouchTime: Moment;

  @Column({
    type: STRING(256),
    field: 'attributed_touch_type',
  })
  public attributedTouchType: string;

  @Column({
    type: STRING(256),
    field: 'platform',
  })
  public platform: string;

  @Column({
    type: STRING(256),
    field: 'os_version',
  })
  public osVersion: string;

  @Column({
    type: BOOLEAN,
    field: 'is_retargeting',
  })
  public isRetargeting: boolean;

  @Column({
    type: BOOLEAN,
    field: 'appsflyer_install_event_received',
  })
  public appsflyerInstallEventReceived: boolean;

  @ForeignKey(() => User)
  @Column({
    field: 'referrer_id',
    type: INTEGER,
  })
  public referrerId: number;

  @Column({
    type: STRING,
    field: 'referrer_name',
  })
  public referrerName: string;

  @Column({
    type: STRING,
    field: 'referrer_image_url',
  })
  public referrerImageUrl: string;

  @Column({
    type: SQLJSON,
    field: 'extra',
  })
  public extra: any;

  @Column({
    type: DATE,
    field: 'appsflyer_uninstalled_date',
  })
  public appsflyerUninstalledDate: Moment;

  public serialize(): CampaignInfoResponse {
    return {
      network: this.network,
      campaign: this.campaign,
      adgroup: this.adgroup,
      adset: this.adset,
      keywords: this.keywords,
      attributedTouchTime: serializeDate(this.attributedTouchTime),
      attributedTouchType: this.attributedTouchType,
      isRetargeting: this.isRetargeting,
      daveInstalledDate: result<string>(this, 'daveInstalledDate.toJSON'),
      referrerId: this.referrerId,
      referrerName: this.referrerName,
      referrerImageUrl: this.referrerImageUrl,
    };
  }
}
