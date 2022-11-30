# Payment Provider

A company offering online services for accepting electronic payments by a variety of payment methods including credit card, bank-based payments such as direct debit, bank transfer, and real-time bank transfer based on online banking.

# Gateway API

## Transaction
### Attributes

(*) denotes required field

`externalId` *
: *string*. The unique identifier for the transaction. This is supplied by the payment provider after a successful create transaction request.

`referenceId` *
: *string*. An additional identifier that is sent by Dave with the original create transaction request.

`amount` *
: *float*. A positive value.

`gateway` *
: *string*. The payment gateway that the transaction was transmitted through.

`outcome`
: *hash* Details about whether the transaction was accepted, and why.
  * `message`
  : *string*. A human readable description of the outcome of the transaction.
  * `code`
  : *string*. Intended for programmatic handling of transaction failures.

`processor` *
: *string*. The name of the payment processing company that handled the transaction

`status` *
: *string*. Can be either `PENDING`, `COMPLETED`, `FAILED`, `CANCELED` or `RETURNED`. See below for more details.

`type` *
: *string*. Can be either `advance-payment`, `advance-disbursement`, or `subscription-payment`.

`reversalStatus`
: *string*. If a payment reversal has been attempted the status will be here. Can be either `PENDING`, `COMPELTED` or `FAILED`.

#### Statuses
* `PENDING`
: Transaction has been created but has not finished processing.
* `COMPLETED`
: Transaction was succesfully processed.
* `FAILED`
: Transaction was declined or did not succeed.
* `CANCELED`
: The transaction was stopped and reversed before processing was finished.
* `RETURNED`
: The transaction was successfully processed and later reversed.

### `Gateway.fetchTransaction`
Retrieve a transaction from the provider. Refer to the specific provider for the required arguments.

#### Arguments
* `externalId` or `referenceId`.

* `type`

* `processor`
: If the provider is a gateway (such as Risepay) you must include a `processor`.

* `ownerId`
: The provider's id for the user

* `sourceId`
: The provider's id for the debit card or bank account

* `correspondingId`
: For an advance-payment this would be the corresponding advance externalId


#### Example Requests
```typescript
// Synapsepay
SynapsepayGateway.fetchTransaction({
  externalId: '5c392b78fe8c6b008ab6cef0',
  type: PaymentGatewayTransactionType.AdvanceDisbursement,
});


// Tabapay
TabapayGateway.fetchTransaction({
  referenceId: 'test-ref-4',
  type: PaymentGatewayTransactionType.AdvancePayment,
});

// Risepay
RisepayGateway.fetchTransaction({
  externalId: '100049',
  processor: ExternalTransactionProcessor.Tabapay,
  type: PaymentGatewayTransactionType.SubscriptionPayment
});
```

#### Example Response
```typescript
{
  externalId: '100049',
  referenceId: '002',
  amount: 0.1,
  processor: 'TABAPAY',
  gateway: 'RISEPAY',
  status: 'COMPLETED',
}
```
