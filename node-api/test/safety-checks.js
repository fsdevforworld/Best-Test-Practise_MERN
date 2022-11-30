// functional tests use database fixtures instead of stubs, so enforce NODE_ENV=test to prevent tests from being run against production database connections

(function() {
  if (!process.env.NODE_ENV || !['test', 'ci'].includes(process.env.NODE_ENV)) {
    throw new Error(
      'NODE_ENV !== test. This is super unsafe. Bailing out. Please `export NODE_ENV=test` or `. test.env` before running',
    );
  }
  const TEST_DB_ENV = {
    DB_SOCKETPATH: undefined,
    DB_USER: 'dev',
    DB_NAME: 'dave_dev',
    DB_PASSWORD: 'password123',
    ELASTICSEARCH_HOST: 'localhost',
  };

  Object.assign(process.env, TEST_DB_ENV);
})();

// set `expect` global namespace for convenience
const chai = require('chai');
chai.use(require('chai-json-schema'));
chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));
chai.use(require('chai-subset'));
const chaiMoment = require('chai-moment');

chaiMoment.setErrorFormat('YYYY-MM-DD HH:mm:ss');
chai.use(chaiMoment);

chai.should();
