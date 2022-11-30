declare global {
  /* tslint:disable:interface-name no-empty-interface */
  // https://github.com/DefinitelyTyped/DefinitelyTyped/issues/12044
  // error TS2304: Cannot find name 'XMLHttpRequest'
  interface XMLHttpRequest {}
  // error TS2304: Cannot find name 'Blob'
  interface Blob {}
}
import { SuperAgent, SuperAgentRequest } from 'superagent';

export interface ISuperAgentAgent<Req extends SuperAgentRequest> extends SuperAgent<Req> {
  set(field: string, val: string): this;

  auth(username: string, password: string): this;
}
