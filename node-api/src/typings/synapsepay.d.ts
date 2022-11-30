declare module 'synapsepay' {
  export type FindOptions = {
    _id?: string;
    fingerprint?: string;
    ip_address?: string;
    full_dehydrate?: string;
  };

  export type CreateOptions = {};

  export type UpdateOptions = {};

  export type SynapsePayExtras = {
    fingerPrint?: string;
    withoutFullDehydrate?: boolean;
    ip?: string;
  };

  export type SynapsePayUserUpdateFields = {
    firstName?: string;
    lastName?: string;
    email?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    countryCode?: string;
    birthdate?: string;
    ssn?: string;
    license?: Express.Multer.File;
  };

  export type StatementsOptions = {
    _id?: string; // Node id to filter by.
    page?: number;
    per_page?: number;
  };

  export class Helpers {
    public static getUserIP(): string;
  }

  export class Clients {
    constructor(clientId: string, clientSecret: string, production: boolean);
  }

  /**
   * https://docs.synapsefi.com/docs/physical-documents#document-types-list
   */
  export type PhysicalDocumentType =
    | 'GOVT_ID'
    | 'GOVT_ID_BACK'
    | 'GOVT_ID_INT'
    | 'GOVT_ID_INT_BACK'
    | 'VIDEO_AUTHORIZATION'
    | 'SELFIE'
    | 'PROOF_OF_ADDRESS'
    | 'PROOF_OF_INCOME'
    | 'PROOF_OF_ACCOUNT'
    | 'AUTHORIZATION'
    | 'BG_CHECK'
    | 'SSN_CARD'
    | 'EIN_DOC'
    | 'SS4_DOC'
    | 'W9_DOC'
    | 'W2_DOC'
    | 'W8_DOC'
    | 'VOIDED_CHECK'
    | 'AOI'
    | 'BYLAWS_DOC'
    | 'LOE'
    | 'COI'
    | 'LBL'
    | 'SUBSIDIARY_DOC'
    | 'MTL'
    | 'MSB'
    | 'BSA_AUDIT'
    | 'SOC_AUDIT'
    | 'BUSINESS_INSURANCE'
    | 'TOS'
    | 'KYC_POLICY'
    | 'CIP_DOC'
    | 'SUBSCRIPTION_AGREEMENT'
    | 'PROMISSORY_NOTE'
    | 'LEGAL_AGREEMENT'
    | 'REG_GG'
    | 'DBA_DOC'
    | 'DEPOSIT_AGREEMENT'
    | 'OTHER';

  /**
   * https://docs.synapsefi.com/docs/virtual-documents#document-types-list
   */
  export type VirtualDocumentType =
    | 'SSN'
    | 'PASSPORT'
    | 'DRIVERS_LICENSE'
    | 'PERSONAL_IDENTIFICATION'
    | 'TIN'
    | 'DUNS'
    | 'OTHER';

  /**
   * https://docs.synapsefi.com/docs/social-documents#list-of-document-types
   */
  export type SocialDocumentType =
    | 'ADDRESS'
    | 'DATE'
    | 'EMAIL_2FA'
    | 'FACEBOOK'
    | 'LINKEDIN'
    | 'OTHER'
    | 'PHONE_NUMBER_2FA'
    | 'EMAIL'
    | 'TWITTER';

  /**
   * https://docs.synapsefi.com/docs/sub-documents-intro#statuses
   */
  export type SubDocumentStatus =
    | 'SUBMITTED'
    | 'SUBMITTED|REVIEWING'
    | 'SUBMITTED|MFA_PENDING'
    | 'SUBMITTED|VALID'
    | 'SUBMITTED|INVALID'
    | 'SUBMITTED|INVALID|BLACKLIST';

  export type DehydratedBaseDocument = {
    address_city: string;
    address_country_code: string;
    address_postal_code: string;
    address_street: string;
    address_subdivision: string;
    alias: string;
    day: number;
    email: string;
    entity_scope: string;
    entity_type: string;
    id: string;
    id_score: string;
    ip: string;
    month: number;
    name: string;
    permission_scope: string;
    phone_number: string;
    physical_docs: DehydratedSubDocument<PhysicalDocumentType>[];
    screening_results: { [key: string]: string };
    social_docs: DehydratedSubDocument<SocialDocumentType>[];
    virtual_docs: DehydratedSubDocument<VirtualDocumentType>[];
    watchlists: string;
    year: number;
  };

  export type BasicBaseDocument = Pick<
    DehydratedBaseDocument,
    'entity_scope' | 'entity_type' | 'id' | 'id_score' | 'name' | 'permission_scope' | 'watchlists'
  > & {
    physical_docs: BasicSubDocument<PhysicalDocumentType>[];
    social_docs: BasicSubDocument<SocialDocumentType>[];
    virtual_docs: BasicSubDocument<VirtualDocumentType>[];
  };

  export type DehydratedSubDocument<
    T = PhysicalDocumentType | SocialDocumentType | VirtualDocumentType
  > = {
    document_type: T;
    document_value: string;
    id: string;
    last_updated: number;
    meta: {
      matches: {
        address: string;
        dob: string;
        identification: string;
      };
      retry_count: number;
    };
    status: SubDocumentStatus;
  };

  export type BasicSubDocument<
    T = PhysicalDocumentType | SocialDocumentType | VirtualDocumentType
  > = Omit<DehydratedSubDocument<T>, 'document_value' | 'meta'>;

  export type BasicUser = Omit<DehydratedUser, 'documents'> & { documents: BasicBaseDocument[] };

  export type DehydratedUser = {
    _id: string;
    _links: {
      self: {
        href: string;
      };
    };
    client: {
      id: string;
      name: string;
    };
    documents: DehydratedBaseDocument[];
    emails: string[];
    extra: {
      cip_tag: number;
      date_joined: number;
      is_business: boolean;
      is_trusted: boolean;
      last_updated: number;
      supp_id: string | number;
      note: string;
      public_note: string;
    };
    flag: string;
    flag_code: string;
    ips: string[];
    legal_names: string[];
    logins: { email: string; scope: string }[];
    permission: string;
    permission_code: string;
    phone_numbers: string[];
    refresh_token: string;
    watchlists: string;
  };

  export type NodeJSON = {
    _id: string;
    _links: any;
    allowed: string;
    client: any;
    extra: any;
    info: {
      account_num: string;
      address: string;
      balance: {
        amount: string;
        currency: string;
      };
      bank_logo: string;
      bank_long_name: string;
      bank_name: string;
      class: string;
      name_on_account: string;
      nickname: string;
      routing_num: string;
      type: string;
    };
    is_active: boolean;
    type: string;
    user_id: string;
  };

  export type TransactionJSON = {
    _id: string;
    _v?: number;
    _links?: {
      self: {
        href: string;
      };
    };
    amount: {
      amount: number;
      currency: string;
    };
    client: {
      id: string;
      name: string;
    };
    extra: {
      ip: string;
      latlon: string;
      note: string;
      process_on?: number;
      supp_id: string;
      same_day: boolean;
      created_on?: number;
      group_id?: any;
      encrypted_note?: string;
      asset?: any;
    };
    fees: Fee[];
    from: TransactionFromTo;
    recent_status: {
      status: string;
      status_id: string;
      date: number;
      note: string;
    };
    timeline: Array<{ date: number; note: string; status: string; status_id: string }>;
    to: TransactionFromTo;
    recentStatusHash?: string;
  };

  export type CreateTransactionResponse = {
    json: TransactionJSON;
  };

  export type TransactionFromTo = {
    id: string;
    meta?: any;
    nickname: string;
    type: string;
    user: {
      _id: string;
      legal_names: string[];
    };
  };

  export type Fee = {
    fee: number;
    note: string;
    to: {
      id: string;
    };
  };

  export type FromTo = {
    nickname: string;
    type: string;
    user: {
      _id: string;
      legal_names: string[];
    };
  };

  export type Statement = {
    _id: string;
    node_id: string;
    date_end: number; // Milliseconds since epoch
    date_start: number; // Milliseconds since epoch
    urls: {
      csv: string;
      json?: string;
      pdf?: string; // Allegidly always present, but don't rely on it.
    };
  };

  export type UserWebhookData = {
    _id: {
      $oid: string;
    };
    extra: {
      cip_tag: number;
    };
  };

  export type TransactionWebhookData = {
    _id: {
      $oid: string;
    };
    _v?: number;
    _links?: {
      self: {
        href: string;
      };
    };
    _rest: TransactionJSON;
    amount: {
      amount: number;
      currency: string;
    };
    client: {
      id: string;
      name: string;
      created_on?: string;
    };
    extra: {
      created_on?: any;
      ip: string;
      latlon: string;
      note: string;
      process_on?: any;
      supp_id: string;
      same_day: boolean;
      group_id?: any;
      encrypted_note?: string;
      asset?: any;
    };
    fees: WebhookFee[];
    from: WebhookFromTo;
    recent_status: {
      status: string;
      status_id: string;
      date: { $date: number };
      note: string;
    };
    timeline: Array<{ date: { $date: number }; note: string; status: string; status_id: string }>;
    to: WebhookFromTo;
    webhook_meta?: {
      log_id?: string;
      updated_by?: string;
      function?: string;
    };
  };

  export type WebhookFee = {
    fee: number;
    note: string;
    to: SynapseId;
  };

  export type SynapseId = {
    id: {
      $oid: string;
    };
  };

  export type WebhookFromTo = {
    id: { $oid: string };
    meta?: any;
    nickname: string;
    type: string;
    user: {
      _id: { $oid: string };
      legal_names: string[];
    };
  };

  export type UserJSON = DehydratedUser | BasicUser;

  export type CreateUserPayload = {
    logins: { email: string; password?: string }[];
    phone_numbers: string[];
    legal_names: string[];
    documents?: CreateBaseDocumentPayload[];
    extra?: {
      cip_tag?: number;
      extra_security?: boolean;
      note?: string;
      public_note?: string;
      is_business?: boolean;
      supp_id?: string | number;
    };
  };

  export type CreateBaseDocumentPayload = {
    name: string;
    alias?: string;
    email: string;
    phone_number: string;
    ip: string;
    entity_scope: string;
    entity_type: string;
    day: number;
    month: number;
    year: number;
    address_street: string;
    address_city: string;
    address_subdivision: string;
    address_postal_code: string;
    address_country_code: string;
    physical_docs: CreateSubDocumentPayload[];
    social_docs: CreateSubDocumentPayload[];
    virtual_docs: CreateSubDocumentPayload[];
  };

  export type CreateSubDocumentPayload = {
    document_type: string;
    document_value: string;
  };

  export type UpdateSubDocumentPayload = {
    id: string;
    document_type: string;
    document_value: string;
  };

  export type DeleteSubDocumentPayload = {
    id: string;
    document_type: 'DELETE_DOCUMENT';
    document_value?: string;
  };

  export type BaseDocumentUpdate = {
    id: string;
    email?: string;
    name?: string;
    phone_number?: string;
    entity_scope?: string;
    entity_type?: string;
    day?: number;
    month?: number;
    year?: number;
    address_street?: string;
    address_city?: string;
    address_subdivision?: string;
    address_postal_code?: string;
    address_country_code?: string;
    physical_docs?: (
      | CreateSubDocumentPayload
      | UpdateSubDocumentPayload
      | DeleteSubDocumentPayload
    )[];
    social_docs?: (
      | CreateSubDocumentPayload
      | UpdateSubDocumentPayload
      | DeleteSubDocumentPayload
    )[];
    virtual_docs?: (
      | CreateSubDocumentPayload
      | UpdateSubDocumentPayload
      | DeleteSubDocumentPayload
    )[];
  };

  export type UpdateUserPermission = 'CLOSED' | 'LOCKED' | 'MAKE-IT-GO-AWAY';
  export type UpdateUserPermissionCode = 'USER_REQUEST' | 'DUPLICATE_ACCOUNT';

  export type UpdateUserPayload = {
    permission?: UpdateUserPermission;
    permission_code?: UpdateUserPermissionCode;
    documents?: BaseDocumentUpdate[];
  };

  export class User<T = UserJSON> {
    public json: T;

    public oauth_key: string;

    constructor();

    public updateAsync(update: UpdateUserPayload): Promise<User<BasicUser>>;
  }

  export class Node {
    public json: any;
    public allowed: string;

    public updateAsync(update: UpdateOptions): Promise<this>;

    public deleteAsync(): Promise<void>;

    public resendMicroAsync(): Promise<void>;
  }

  export class Users {
    public static getAsync(
      clients: Clients,
      findOptions: {
        _id?: string;
        fingerprint?: string;
        ip_address?: string;
        full_dehydrate: 'yes';
      },
    ): Promise<User<DehydratedUser>>;
    public static getAsync(clients: Clients, findOptions: FindOptions): Promise<User<BasicUser>>;

    public static createAsync(
      client: Clients,
      fingerprint: string,
      ip: string,
      payload: CreateUserPayload,
    ): Promise<User<BasicUser>>;

    constructor();
  }

  export class Nodes {
    public static getAsync(user: User, withoutOptions: null): Promise<{ nodes: NodeJSON[] }>;
    public static getAsync(user: User, findOptions: FindOptions): Promise<Node>;

    public static createAsync(user: User, createOptions: CreateOptions): Promise<Node[]>;
  }

  export class Statements {
    public static getAsync(
      user: User,
      options: StatementsOptions,
    ): Promise<{ statements: Statement[] }>;
  }

  export class Transactions {
    public static createAsync(
      node: Node,
      createOptions: CreateOptions,
    ): Promise<CreateTransactionResponse>;

    public static getAsync(node: Node, findOptions: FindOptions): Promise<any>;
  }
}
