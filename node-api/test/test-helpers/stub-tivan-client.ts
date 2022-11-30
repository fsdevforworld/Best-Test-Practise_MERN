import * as sinon from 'sinon';
import * as TivanClient from '../../src/lib/tivan-client';

function stubTivanClient(sandbox: sinon.SinonSandbox) {
  const stubClient = {
    enqueueTask: sandbox.spy(),
    enqueueApiTask: sandbox.spy(),
    createTask: sandbox.spy(),
  };
  sandbox.stub(TivanClient, 'getTivanClient').returns(stubClient);
  return stubClient;
}

export { stubTivanClient };
export default stubTivanClient;
