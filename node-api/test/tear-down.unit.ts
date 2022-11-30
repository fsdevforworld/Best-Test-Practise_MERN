import 'mocha';
import { dogstatsd } from '../src/lib/datadog-statsd';
import * as Bluebird from 'bluebird';

after(async () => {
  await Bluebird.promisify(callback => dogstatsd.close(callback))();
});
