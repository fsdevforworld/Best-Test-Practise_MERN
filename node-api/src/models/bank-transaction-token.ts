import { INTEGER, STRING } from 'sequelize';
import { BelongsTo, Column, ForeignKey, Model, Table } from 'sequelize-typescript';
import MerchantInfo from './merchant-info';

@Table({
  timestamps: false,
  tableName: 'bank_transactions_tokens',
})
export default class BankTransactionToken extends Model<BankTransactionToken> {
  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    field: 'token_string',
    type: STRING,
  })
  public tokenString: string;

  @ForeignKey(() => MerchantInfo)
  @Column({
    field: 'merchant_info_id',
    type: INTEGER,
  })
  public merchantInfoId: number;

  @BelongsTo(() => MerchantInfo)
  public merchantInfo: MerchantInfo;

  @Column({
    type: STRING,
  })
  public category: string;

  @Column({
    type: STRING,
    field: 'sub_category',
  })
  public subCategory: string;
}
