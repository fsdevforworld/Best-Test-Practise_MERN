const EVENTS = {
  /**
   * Join Dave / Register Number
   */
  JOIN_DAVE_SELECTED: 'join dave selected',
  JOIN_DAVE_SUCCESS: 'join dave code verified', // TODO rename event
  JOIN_DAVE_FAILED: 'join dave code failed', // TODO rename event

  PHONE_NUMBER_REGISTER_LOADED: 'phone number register screen loads',
  PHONE_NUMBER_RESEND_VERIFICATION_CODE: 'phone number resend verification code',
  PHONE_NUMBER_RESEND_VERIFICATION_CODE_SUCCESS: 'phone number resend verification code success',
  PHONE_NUMBER_RESEND_VERIFICATION_CODE_FAILED: 'phone number resend verification code failed',

  /**
   * Phone Number Verification
   */
  PHONE_NUMBER_VERIFY_LOADED: 'phone number verify screen loads',
  PHONE_NUMBER_VERIFICATION_REQUESTED: 'phone number verification requested', // new
  PHONE_NUMBER_VERIFICATION_SUCCESS: 'phone number verified',
  PHONE_NUMBER_VERIFICATION_FAILED: 'phone number verification failed',
  PHONE_NUMBER_VERIFICATION_HELP_MODAL_OPENED: 'phone number help verification help modal opened',
  PHONE_NUMBER_VERIFICATION_HELP_MODAL_CLOSED: 'phone number help verification help modal closed',

  EMAIL_AND_PASSWORD_CREATION_FAIL: 'email and password creation failed',
  EMAIL_AND_PASSWORD_CREATION_SUCCESS: 'email and password creation success',

  /**
   * Welcome Back / Already a User
   */
  WELCOME_BACK_LOADED: 'welcome back screen loads',

  /**
   * Successful registration
   */
  SUCCESSFUL_REGISTRATION_LOADED: 'welcome screen loads',

  /**
   * Connect your Bank / Plaid
   */
  CONNECT_YOUR_BANK_LOADED: 'connect your bank screen loads', // web app only event (mobile app just has `plaid opened`)
  PLAID_OPENED: 'plaid opened',
  PLAID_CLOSED: 'plaid closed',
  PLAID_CREDENTIALS_SUBMITTED: 'plaid credentials submitted',
  PLAID_BANK_CREDENTIALS_AUTHORIZED: 'plaid bank credentials authorized',
  PLAID_BANK_SELECTED: 'plaid bank selected',
  PLAID_ERROR: 'plaid error',
  BANK_CONNECTED: 'bank connected',

  PLAID_DOWN_MODAL_OPENED: 'plaid down modal opened', // equivalent to plaid down screen loads on mobile
  PLAID_DOWN_MODAL_CLOSED: 'plaid down modal closed',
  BANK_CONNECT_ALREADY_CONNECTED_MODAL_OPENED: 'bank connect already connected modal opened',
  BANK_CONNECT_ALREADY_CONNECTED_MODAL_CLOSED: 'bank connect already connected modal closed',
  BANK_CONNECT_NOT_SUPPORTED_MODAL_OPENED: 'bank connect not supported modal opened',
  BANK_CONNECT_NOT_SUPPORTED_MODAL_CLOSED: 'bank connect not supported modal closed',
  BANK_CONNECT_DEFAULT_ERROR_MODAL_OPENED: 'bank connect default error modal opened',
  BANK_CONNECT_DEFAULT_ERROR_MODAL_CLOSED: 'bank connect default error modal closed',
  BANK_CONNECT_MICRODEPOSIT_REQUIRED_MODAL_OPENED:
    'bank connect microdeposit required modal opened',
  BANK_CONNECT_MICRODEPOSIT_REQUIRED_MODAL_CLOSED:
    'bank connect microdeposit required modal closed',

  PLAID_WHY_CONNECT_MODAL_OPENED: 'plaid why connect modal opened',
  PLAID_WHY_CONNECT_MODAL_CLOSED: 'plaid why connect modal closed',
  PLAID_WHY_CONNECT_MODAL_SLIDE_CHANGED: 'plaid why connect modal slided changed',

  /**
   * Onboarding
   */
  ONBOARDING_MODAL_OPENED: 'onboarding modal opened',
  ONBOARDING_MODAL_CLOSED: 'onboarding modal closed',
  ONBOARDING_TRANSACTION_DATA_ANALYZED: 'onboarding transaction data analyzed',
  INCOME_ADDED_SUCCESS: 'income added success',
  ONBOARDING_ADVANCE_TERMS_RETRIEVED: 'onboarding advance terms received',
  NOTIFICATIONS_ENABLED: 'notifications enabled',

  /**
   * Advance Approval
   */
  ADVANCE_APPROVAL_LOADED: 'advance approval screen loads',
  ADVANCE_APPROVAL_QUALIFY_MODAL_OPENED: 'advance approval qualify modal opened',
  ADVANCE_APPROVAL_QUALIFY_MODAL_CLOSED: 'advance approval qualify modal closed',
};

export default EVENTS;
