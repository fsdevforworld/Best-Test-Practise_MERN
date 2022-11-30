import * as sinon from 'sinon';
import { helpers } from '../../src/domain/synapsepay';

export default function mockIpForSynapsepay(sandbox: sinon.SinonSandbox, ip = '172.18.0.5') {
  sandbox.stub(helpers, 'getUserIP').returns(ip);
}
