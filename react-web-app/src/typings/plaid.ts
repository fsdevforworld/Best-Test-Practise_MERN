export type PlaidSuccessMetadata = {
  institution: PlaidInstitution;
  account: {
    id: string;
    name: string;
    type: string;
    subtype: string;
    mask: string;
  };
  account_id: null;
  accounts: PlaidSuccessAccounts[];
  link_session_id: string;
  public_token: string;
};

type PlaidSuccessAccounts = {
  id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
};

type PlaidInstitution = {
  institution_id: string;
  name: string;
};

export type PlaidEventMetadata = {
  error_code: string;
  error_message: string;
  error_type: string;
  exit_status: string;
  institution_id: string;
  institution_name: string;
  institution_search_query: string;
  link_session_id: string;
  mfa_type: string;
  view_name: string;
  request_id: string;
  timestamp: string;
};

export type PlaidExitMetadata = {
  institution: PlaidInstitution;
  request_id: string;
  link_session_id: string;
  status: string;
};
