import { BIGINT, STRING } from 'sequelize';
import {
  BelongsTo,
  Column,
  CreatedAt,
  ForeignKey,
  Model,
  Table,
  UpdatedAt,
} from 'sequelize-typescript';
import { Moment } from 'moment';
import HustleJobPack from './hustle-job-pack';

@Table({
  tableName: 'side_hustle_job_pack_search',
})
export default class HustleJobPackSearch extends Model<HustleJobPackSearch> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: BIGINT,
  })
  public id: number;

  @ForeignKey(() => HustleJobPack)
  @Column({
    type: BIGINT,
    field: 'side_hustle_job_pack_id',
  })
  public hustleJobPackId: number;

  @BelongsTo(() => HustleJobPack)
  public hustleJobPack: HustleJobPack;

  @Column({
    type: STRING(256),
    field: 'term',
  })
  public term: string;

  @Column({
    type: STRING(256),
    field: 'value',
  })
  public value: string;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
