import { INTEGER } from 'sequelize';
import { Column, ForeignKey, Model, Table, BelongsTo } from 'sequelize-typescript';

import User from './user';
import Incident from './incident';

@Table({
  tableName: 'user_incident',
  updatedAt: false,
  createdAt: false,
  deletedAt: false,
})
export default class UserIncident extends Model<UserIncident> {
  @Column({
    type: INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  public id: number;

  @ForeignKey(() => User)
  @Column({
    field: 'user_id',
    type: INTEGER,
  })
  public userId: number;

  @BelongsTo(() => User)
  public user: User;

  @ForeignKey(() => Incident)
  @Column({
    field: 'incident_id',
    type: INTEGER,
  })
  public incidentId: number;

  @BelongsTo(() => Incident)
  public incident: Incident;
}
