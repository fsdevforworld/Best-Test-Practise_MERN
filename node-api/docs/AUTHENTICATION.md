# Authentication
## User Authentication
### POST /v2/user/login
Dave users can authenticate using the POST /v2/user/login endpoint using a valid set of credentials. This endpoint, on a successful request, generates 
Node-API specific authorization tokens, which never expire. These tokens can be sent, via the Authorization header, to Node-API endpoints which
require authorization to access or modify user specific resources. At some point, this endpoint may be deprecated, as
it should be supplanted by POST /auth/v1/userAuth/authenticate. 

**Request**
```
POST /v2/user/login HTTP/1.1
Host: localhost:8080
x-device-id: 2A01478A-3844-42AB-9DEF-47DFAB2C5554
x-device-type: ios
Content-Type: application/json
X-App-Version: 3.14.15
Content-Length: 98

{
    "email" : "dev-advance5-123@dave.com",
    "password": "Password1!",
    "mfaCode": 111111
}
```

**Response**
```
{
    "id": 3,
    "created": "2021-03-04T22:25:10Z",
    "firstName": "micro-advance-pass",
    "lastName": "Tiny money!",
    "email": "dev-advance5-123@dave.com",
    "externalId": null,
    "phoneNumber": "+11234560200",
    "birthdate": null,
    "tester": false,
    "roles": [],
    "token": "bda4dea4-3076-4e3d-97f9-183fdcae6293",
    "settings": {
        "default_tip": 10,
        "doNotDisburse": true
    },
    "addressLine1": null,
    "addressLine2": null,
    "city": null,
    "state": null,
    "zipCode": null,
    "defaultBankAccountId": 7,
    "emailVerified": true,
    "profileImage": null,
    "licenseImage": null,
    "secondaryEmail": null,
    "coolOffStatus": {
        "coolOffDate": null,
        "isCoolingOff": false
    },
    "identityVerified": true,
    "nextSubscriptionPaymentDate": "2021-03-04",
    "usedTwoMonthsFree": null,
    "notification": [],
    "emailVerification": {
        "id": 137,
        "userId": 3,
        "email": "dev-advance5-123@dave.com",
        "verified": null,
        "created": "2021-03-04T22:25:12Z",
        "updated": "2021-03-04T22:25:12Z"
    },
    "hasPassword": true,
    "canSignUpForBanking": true,
    "canSignUpForBankingV2": true,
    "isOnBankWaitlist": false,
    "membershipPause": null,
    "isBucketedIntoMxExperiment": false,
    "requiresPasswordUpdate": false,
    "showBanner": false
}
```

In the example response, a **token** was generated which can be used in the Authorization header, along with the Device 
Id associated with that token, to access user specific resources.

**Request**
```
GET /v2/user/ HTTP/1.1
Host: localhost:8080
x-device-id: 2A01478A-3844-42AB-9DEF-47DFAB2C5554
x-device-type: ios
Content-Type: application/json
X-App-Version: 3.14.7
Authorization: bda4dea4-3076-4e3d-97f9-183fdcae6293
```

### POST /auth/v1/userAuth/authenticate

Dave users can authenticate using the POST /auth/v1/userAuth/authenticate endpoint using a valid set of credentials. This
endpoint, unlike POST /v2/user/login, interacts with the Sombra Authentication service and generates two signed JWT tokens.
One token, an access token, can be used for authorization like a Node-API session. By passing this token in the X-Access-Token header, 
a client can call various endpoints and access user specific resources. The generated access token is associated with a 
specific user based on the credentials passed to this endpoint. 

The second token, a refresh token, is a longer lived token which can be used in place of credentials to get new access tokens when the 
access token expires. 

**Request**
```
POST /auth/v1/userAuth/authenticate HTTP/1.1
Host: localhost:8080
x-device-id: 2A01478A-3844-42AB-9DEF-47DFAB2C5554
x-device-type: ios
Content-Type: application/json
X-App-Version: 3.14.15
Content-Length: 98

{
    "email" : "dev-advance5-123@dave.com",
    "password": "Password1!",
    "mfaCode": 111111
}
```

**Response**
```
{
    "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjEifQ.eyJzdWIiOjMsImV4cCI6MTYxNjAyNDM0OCwiaXNzIjoiZGV2LWFjY2Vzcy10b2tlbi1pc3N1ZXIiLCJqdGkiOiI0OWM3YWY3ZS02OWZjLTQ5N2MtOTI2MS1iOTVjMzU4MWM0YWIiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjE1NDE5NTQ3fQ.liEtmnO9k4JZHog_cfRjMglbUXN6AiU1T9v9bJoV2LSfxSJupV1AbSH8J5r2BVoL_i5hSndLkjs6svAjiUHqiSpfS-P6Gb_rWuyFluEbD7YFvHeHNxHGvNOTpEKOuqjpWmAZoPQpgEbjUnqEmEOFfcHG5Ycwy6R4KtJE4H0LJW7ICNUkAtga1QlFeMlLshtksldPBmhpwkZBJK68cfI7J9290mAOJbs5RE2jnc532QpxRSM3xlb98ta9O3WONYWmhKOo6CVYp9WrXt8Lp55ceLr8LTAcYzMsQ6z385lJAaI96kww_tGT8Yt_RKemREA6JHZaqCp7nXIxa9O4zzEwEw",
    "refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjEifQ.eyJzdWIiOjMsImV4cCI6MTYxNjAyNDM0OCwiaXNzIjoiZGV2LWFjY2Vzcy10b2tlbi1pc3N1ZXIiLCJqdGkiOiIyY2I2NjExOS04MTE5LTQ3NzMtOTg2Yi1mZjUwMmUyOTlmZjMiLCJ0eXBlIjoicmVmcmVzaCIsImlhdCI6MTYxNTQxOTU0N30.ypqM8RvWRuCwoiCEvOIGVPLJaLFNpVdvr6_-Rq-JynxsvmooY_Hh8MT0-iZIYw0XwVGRkMlHpc0Y_Efr1EvbvknK_Ll53H5eioeZ2eh64xUwriqcmzZ7yefU2VG0uRLPBFrb3xprp92zDzNXYtSIjUJ_lPR_nyB0M7bFS1T-0AFq_BrcSingkHRD-TAjUR1acJoBty0jORwo1wUL4EMyQFQpxhK7rZTzQGDdoqnJKPumQ9dgPf3nIwNHJqyo_LbyPOfU1faqoeUyoFOJcxIFpJDe9dRsWAjVklh4oX2qS_vKUR50oKV1uubOjQ40Ia3lBOkccypbU3ok-f55_QCIOw"
}
```

In the example response, a **accessToken** was generated which can be used in the X-Access-Token header to access user specific resources.

**Request**
```
GET /v2/user/ HTTP/1.1
Host: localhost:8080
x-device-id: 2A01478A-3844-42AB-9DEF-47DFAB2C5554
x-device-type: ios
Content-Type: application/json
X-App-Version: 3.14.7
X-Access-Token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjEifQ.eyJzdWIiOjMsImV4cCI6MTYxNjAyNDM0OCwiaXNzIjoiZGV2LWFjY2Vzcy10b2tlbi1pc3N1ZXIiLCJqdGkiOiI0OWM3YWY3ZS02OWZjLTQ5N2MtOTI2MS1iOTVjMzU4MWM0YWIiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNjE1NDE5NTQ3fQ.liEtmnO9k4JZHog_cfRjMglbUXN6AiU1T9v9bJoV2LSfxSJupV1AbSH8J5r2BVoL_i5hSndLkjs6svAjiUHqiSpfS-P6Gb_rWuyFluEbD7YFvHeHNxHGvNOTpEKOuqjpWmAZoPQpgEbjUnqEmEOFfcHG5Ycwy6R4KtJE4H0LJW7ICNUkAtga1QlFeMlLshtksldPBmhpwkZBJK68cfI7J9290mAOJbs5RE2jnc532QpxRSM3xlb98ta9O3WONYWmhKOo6CVYp9WrXt8Lp55ceLr8LTAcYzMsQ6z385lJAaI96kww_tGT8Yt_RKemREA6JHZaqCp7nXIxa9O4zzEwEw
```

### mock-auth CLI tool
The mock-auth command line tool is designed to ease the login process for developers working in lower environments, 
such as their own laptop, and testing endpoints on Node-API locally. This tool takes advantage a feature set which enables 
both signing and verification of Sombra Access Tokens using a specific RSA key pair. Tokens signed with this key pair will
only be valid in development environments and this feature is not available in higher environments such as staging and production. 

To use this tool to generate valid access tokens, you must run this NPM command:
```
 npm run mock-auth -- login [userId] [--exp <epoch time>]
```

By default, this tool accepts two arguments. One is the userId to be associated with the access token, and the other is
an optional expiration time in unix epoch time. By default, the access token expiration time is driven by Node-API config:
`sombra.development.expiresIn`.

```
~/p/node-api $ npm run mock-auth -- login 10

> dave-api-v2@2.2.1675 mock-auth /Users/cameron-ruatta/projects/node-api
> NODE_ENV=dev ./node_modules/.bin/ts-node ./bin/scripts/mock-authentication.ts "login" "10"

eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjEifQ.eyJzdWIiOjEwLCJleHAiOjE2MTYwMzA3NzAsImlzcyI6ImRldi1hY2Nlc3MtdG9rZW4taXNzdWVyIiwianRpIjoiODZlZmQwMDAtYTQ5Yy00YWQ5LWE1OGQtMWVjNTY4ZWExYjJmIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTYxNTQyNTk3MH0.dcf1trXio12ihj42YzTEa5jxneyRzARk6A_DFf_05dfKEYzu65FnLwhoLEzcHEzEK8zsNFBHY9wIvKD9MqwRyMmP5UAsepjEjTFLngrJQwavhMiLMTxmIV4tpqsN3z0AXJFCPHVqlmG-VGjNfio2qn2EpZLhXIepLqskooIgFSrbADysPKqC0tdHw2ORJVTDzBfuUsi6wsXRpu9zgfMpD-cXbj-h2K1yx1-cdW7c0NMhv4GBcRc9-mz7JRa86OkvWprD9SXLIHWMtTXj2ujPAJBJncGvPuQyXcW19YmFZ0CvA7sPn-MfS5S2qAeHpq-meZTQ5u6t9mM5IU0XL0KGO
```
