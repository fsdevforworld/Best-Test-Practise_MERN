import { Rule } from 'json-rules-engine';
import { AdvanceCollectionTrigger } from '../../typings';

export enum INVALID_ADVANCE_COLLECTION_TYPES {
  PAYMENT_TOO_SMALL = 'payment-too-small',
  PAYMENT_TOO_LARGE = 'payment-too-large',
  PAYBACK_FROZEN = 'payback-frozen',
  DISBURSEMENT_NOT_COMPLETE = 'disbursement-not-complete',
  TOO_MANY_SUCCESSFUL_COLLECTION_ATTEMPTS = 'too-many-successful-collections',
  PAYMENT_TOO_SMALL_FINAL_ATTEMPT = 'payment-too-small-for-final-attempt',
  COLLECTING_ANOTHER_ADVANCE = 'collecting-another-advance',
}

export const COMPLIANCE_EXEMPT_TRIGGERS: AdvanceCollectionTrigger[] = [
  AdvanceCollectionTrigger.ADMIN,
  AdvanceCollectionTrigger.ADMIN_MANUAL_CREATION,
  AdvanceCollectionTrigger.USER,
  AdvanceCollectionTrigger.USER_ONE_TIME_CARD,
  AdvanceCollectionTrigger.USER_WEB,
];

export default {
  paymentTooSmall: {
    conditions: {
      any: [
        {
          fact: 'paymentAmount',
          operator: 'lessThanInclusive',
          value: 0,
        },
        {
          all: [
            {
              fact: 'paymentAmount',
              operator: 'lessThan',
              value: 5,
            },
            {
              fact: 'advance',
              path: '.outstanding',
              operator: 'greaterThanInclusive',
              value: 5,
            },
          ],
        },
        {
          all: [
            {
              fact: 'paymentAmount',
              operator: 'lessThan',
              value: {
                fact: 'advance',
                path: '.outstanding',
              },
            },
            {
              fact: 'advance',
              path: 'outstanding',
              operator: 'lessThan',
              value: 5,
            },
          ],
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.PAYMENT_TOO_SMALL,
      params: {
        message: 'Payment amount too small',
      },
    },
  },
  paymentTooLarge: {
    conditions: {
      all: [
        {
          fact: 'paymentAmount',
          operator: 'greaterThan',
          value: {
            fact: 'advance',
            path: '.outstanding',
          },
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.PAYMENT_TOO_LARGE,
      params: {
        message: 'Payment amount more than advance amount',
      },
    },
  },
  paybackFrozen: {
    conditions: {
      all: [
        {
          fact: 'advance',
          path: '.paybackFrozen',
          operator: 'equal',
          value: true,
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.PAYBACK_FROZEN,
      params: {
        message: 'Cannot make payment when payback is frozen',
      },
    },
  },
  disbursementNotComplete: {
    conditions: {
      all: [
        {
          fact: 'advance',
          path: '.disbursementStatus',
          operator: 'notEqual',
          value: 'COMPLETED',
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.DISBURSEMENT_NOT_COMPLETE,
      params: {
        message: 'Cannot make payment when disbursement is not complete',
      },
    },
  },
  tooManySuccessfulCollectionAttempts: {
    conditions: {
      all: [
        {
          fact: 'numSuccessfulCollectionAttempts',
          operator: 'greaterThanInclusive',
          value: 4,
        },
        {
          fact: 'trigger',
          operator: 'notIn',
          value: COMPLIANCE_EXEMPT_TRIGGERS,
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.TOO_MANY_SUCCESSFUL_COLLECTION_ATTEMPTS,
      params: {
        message: 'Cannot collect again if there have been four successful collection attempts',
      },
    },
  },
  paymentTooSmallForFinalAttempt: {
    conditions: {
      all: [
        {
          fact: 'numSuccessfulCollectionAttempts',
          operator: 'equal',
          value: 3,
        },
        {
          fact: 'paymentAmount',
          operator: 'lessThan',
          value: {
            fact: 'advance',
            path: '.outstanding',
          },
        },
        {
          fact: 'trigger',
          operator: 'notIn',
          value: COMPLIANCE_EXEMPT_TRIGGERS,
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.PAYMENT_TOO_SMALL_FINAL_ATTEMPT,
      params: {
        message: 'The final advance collection must cover the outstanding amount due',
      },
    },
  },
  collectingAnotherAdvance: {
    conditions: {
      all: [
        {
          fact: 'isActive',
          operator: 'equal',
          value: false,
        },
        {
          fact: 'trigger',
          operator: 'notIn',
          value: COMPLIANCE_EXEMPT_TRIGGERS,
        },
      ],
    },
    event: {
      type: INVALID_ADVANCE_COLLECTION_TYPES.COLLECTING_ANOTHER_ADVANCE,
      params: {
        message: 'Another open advance is being collected, or has just recently been repaid',
      },
    },
  },
} as Record<string, Rule>;
