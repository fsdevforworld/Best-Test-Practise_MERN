import * as nock from 'nock';
import * as path from 'path';
import { omit } from 'lodash';

export default function replayHttp(
  fixtureName: string,
  cb: () => {},
  options: nock.NockBackOptions & { mode?: nock.NockBackMode } = {},
) {
  return async () => {
    nock.back.fixtures = path.join(__dirname, '..', 'fixtures');

    nock.back.setMode(options.mode || 'lockdown');

    // when replayHttp runs, do not save local requests to the json output
    const defaultAfterRecord = (outputs: nock.NockDefinition[]) =>
      outputs.filter(o => !o.scope.includes('127.0.0.1'));

    const nockBackOptions = Object.assign(
      { afterRecord: defaultAfterRecord },
      omit(options, ['mode']),
    );

    const { nockDone } = await nock.back(fixtureName, nockBackOptions);

    if (options.mode !== 'wild') {
      nock.enableNetConnect(/127\.0\.0\.1/); // Allow local http requestss
    }

    try {
      await cb();
    } finally {
      nockDone();
      nock.back.setMode('wild');
    }
  };
}
