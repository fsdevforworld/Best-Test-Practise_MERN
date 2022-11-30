const Promise = require('bluebird');
const fixtures = require('../test/fixtures');

const direction = process.argv[2] || 'up';

function fix() {
  console.log(`Going ${direction}`);
  return Promise.mapSeries(Object.values(fixtures), item => item[direction]());
}

fix().then(() => process.exit(0)).catch(err => console.log(err) && process.exit(1));
