import * as config from 'config';

// Associated ticket field ids are in this link:
// https://davesaves.zendesk.com/agent/admin/ticket_fields
export const ZENDESK_CUSTOM_FIELD_ID = {
  TICKET_PRIORITY: config.get<number>('zendesk.customTicketFields.ticketPriority'),
  BUCKET: config.get<number>('zendesk.customTicketFields.bucket'),
  PHONE_NUMBER: config.get<number>('zendesk.customTicketFields.phoneNumber'),
  USER_SUBMITTED_REASON: config.get<number>('zendesk.customTicketFields.userSubmittedReason'),
};

// Associated priority field ids are in the link, click on 'Show Tags'
// https://davesaves.zendesk.com/agent/admin/ticket_fields/360009245991
export enum ZENDESK_TICKET_PRIORITY {
  URGENT = '1-urgent',
  HIGHEST = '2-highest',
  HIGH = '3-high',
  NORMAL = '4-normal',
  LOW = '5-low',
  LOWEST = '6-lowest',
}

// Associated bucket field ids are in the link, click on 'Show Tags'
// https://davesaves.zendesk.com/agent/admin/ticket_fields/360009245991
export enum ZENDESK_BUCKETS {
  OTHER = 'other',
  TIP_UPDATE = 'tip_update',
  CANCELLATION = 'cancellation',
  DUPLICATE_CARD = 'card_issue',
  TEXT_CODE = 'text_code',
  PAYBACK_DATE_UPDATE = 'payback_date_update',
  BILLING_MEMBERSHIP_ISSUES = 'billing/membership_issues',
  ADVANCE_CONFIRMATION = 'advance_confirmation',
  PROFILE_UPDATE = 'profile_update',
  RESOLVED = 'resolved',
  OVERRIDE_SETUP = 'override__add_transaction',
  OVERRIDE_INCORRECT_AMOUNT = 'override__incorrect_amount',
  BANK_ISSUE_NOT_ENOUGH_TRANSACTIONAL = 'not_enough_transactional_',
  BANK_ISSUE_MICRO_DEPOSITS = 'micro-deposits_',
  BANK_ISSUE_WONT_CONNECT = 'bank_issue__won_t_connect',
  BANK_ISSUE_DUPLICATE_BANK = 'bank_issue__duplicate_bank',
  ERROR_19 = 'error_19',
  HOW_IT_WORKS = 'unqualified',
  FRAUD_BLOCK_DEVICE = 'fraud_block__device',
  FRAUD_BLOCK_EMAIL = 'fraud_block__email',
  FRAUD_BLOCK_UNRESOLVED = 'fraud_block__unresolved',
  IDENTITY_VERIFICATION_ISSUES = 'identity_verification_issues',
  BILLING_EXPLANATION = 'billing___explanation',
}

export enum ZENDESK_USER_SUBMITTED_REASONS {
  BORROWING_MONEY_WHY_DID_MY_AMOUNT_GO_DOWN = 'borrowing_money__why_did_my_amount_go_down_',
  BORROWING_MONEY_INCORRECT_PAYBACK_DATE = 'borrowing_money__incorrect_payback_date',
  BORROWING_MONEY_CANT_SET_INCOME = 'borrowing_money__can_t_set_income',
  BORROWING_MONEY_WHERES_MY_MONEY = 'borrowing_money__where_s_my_money_',
  BORROWING_MONEY_NOT_ENOUGH_TRANSACTIONAL_HISTORY = 'borrowing_money__not_enough_transactional_history',

  BILLING_OR_PAYING_IT_BACK_WHAT_IS_THE_1_CHARGE = 'billing_/_paying_it_back__what_is_the__1_charge_',
  BILLING_OR_PAYING_IT_BACK_PAY_WITH_DIFFERENT_CARD_OR_ACCOUNT = 'billing_/_paying_it_back__pay_with_different_card_/_account',
  BILLING_OR_PAYING_IT_BACK_PAYBACK_EXTENSION_REQUESTS = 'billing_/_paying_it_back__payback_extension_requests',
  BILLING_OR_PAYING_IT_BACK_UNFAMILIAR_CHARGE = 'billing_/_paying_it_back__unfamiliar_charge',
  BILLING_OR_PAYING_IT_BACK_TIPS = 'billing_/_paying_it_back__tips',

  BANK_CONNECTION_PROBLEMS_JOINT_ACCOUNT = 'bank_connection_problems__joint_account',
  BANK_CONNECTION_PROBLEMS_CANT_CONNECT_MY_BANK = 'bank_connection_problems__can_t_connect_my_bank',
  BANK_CONNECTION_PROBLEMS_NEED_TO_SWITCH_BANKS = 'bank_connection_problems__need_to_switch_banks',
  BANK_CONNECTION_PROBLEMS_BANK_NOT_LISTED = 'bank_connection_problems__bank_not_listed',
  BANK_CONNECTION_PROBLEMS_WAITING_ON_MICRO_DEPOSIT = 'bank_connection_problems__waiting_on_micro_deposit',

  DAVE_ACCOUNT_LOGIN = 'dave_account_login_',

  UPDATE_INFO_OR_CANCEL_ACCOUNT_CANCEL_MY_DAVE_MEMBERSHIP = 'update_info_or_cancel_account__cancel_my_dave_membership',
  UPDATE_INFO_OR_CANCEL_ACCOUNT_UPDATING_MY_PHONE_NUMBER = 'update_info_or_cancel_account__updating_my_phone_number',

  // I added the word rejection in there because zendesk tag was 'error 19', but tag was 'card rejection'
  DEBIT_CARD_ISSUES_REJECTION_ERROR_19 = 'debit_card_issues__error_19',
  DEBIT_CARD_ISSUES_DAVE_REWARDS = 'debit_card__dave_rewards_',
  DEBIT_CARD_ISSUES_CARD_EXPIRING = 'debit_card_issues__card_expiring',
  DEBIT_CARD_ISSUES_GET_A_NEW_NUMBER_THIS_CARD_WAS_PREVIOUSLY_USED = 'debit_card_issues__get_a_new_number__this_card_was_previously_used.',
}

export enum ZENDESK_TAGS {
  AUTOREPLIEDTO = 'autorepliedto',
  NOTRIGGER = 'notrigger',
}

export enum ZENDESK_ARTICLE_VOTE_DIRECTION {
  UP = 'up',
  DOWN = 'down',
}

export enum ZENDESK_TICKET_BRANDS {
  DAVE = 'dave',
  DAVE_BANKING = 'dave_banking',
}

export const zendeskTicketBrandValues: { [brand: string]: ZENDESK_TICKET_BRANDS } = {
  dave: ZENDESK_TICKET_BRANDS.DAVE,
  daveBanking: ZENDESK_TICKET_BRANDS.DAVE_BANKING,
};

export const ZENDESK_MAX_ATTACHMENTS = 10;
