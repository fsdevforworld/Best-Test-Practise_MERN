# Migrating encrypted fields

`ssn` is a field encrypted using [Amazon KMS](https://aws.amazon.com/kms/). As part of the one-time migration from v0 to v1 architechture, our script will need to decrypt using Amazon's KMS and re-encrypt using gcloud KMS.


# Migrating debit cards

Debit Cards are currently stored in RisePay's vault. We'll have to encrypt and move them to TabaPay.
Before adding to TabaPay, we will check that the card's IIN matches the user's bank connection institution.
If it does, we tie the card and connection. If not, we won't add it.
