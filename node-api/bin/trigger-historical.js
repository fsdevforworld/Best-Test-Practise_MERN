const PubSub = require('../src/lib/pubsub');
const Promise = require('bluebird');
const fs = require('fs');
const csv = require('csv');
const config = require('config');

const file = fs.readFileSync('./historical-connection-external-ids.csv', 'utf8');
console.log(`Publishing to prefix: ${config.get('pubsub.prefix')}`);

csv.parse(file, { columns: true }, (err, data) => {
  console.log(`Publishing ${data.length} events`);
  Promise.map(data, async row => {
    await PubSub.publish('plaid-update', { itemId: row.external_id, historical: true });
    console.log(`Published ${row.external_id}`);
  }, { concurrency: 10 }).then(() => process.exit(0));
});
