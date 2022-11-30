const moment = require('moment');
const { join } = require('path');
const WdioImageComparisonService = require('wdio-image-comparison-service');

const { ENVIRONMENT } = process.env;
const testRunTime = moment().format('LLLL');
const baseUrl = 'http://localhost:3000';
const sauceConnect = true;

exports.config = {
  user: process.env.SAUCE_USERNAME,
  key: process.env.SAUCE_ACCESS_KEY,
  specs: [
    './test/ui/spec/setpasswordpage.spec.ts',
    './test/ui/spec/registrationpage.spec.ts',

    // TODO fix me @lucas
    // './test/ui/spec/verificationcodepage.spec.ts',
    // './test/ui/spec/welcomebackpage.spec.ts',

    // no longer using bank connect, but keeping the code in case we want to bring it back.
    // './test/ui/spec/connectyourbankpage.spec.ts',

    // temporarily disable tests due to existing bugs for plaid
    // './test/ui/spec/plaidpage.spec.ts',
  ],
  suites: {
    smoke: [
      './test/ui/spec/setpasswordpage.spec.ts',
      './test/ui/spec/registrationpage.spec.ts',

      // TODO fix me @lucas
      // './test/ui/spec/verificationcodepage.spec.ts',
      // './test/ui/spec/welcomebackpage.spec.ts',

      // no longer using bank connect, but keeping the code in case we want to bring it back.
      // './test/ui/spec/connectyourbankpage.spec.ts',

      // temporarily disable tests due to existing bugs for plaid
      // './test/ui/spec/plaidpage.spec.ts',
    ],
    regression: ['./test/ui/spec/*.ts'],
    manual: [],
    visual: ['./test/ui/spec/visual-*.ts'],
  },
  exclude: [],
  bail: 0,
  waitforTimeout: 5000,
  connectionRetryTimeout: 10000,
  connectionRetryCount: 3,
  framework: 'mocha',
  specFileRetries: 1,
  reporters: [
    'spec',
    [
      'allure',
      {
        outputDir: 'allure-results',
        disableWebdriverStepsReporting: true,
        disableWebdriverScreenshotsReporting: true,
      },
    ],
  ],
  mochaOpts: {
    ui: 'bdd',
    compilers: ['tsconfig-paths/register'],
    timeout: 60000,
  },
  before() {
    require('ts-node').register({ files: true });
  },
  afterTest(test) {
    if (test.error !== undefined) {
      browser.takeScreenshot();
    }
  },
};

const cloudConfig = {
  ENVIRONMENT: 'cloud',
  capabilities: [
    {
      browserName: 'chrome',
      browserVersion: '77.0',
      platformName: 'macOS 10.14',
      'sauce:options': {
        extendedDebugging: true,
        screenResolution: '1920x1440',
        build: `${process.env.CIRCLE_BRANCH} ${testRunTime}`,
      },
    },
  ],
  maxinstances: 2,
  logLevel: 'error',
  baseUrl,
  services: ['sauce'],
  sauceConnect,
};

const localConfig = {
  ENVIRONMENT: 'local',
  capabilities: [
    {
      browserName: 'chrome',
      browserVersion: '77.0',
      platformName: 'macOS 10.14',
      'sauce:options': {
        extendedDebugging: true,
        screenResolution: '1920x1440',
        build: `${testRunTime}`,
      },
    },
  ],
  maxinstances: 2,
  logLevel: 'error',
  deprecationWarnings: true,
  baseUrl,
  services: ['sauce'],
  sauceConnect,
  specFileRetries: 0,
};

const visualConfig = {
  ENVIRONMENT: 'visual',
  capabilities: [
    {
      browserName: 'chrome',
      browserVersion: 'latest',
      platformName: 'macOS 10.14',
      'sauce:options': {
        extendedDebugging: true,
        screenResolution: '1920x1440',
        build: `Visual ${process.env.CIRCLE_BRANCH} ${testRunTime}`,
      },
    },
    {
      browserName: 'chrome',
      browserVersion: 'latest',
      platformName: 'Windows 10',
      'sauce:options': {
        extendedDebugging: true,
        screenResolution: '1920x1080',
        build: `Visual ${process.env.CIRCLE_BRANCH} ${testRunTime}`,
      },
    },
    {
      browserName: 'safari',
      browserVersion: 'latest',
      platformName: 'macOS 10.14',
      'sauce:options': {
        extendedDebugging: true,
        screenResolution: '1920x1440',
        build: `Visual ${process.env.CIRCLE_BRANCH} ${testRunTime}`,
      },
    },
  ],
  maxinstances: 2,
  logLevel: 'error',
  deprecationWarnings: true,
  baseUrl,
  sauceConnect,
  services: [
    'sauce',
    [
      WdioImageComparisonService.default,
      {
        baselineFolder: join(process.cwd(), './test/ui/screenshots/'),
        formatImageName: '{tag}-{logName}-{width}x{height}',
        screenshotPath: join(process.cwd(), './test/ui/.tmp/'),
        savePerInstance: true,
        autoSaveBaseline: true,
        blockOutStatusBar: true,
        blockOutToolBar: true,
      },
    ],
  ],
  specFileRetries: 0,
};

function updateConfig(env) {
  if (env === cloudConfig.ENVIRONMENT) {
    Object.assign(exports.config, cloudConfig);
  } else if (env === localConfig.ENVIRONMENT) {
    Object.assign(exports.config, localConfig);
  } else if (env === visualConfig.ENVIRONMENT) {
    Object.assign(exports.config, visualConfig);
  }
}

updateConfig(ENVIRONMENT);
