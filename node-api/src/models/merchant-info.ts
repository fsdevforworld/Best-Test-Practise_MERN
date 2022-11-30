import { BOOLEAN, INTEGER, STRING } from 'sequelize';
import { Column, CreatedAt, HasMany, Model, Table, UpdatedAt } from 'sequelize-typescript';
import { NGrams } from 'natural';
import { MerchantInfoResponse } from '@dave-inc/wire-typings';
import redisClient from '../lib/redis';
import * as changeCase from 'change-case';
import BankTransactionToken from './bank-transaction-token';
import { dogstatsd } from '../lib/datadog-statsd';
import { ISerializable } from '../typings';
import { Category, getCategoryImage } from '../domain/merchant-info';
import logger from '../lib/logger';

@Table({
  tableName: 'merchant_info',
})
export default class MerchantInfo extends Model<MerchantInfo>
  implements ISerializable<MerchantInfoResponse> {
  public static defaultValues: Partial<MerchantInfo> = {
    displayName: '',
    logo: '',
    url: '',
    id: 1,
  };

  public static tokenizeTransactionName(displayName: string): string[] {
    const ngrams = NGrams.ngrams.bind(undefined, displayName);
    return [...ngrams(1), ...ngrams(2), ...ngrams(3)]
      .map((row: string[]) => row.join(' '))
      .filter(t => t.length > 1);
  }

  public static getDefaultMerchantInfo(category: string) {
    const merchantInfo = MerchantInfo.build(MerchantInfo.defaultValues);
    merchantInfo.setCategoryImage(category);

    return merchantInfo;
  }

  public static getCacheKey(displayName: string, category: string, subCategory: string) {
    return `merchantInfo:${displayName}:${changeCase.paramCase(category)}:${changeCase.paramCase(
      subCategory,
    )}`;
  }

  public static async getFromCache(cacheKey: string) {
    const record = await redisClient.getAsync(cacheKey);
    if (record) {
      const data = JSON.parse(record);
      const merchantInfo = MerchantInfo.build(data);
      merchantInfo.categoryImage = data.categoryImage;
      return merchantInfo;
    }

    return null;
  }

  public static saveToCache(cacheKey: string, merchantInfo: MerchantInfo) {
    return redisClient.setAsync([
      cacheKey,
      JSON.stringify(merchantInfo.serialize()),
      'EX',
      24 * 3600,
    ]);
  }

  public static async getMerchantInfo(
    displayName: string,
    category: string,
    subCategory: string,
  ): Promise<MerchantInfo> {
    const cacheKey = this.getCacheKey(displayName, category, subCategory);
    try {
      const cached = await this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const tokens = MerchantInfo.tokenizeTransactionName(displayName);
      if (!tokens.length) {
        return this.getDefaultMerchantInfo(category);
      }

      const bankTransactionToken = await BankTransactionToken.findOne({
        where: {
          category: category || null,
          subCategory: subCategory || null,
          tokenString: tokens,
        },
        include: [{ model: MerchantInfo, required: true }],
      });

      if (bankTransactionToken && bankTransactionToken.merchantInfo) {
        bankTransactionToken.merchantInfo.setCategoryImage(category);
        await this.saveToCache(cacheKey, bankTransactionToken.merchantInfo);
        return bankTransactionToken.merchantInfo;
      }
    } catch (err) {
      logger.error('Error getting merchant info', { err });
      dogstatsd.increment('get_merchant_info.error');
    }

    return this.getDefaultMerchantInfo(category);
  }

  @HasMany(() => BankTransactionToken)
  public bankTransactionTokens: BankTransactionToken[];

  @Column({
    autoIncrement: true,
    primaryKey: true,
    type: INTEGER,
  })
  public id: number;

  @Column({
    type: STRING(256),
    field: 'name',
  })
  public name: string;

  @Column({
    type: STRING(64),
    field: 'display_name',
  })
  public displayName: string;

  @Column({
    type: STRING(256),
    field: 'url',
  })
  public url: string;

  @Column({
    type: STRING(256),
    field: 'logo',
  })
  public logo: string;

  @Column({
    type: INTEGER,
    field: 'unique_users_count',
  })
  public uniqueUsersCount: number;

  @Column({
    type: BOOLEAN,
  })
  public exclude: boolean;

  @CreatedAt
  public created: Date;

  @UpdatedAt
  public updated: Date;

  public categoryImage: string;

  public setCategoryImage(category: string) {
    this.categoryImage = getCategoryImage(category as Category);
  }

  public serialize(): MerchantInfoResponse {
    return {
      id: this.id,
      name: this.name,
      displayName: this.displayName,
      url: this.url,
      logo: this.logo,
      categoryImage: this.categoryImage,
    };
  }
}
