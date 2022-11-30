# Usage

`gcloud auth application-default login` (local dev only; GCE instances use default service account credentials)

```bash
export CRYPTO_KEY_PATH="projects/dave-173321/locations/global/keyRings/staging/cryptoKeys/api"
```

```javascript

const gcloudKms = require('./lib/gcloud-kms');

const encryptedFoo = (await gcloudKms.encrypt('foo')).ciphertext;
console.log('encrypted foo: ', encryptedFoo);
const decryptedFoo = (await gcloudKms.decrypt(decryptedFoo)).plaintext;
console.log('decrypted foo', decryptedFoo);
```


# List Existing Keys

```bash
gcloud kms keys list --location global --keyring staging
gcloud kms keys list --location global --keyring production
```

# Reproducible Steps

I created two keyrings, `production` and `staging`.

```bash
gcloud kms keyrings create staging --location global
gcloud kms keyrings create production --location global
```

I created an `api` key in each keyring.

```bash
gcloud kms keys create api --location global --keyring staging --purpose encryption
gcloud kms keys create api --location global --keyring production --purpose encryption
```

References
* [Manage via gcloud console](https://console.cloud.google.com/iam-admin/kms?project=dave-173321&organizationId=656562302340)
* [https://cloud.google.com/kms/docs/quickstart](https://cloud.google.com/kms/docs/quickstart)