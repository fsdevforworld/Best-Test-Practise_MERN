import { STRING, INTEGER } from 'sequelize';
import { Column, CreatedAt, Model, Table } from 'sequelize-typescript';
import { Moment } from 'moment';

@Table({
  tableName: 'transaction_settlement_processed_file',
  updatedAt: false,
})
export default class TransactionSettlementProcessedFile extends Model<
  TransactionSettlementProcessedFile
> {
  public static async isFileUnprocessed(fileName: string): Promise<boolean> {
    return (await TransactionSettlementProcessedFile.count({ where: { fileName } })) === 0;
  }

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    field: 'file_name',
    type: STRING,
  })
  public fileName: string;

  @Column({
    field: 'rows_processed',
    type: INTEGER,
  })
  public rowsProcessed: number;

  @Column({
    field: 'process_time_seconds',
    type: INTEGER,
  })
  public processTimeSeconds: number;

  @CreatedAt
  public created: Moment;
}
