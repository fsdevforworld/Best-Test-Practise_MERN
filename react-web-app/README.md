## Configuring host file

Since the app uses cookies for authentication, you'll need to add an entry to your hosts file to allow

```
sudo vim /etc/hosts
127.0.0.1	dev.trydave.com
```

## Dependencies

```
brew cask install ngrok
brew install jq
```

## Available scripts

In the project directory, you can run:

### `yarn`

### `yarn start`

Runs the app in the development mode.<br>
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.<br>
You will also see any lint errors in the console.

## Feature Branch Testing

1. Open [Circle CI](https://circleci.com/gh/dave-inc/workflows/react-web-app) 
2. Click on feature branch you would like to deploy.
3. Click on `Deploy to Testing` and wait for deploy script to complete.
4. Navigate to `{branchname}`.`test.trydave.com`

## Latest/Master Environment

1. Open [Circle CI Master Branch](https://circleci.com/gh/dave-inc/workflows/react-web-app/tree/master) 
2. Click on `Deploy to Testing` and wait for deploy script to complete.
3. Navigate to `master.test.trydave.com`

## Staging Environment

1. Open [Circle CI Master Branch](https://circleci.com/gh/dave-inc/workflows/react-web-app/tree/master) 
2. Click on `Deploy to Staging` and wait for deploy script to complete.
3. Navigate to `staging.dave.com`

## Automation Testing with Cypress

Please be sure that you have installed package dependencies for repository by running `yarn install`

Local Automation Run 
1. Run `yarn webhooks` and `yarn start` to kick off local instance of react-web-app
2. To open Cypress and run automation manually please run `yarn cy:open` and proceed to kick off automation through Cypress UI
3. To run automation headless please run `yarn cy:run`

