import { BIGINT, INTEGER } from 'sequelize';
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
import SideHustleProvider from './side-hustle-provider';

@Table({
  tableName: 'side_hustle_job_pack_provider',
})
export default class HustleJobPackProvider extends Model<HustleJobPackProvider> {
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

  @ForeignKey(() => SideHustleProvider)
  @Column({
    type: INTEGER,
    field: 'side_hustle_provider_id',
  })
  public sideHustleProviderId: number;

  @BelongsTo(() => SideHustleProvider)
  public sideHustleProvider: SideHustleProvider;

  @CreatedAt
  public created: Moment;

  @UpdatedAt
  public updated: Moment;
}
