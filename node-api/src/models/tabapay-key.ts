import { Moment } from 'moment';
import { DATE, STRING, INTEGER } from 'sequelize';
import { Column, Model, Table } from 'sequelize-typescript';
import { ISerializable } from '../typings';
import { TabapayKeyResponse } from '@dave-inc/wire-typings';
import { serializeDate } from '../serialization';

@Table({
  tableName: 'tabapay_key',
  updatedAt: false,
})
export default class TabapayKey extends Model<TabapayKey>
  implements ISerializable<TabapayKeyResponse> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(32),
    field: 'key_id',
  })
  public keyId: string;

  @Column({
    type: STRING(4096),
  })
  public key: string;

  @Column({
    type: DATE,
  })
  public expiration: Moment;

  @Column({
    type: DATE,
  })
  public created: Moment;

  public serialize(): TabapayKeyResponse {
    return {
      id: this.id,
      keyId: this.keyId,
      key: this.key,
      expiration: serializeDate(this.expiration),
      created: this.created.format(),
    };
  }
}
