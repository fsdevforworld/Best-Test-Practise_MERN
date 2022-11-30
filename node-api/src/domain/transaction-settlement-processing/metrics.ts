import { wrapMetrics } from '../../lib/datadog-statsd';

export const enum TransactionSettlementProcesingMetrics {
  FILES_PROCESSED = 'transaction_settlement.files_processed',
  PROCESSING_ROW = 'transaction_settlement.attempting_to_process_row',
  ROW_CONVERTED = 'transaction_settlement.row_converted',
  SKIPPING_SETTLEMENT_ROW_STALE = 'transaction_settlement.skipping_settlement_row_stale',
  DOWNLOADING_FILE = 'transaction_settlement.file_being_downloaded',
  ERROR_ITERATING_FILE = 'transaction_settlement.error_iterating_file',
  ERROR_PIPING_TO_GCLOUND = 'transaction_settlement.error_piping_to_gcloud',
  ERROR_PROCESSING_ROW = 'transaction_settlement.error_processing_row',
  ERROR_PARSING_ROW = 'transaction_settlement.error_parsing_row',
  ERROR_PARSING_STATUS = 'transaction_settlement.error_parsing_status',
  CREATED = 'transaction_settlement.created',
  UPDATED = 'transaction_settlement.updated',
  PAYMENT_UPDATED = 'transaction_settlement.payment_updated',
  ERROR_UPDATING_ADVANCE_NETWORK = 'transaction_settlement.advance_network_update_error',
  ADVANCE_NETWORK_UPDATED = 'transaction_settlement.advance_updated',
  ROW_DATA_PUBLISHED = 'transaction_settlement.tabapay_row_data_published',
  ERROR_ROW_DATA_PUBLISHED = 'transaction_settlement.error_publish_tabapay_row_data',
  UPDATE_PUBLISHED = 'transaction_settlement.update_published',
  ERROR_UPDATE_PUBLISHED = 'transaction_settlement.error_publish_update',
}

export const metrics = wrapMetrics<TransactionSettlementProcesingMetrics>();
