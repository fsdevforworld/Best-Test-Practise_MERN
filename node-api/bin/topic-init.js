import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: 'dave-173321',
});

async function main() {
  try {
    await pubsub.createTopic('plaid-update');
    console.log('Created topic');
  } catch (err) {
    console.log(err.message);
  }
  try {
    const topic = pubsub.topic('plaid-update');
    const res = await topic.createSubscription('plaid-updater');
    console.log(res);
    console.log('Created subscription');
  } catch (err) {
    console.log(err.message);
  }
}

main().then(() => process.exit());
