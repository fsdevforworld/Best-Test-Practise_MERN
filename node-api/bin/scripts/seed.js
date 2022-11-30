const fixtures = require('../../test/fixtures');

const seeds = Object.values(fixtures).map(fixture => fixture.up());

Promise.all(seeds)
  .then(() => {
    console.log('All seeds completed');
    process.exit();
  })
  .catch(ex => console.error(ex));
