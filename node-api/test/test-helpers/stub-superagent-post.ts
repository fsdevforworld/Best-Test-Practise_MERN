import * as sinon from 'sinon';
import { SinonSandbox } from 'sinon';
import * as req from 'superagent';

export default function stubSuperagentPost(
  sandbox: SinonSandbox,
  {
    url,
    requestBody = sinon.match.any,
    body,
    error,
  }: { url?: string; requestBody?: any; body?: any; error?: any },
) {
  const sendStub = sandbox.stub();

  if (error) {
    sendStub.withArgs(requestBody).throws(error);
  } else {
    sendStub.withArgs(requestBody).returns({ body });
  }

  const requestMock = {
    auth: () => requestMock,
    timeout: () => requestMock,
    send: sendStub,
  };

  sandbox
    .stub(req, 'post')
    .withArgs(url)
    .returns(requestMock);

  return sendStub;
}
