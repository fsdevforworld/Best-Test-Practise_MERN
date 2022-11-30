# What are the environments and how do they differ?


There are four environments:
- production
- staging
- dev
- test


`production` has all credentials required for live usage (duh). It includes a logger that points to Google's StackDriver.


`staging` is the same as `production` except for plaid, where we use the `development` plaid environment. This still allows access to connect real bank accounts, but is limited to 100 accounts. `staging` is used to drive `staging.trydave.com`.


In the `dev` environment, credentials change based on the needs of the developer, `dev` is what is used when running the API locally via `npm run dev`. These credentials are read from a `.env` file in the root of your code base. Generally, you should be using the `sandbox` plaid environment, development twilio credentials, and the tabapay sandbox environment unless you're actively working on one of those components. It also includes the full error stack in all API error responses.


`test` is used for `npm run test` (running tests, who'd guess?) It causes the long-running tasks not to start running automatically. Otherwise, it uses the same `.env` file as the `dev` environment.
