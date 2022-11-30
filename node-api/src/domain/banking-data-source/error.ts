import { BankingDataSource } from '@dave-inc/wire-typings';
import { Tags } from 'hot-shots';
import { PlaidErrorCode, BankingDataSourceErrorType } from '../../typings';

export class BankingDataSourceError extends Error {
  public bankingDataSource: BankingDataSource;
  public errorCode: PlaidErrorCode | string;
  public errorType: BankingDataSourceErrorType;
  public message: string;
  public httpCode: number;
  public requestId: string;
  public data: any;

  constructor(
    message: string,
    bankingDataSource: BankingDataSource,
    errorCode: PlaidErrorCode | string,
    errorType: BankingDataSourceErrorType,
    data: any,
    httpCode?: number,
    requestId?: string,
  ) {
    super(message);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BankingDataSourceError);
    }

    this.bankingDataSource = bankingDataSource;
    this.errorCode = errorCode;
    this.errorType = errorType;
    this.message = message;
    this.httpCode = httpCode;
    this.requestId = requestId;
    this.data = data;
  }

  public generateMetricTags(): Tags {
    return {
      error_code: this.errorCode,
      error_type: this.errorType,
      http_code: this.httpCode ? this.httpCode.toString() : null,
    };
  }
}
