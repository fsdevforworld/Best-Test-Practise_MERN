# Dave API

![dave-api-small](https://user-images.githubusercontent.com/5179047/63180469-32217880-c003-11e9-8d6a-911713ef7ddf.png)

[![CircleCI](https://circleci.com/gh/dave-inc/node-api.svg?style=svg&circle-token=e4779bd60602a805d5b43dd2b78085f7517fae02)](https://circleci.com/gh/dave-inc/node-api)

## Contents

- [Machine Setup](#machine-setup)

- [Project Setup](#project-setup)

- [Helpful npm Commands](#helpful-npm-commands)

- [Database Migrations](#database-migrations)

- [Running a script](#running-a-script)

- [Pubsub](#setting-up-pubsub)

- [Project Structure](#project-structure)

- [Testing](#testing)

- [Postman](#postman-collections)

- [Authentication](#authentication)

- [Troubleshooting](#troubleshooting)

## Machine Setup

### Setting up a fresh Mac OSX environment

Install the following:

- [Homebrew](https://brew.sh/)
- Docker for Mac
- XCode
- npm
- GCloud SDK ([Mac OS](https://cloud.google.com/sdk/docs/quickstart-macos))

### Setting up a fresh Linux environment

Set up your Node Dev environment, git, node, etc.

- npm
- docker and docker-compose
- GCloud SDK

## Project Setup

1. Login to Github Packages with NPM

   a. [Create a Github PAT](github.com/settings/tokens)

   b. Give the token `repo` and `read:packages` permissions and "Enable SSO" after creating it

   c. Login

   ```
   npm login --scope=@dave-inc --registry=https://npm.pkg.github.com

   > Username: Github Username
   > Password: PAT from above
   > Email: Dave Email Address
   ```

_https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token_

2. Install dependencies

```bash
$ npm ci
```

If you run into node version errors, [nvm](https://github.com/nvm-sh/nvm) is an excellent version manager. Switch to a compatible version of node and rerun `npm install`.

3. Build the `dave-api-v2` docker container

```bash
$ npm run dev-rebuild
```

4. Get development secrets

- Make sure you are logged into the cloud sdk with `gcloud auth list` and that your @dave.com email is the active account. Output should look something like:

```bash
ACTIVE  ACCOUNT
*       yourEmail@dave.com
```

- If you need to login, run `gcloud auth application-default login`.
- Once you are authenticated with google, run `npm run secrets:dev` to download the development secrets.

5. Start the application.

The first time it's run may resolve dependencies as well as other house keeping tasks. Eventually this will bring up the node-api, banking-direct, mysql, redis, user-auth, mx-webhook, plaid-updater, pubsub-emulator, and overdraft-synapsepay-update-user. See the `docker-compose.dev.yml` for default ports. If you have not initialized the database you will need to run migrations after the application is started

```bash
$ npm run dev
```

6. Run migrations

After the application is up if you have not run migrations you will need to do this the first time as it will create all needed database structures

```bash
$ npm run migrate
```

At this point you can set up a dev user if so desired (see below)

### Still having trouble?

Check out the [Troubleshooting section](#troubleshooting)

## Helpful npm Commands

Here are a few helpful `npm` commands. If you need the exhaustive list please look in `package.json`

### Running the API

To start the app server after the initial setup run:

```bash
$ npm run dev
```

### Running the API as a detached process

```bash
$ npm run dev-d
```

### Setting and removing a dev user

If you've installed the application and run migrations you can seed the database with a user that you can log in immediately with, run:

```bash
$ npm run dev-seed
```

The following values will be automatically added:

> **Phone number:** `1234567890`

> **Verification code:** `111111`

To remove this user and related data run:

```bash
$ npm run dev-seed-down
```

### Cleaning the environment

Whenever you need to shutdown and thus wiping the existing environment and all data, you can run:

```bash
$ npm run dev-clean
```

### Checking Docker containters

List all the docker containers that are running. Ensure things are up as expected.

```bash
$ docker ps
```

You should see a listing of node-api, banking-direct, mysql, redis, user-auth, mx-webhook, plaid-updater, pubsub-emulator, and the overdraft-synapsepay-update-user processes if successful.

## Database Migrations

If you have a non-initialized database (no tables) you need to run the database migrations before seeding.
Migrations are managed by [db-migrate](https://db-migrate.readthedocs.io/en/latest/) and can be ran using:

```bash
$ npm run migrate
```

To create a migration, first make sure you have read the [document outlining our process and expecations for database migrations](https://demoforthedaves.atlassian.net/wiki/spaces/ADVANCES/pages/250774846/Database+Migrations). Then you can create your migration by running:

```bash
$ npm run create-migration DescriptiveMigrationName
```

To run your migration, run:

```bash
$ npm run migrate
```

To test that your `down` code for the migration works, run:

```bash
$ npm run migrate-down

# or, if you want to migrate down more than one migration
$ npm run migrate-down -c <number of migrations to roll back>
```

Please make sure that you [run your migration on staging](https://demoforthedaves.atlassian.net/wiki/spaces/ADVANCES/pages/306741307/Running+migrations+on+Staging) before it goes into production.

## Running a script

Scripts found in `/bin/scripts` should be run locally and in most cases against staging before being run in production.

To run a script **locally**, run:

```bash
$ npm run dev-script /bin/scripts/your-script.ts
```

To run a script in **staging**, first push your PR to the staging environment.
Then, in the [infra](https://github.com/dave-inc/infra) repo, modify the `/k8s/staging/tasks/staging-script-runner.yml` file with your script name.
Then run (from the `infra` repo):

```bash
$ kubectl apply -f k8s/staging/tasks/staging-script-runner.yml
```

You will need to have permissions for the dave-staging gcloud project.

[Example video](https://www.loom.com/share/2a69cff75f00455db647e3dc2f9c5930)

## Setting up pubsub

Install Emulator

```bash
gcloud components install pubsub-emulator
gcloud components update
```

Add necessary env variables to .env

```bash
export PUBSUB_PROJECT_ID=dave-173321
export PUBSUB_EMULATOR_HOST=localhost:8432
```

To run historical plaid update

```bash
npm run pubsub-plaid
```

To set up update Synapsepay user pub/sub to receive user update webhooks locally:

1. Use [ngrok](https://ngrok.com/) to create a URL for local instance of node-api
2. Send `PATCH` request to Synapsepay (see Postman Collections > SynapsePay > PATCH Update Webhook Subscriptions) updating the subscription with scope `USER | PATCH` url to the ngrokified url
3. Now the`overdraft-synapsepay-update-user` will receive webhook updates
4. Change the subscription url back to staging `https://staging.trydave.com/v1/synapse_webhook/user` when finished, since we can only have one consumer per webhook at a time

## Project Structure

```
/
|- src/       # where code goes
   |- lib/    # thin wrappers around an external integration
   |- domain/ # logic that spans external libraries and database models (new location)
   |- api/
      |- v2/
         |- advance/ # underwriting or advance engine
```

## Testing

Start up supporting services

```bash
$ npm run test:up
```

To run all tests

```bash
$ npm run test:run
```

To run tests with code coverage

```bash
$ npm run test:run -- --coverage
$ open coverage/lcov-report/index.html
```

To run tests without first running migrations

```bash
$ npm run test:run -- sm
```

To run a single test file

```bash
$ npm run test:run -- /test/path/to/file.ts
```

or leave out `/test` for brevity

```bash
$ npm run test:run -- /path/to/file.ts
```

To run a single test file without migrations

```bash
$ npm run test:run -- /test/path/to/file.ts sm
```

## Debugging

To run tests with the debugger

```bash
$ npm run test:run -- debug
```

or, launch the app with the debugger

```bash
$ npm run dev-debug
```

_To run only specific services, pass the service name(s)_

```bash
$ npm run dev-debug payments-handler node-api
```

Then attach to the debugger:

- In Chrome using devtools: navigate to chrome://inspect
- In VSCode, add to the [launch.json](https://code.visualstudio.com/docs/editor/debugging#_launch-configurations)

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Attach to Docker - node-api",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "address": "0.0.0.0",
      "sourceMapPathOverrides": {
        "/opt/app/*": "${workspaceRoot}/*"
      },
      "skipFiles": ["${workspaceFolder}/node_modules/**/*.js", "<node_internals>/**/*.js"]
    },
    {
      "name": "Attach to Docker - payments-handler",
      "port": 9228,
      "type": "node",
      "request": "attach",
      "address": "0.0.0.0",
      "sourceMapPathOverrides": {
        "/opt/app/*": "${workspaceRoot}/*"
      },
      "skipFiles": ["${workspaceFolder}/node_modules/**/*.js", "<node_internals>/**/*.js"]
    }
  ]
}
```

- Using [node-inspect CLI](https://github.com/nodejs/node-inspect)

```bash
$ node-inspect 127.0.0.1:9229
```

## Postman Collections

[Get setup with Postman](docs/POSTMAN.md)

## Authentication

[Logging in as a user in development](docs/AUTHENTICATION.md#User Authentication)

## Troubleshooting

Start with a known good commit, where you can see all tests have passed in CircleCI and it's been deployed successfully. If you're having trouble running a known good commit, the issue is most likely caused by the state of your local machine, specifically the images and containers in your local machine's Docker.

A common issue is that dependencies have been added, and your existing node-api docker image doesn't have them. So, you need to build a fresh node-api image with the current dependencies. Rebuilding fixes this:

```bash
$ npm run dev-rebuild
$ npm run dev
```

If that doesn't work, try manually stopping containers, removing images and rebuilding.

```bash
$ docker kill $(docker ps -q) # kill docker containers (if nothing is running in docker, this command may return an error about docker kill requiring an argument, which can be ignored)
$ docker rm $(docker ps -a -q) # remove all the docker containers we just stopped
$ docker image rm dave-api-v2 # remove the image for node-api so it's forced to rebuild
$ docker image rm test_node-api # this may fail if you haven't run tests, it's OK
$ npm run dev-rebuild
$ npm run dev
```

You might have to fire it up a second time. It's frustrating to have to iterate, but...

```bash
# follow the procedure above for manually stopping, removing and rebuilding
# if several containers fire up successfully, but a few error out, try to fire it a second time
CTRL-C # to kill everything, wait a few seconds for everything to die
# don't need to rebuild anything, just fire it up again
$ npm run dev
```

If anyone can find a procedure that never forces this iteration, please update this doc!

### Migrations!

Don't forget to run migrations. If you've manually removed things, you definitely need to run them. It never hurts to run migrations again - it's a fast (~ 2 seconds) no-op if migrations have already been run.

Remember you have to have node-api running successfully **before** you kick off the migrations. If you started with `npm run dev`, you have to run them in a separate window while keeping the node-api window open. (This is one reason you might prefer the `-d` variant.)

```bash
# after following one of the procedures above and having node-api up and running in a separate window
$ npm run migrate
```

### Nuke It from Orbit

If you're still having trouble, you might try the nuclear option: remove **everything** from docker. Note this forces you to redownload images that never change like mysql, redis, node, etc. It takes a long time.

```bash
$ docker kill $(docker ps -q) # kill all containers
$ docker system prune --volumes -f -a # nuke everything
$ docker rm -vf $(docker volume ls -q) # remove all volumes, expect this to error with "docker rm requires at least 1 argument", because the system prune should have gotten all the volumes
$ docker rmi -f $(docker images -a -q) # remove ALL images, expect this to error with "docker rmi requires at least 1 argument", because the system prune should have gotten all the images
$ npm run dev-rebuild
$ npm run dev
# most likely not all services will fire up successfully (for me, pubsub-subscribers_1 , internal-dashboard-api_1 and mx-webhook_1 crashed)
CTRL-C # kill everything running from npm run dev
$ npm run dev # everything should fire up successfully this time
```
