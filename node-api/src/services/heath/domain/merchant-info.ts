import { MerchantInfo as DBMerchantInfo, BankTransactionToken } from '../../../models';
import { NGrams } from 'natural';
import { MerchantInfoResponse } from '@dave-inc/wire-typings';
import * as changeCase from 'change-case';
import redisClient from '../../../lib/redis';
import { dogstatsd } from '../../../lib/datadog-statsd';
import { getCategory, getSubCategory } from '../../../domain/bank-transaction';
import { Category, getCategoryImage } from '../../../domain/merchant-info';
import { formatDisplayName } from '../../../lib/format-transaction-name';
import logger from '../../../lib/logger';

export const DEFAULT_MERCHANT_INFO: MerchantInfoResponse = {
  displayName: '',
  name: '',
  logo: '',
  url: '',
  id: 1,
  categoryImage: null,
};

export function formatMerchantInfo(merchantInfo: DBMerchantInfo): MerchantInfoResponse {
  return {
    id: merchantInfo.id,
    name: merchantInfo.name,
    displayName: merchantInfo.displayName,
    url: merchantInfo.url,
    logo: merchantInfo.logo,
    categoryImage: merchantInfo.categoryImage,
  };
}

function tokenizeTransactionName(displayName: string): string[] {
  const ngrams = NGrams.ngrams.bind(undefined, displayName);
  return [...ngrams(1), ...ngrams(2), ...ngrams(3)]
    .map((row: string[]) => row.join(' '))
    .filter(t => t.length > 1);
}

function getDefaultMerchantInfo(category: string): MerchantInfoResponse {
  return {
    ...DEFAULT_MERCHANT_INFO,
    categoryImage: getCategoryImage(category as Category),
  };
}

function getCacheKey(displayName: string, category: string, subCategory: string) {
  return `merchantInfo:${displayName}:${changeCase.paramCase(category)}:${changeCase.paramCase(
    subCategory,
  )}`;
}

async function getFromCache(cacheKey: string): Promise<MerchantInfoResponse> {
  const record = await redisClient.getAsync(cacheKey);
  if (record) {
    return JSON.parse(record);
  }

  return null;
}

function saveToCache(cacheKey: string, merchantInfo: MerchantInfoResponse) {
  return redisClient.setAsync([cacheKey, JSON.stringify(merchantInfo), 'EX', 24 * 3600]);
}

export async function getMerchantInfo(
  displayName: string,
  category: string,
  subCategory: string,
): Promise<MerchantInfoResponse> {
  const cacheKey = getCacheKey(displayName, category, subCategory);
  try {
    const cached = await getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const tokens = tokenizeTransactionName(displayName);
    if (!tokens.length) {
      return getDefaultMerchantInfo(category);
    }

    const bankTransactionToken = await BankTransactionToken.findOne({
      where: {
        category: category || null,
        subCategory: subCategory || null,
        tokenString: tokens,
      },
      include: [{ model: DBMerchantInfo, required: true }],
    });

    if (bankTransactionToken && bankTransactionToken.merchantInfo) {
      const merchantInfo = formatMerchantInfo(bankTransactionToken.merchantInfo);
      merchantInfo.categoryImage = getCategoryImage(category as Category);
      await saveToCache(cacheKey, merchantInfo);
      return merchantInfo;
    }
  } catch (error) {
    logger.error('Error retrieving merchant info', { error });
    dogstatsd.increment('get_merchant_info.error');
  }

  return getDefaultMerchantInfo(category);
}

export type MerchantInfoBankTransactionFields = {
  plaidCategory?: string[];
  displayName?: string;
  externalName: string;
  pendingExternalName?: string;
  amount: number;
  merchantInfoId?: number;
  merchantInfo?: MerchantInfoResponse;
};

export async function getMerchantInfoForBankTransaction(
  bankTransaction: MerchantInfoBankTransactionFields,
): Promise<MerchantInfoResponse> {
  const category = getCategory(bankTransaction);
  const subCategory = getSubCategory(bankTransaction);
  const displayName = Boolean(bankTransaction.displayName)
    ? bankTransaction.displayName
    : getMerchantInfoDisplayName(bankTransaction.externalName, bankTransaction.pendingExternalName);

  if (bankTransaction.merchantInfo) {
    bankTransaction.merchantInfo.categoryImage = getCategoryImage(category as Category);
    return bankTransaction.merchantInfo;
  }

  // displayName.match(/dave/i) is added here so that we could try to
  // match advance that Dave sends the users
  if (bankTransaction.amount < 0 || displayName.match(/dave/i)) {
    return getMerchantInfo(displayName, category, subCategory);
  } else {
    /*
     * We could probably detect if is user's paycheck and add logo for paycheck because
     * vendor info is not populated
     */
    const defaultIncomeCategory = 'Transfer';
    return getDefaultMerchantInfo(defaultIncomeCategory);
  }
}

function getMerchantInfoDisplayName(externalName: string, pendingExternalName: string) {
  if (externalName) {
    return formatDisplayName(externalName);
  } else if (pendingExternalName) {
    return formatDisplayName(pendingExternalName);
  }

  return '';
}
