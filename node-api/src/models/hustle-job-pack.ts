import { HustleJobPackResponse, HustleSortOrder } from '@dave-inc/wire-typings';
import { BIGINT, CHAR, ENUM, STRING, TEXT } from 'sequelize';
import { Column, CreatedAt, HasMany, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { Moment } from 'moment';
import { HustleJobPackSearch, HustleJobPackProvider } from '../models';
import { serializeDate } from '../serialization';
import { ISerializable } from '../typings';

@Table({
  tableName: 'side_hustle_job_pack',
})
export default class HustleJobPack extends Model<HustleJobPack>
  implements ISerializable<HustleJobPackResponse> {
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
    field: 'sort_by',
  })
  public sortBy: string;

  @Column({
    type: ENUM(HustleSortOrder.ASC, HustleSortOrder.DESC),
    field: 'sort_order',
  })
  public sortOrder: HustleSortOrder;

  @Column({
    type: new TEXT('medium'),
    field: 'image',
  })
  public image: string;

  @Column({
    type: CHAR(6),
    field: 'bgcolor',
  })
  public bgColor: string;

  @Column({
    type: new TEXT('medium'),
    field: 'image_small',
  })
  public imageSmall: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;

  @HasMany(() => HustleJobPackSearch)
  public hustleJobPackSearches: HustleJobPackSearch[];
  public getHustleJobPackSearches: () => Promise<HustleJobPackSearch[]>;

  @HasMany(() => HustleJobPackProvider)
  public hustleJobPackProviders: HustleJobPackProvider[];
  public getHustleJobPackProviders: () => Promise<HustleJobPackProvider[]>;

  public serialize(): HustleJobPackResponse {
    return {
      id: this.id,
      name: this.name,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      image: this.image,
      bgColor: this.bgColor,
      created: serializeDate(this.created),
      updated: serializeDate(this.updated),
    };
  }
}
