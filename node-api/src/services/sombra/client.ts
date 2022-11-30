import * as superagent from 'superagent';
import { IExchangeSessionRequest, ISombraResponse, ValidRefreshTokenPayload } from './typings';
import { URL } from 'url';
import { IDaveRequest } from '../../typings';
import { SombraConfig } from './config';

const REVOKE_PATH = '/api/v1/userAuth/revoke';
const REFRESH_ACCESS_PATH = '/api/v1/userAuth/refreshAccess';
const EXCHANGE_SESSION_PATH = '/api/v1/userAuth/exchange';
const EMAIL_MFA_PATH = '/api/v1/mfa/email';

const sombra = superagent.agent().use(request => {
  const url = new URL(request.url, SombraConfig.url());
  request.url = url.href;
});

interface ISombraClientError {
  body?: any;
  status?: number;
}

function formattedErrorResponse(req: any, ex: ISombraClientError): ISombraResponse {
  return {
    body: {
      ...ex.body,
      customCode: 'UNAUTHORIZED',
      message: `Error authorizing your request. Confused? Contact support regarding Error ID: ${req.requestID.substr(
        0,
        8,
      )}`,
    },
    statusCode: ex.status,
  };
}

export async function exchangeSession(req: IExchangeSessionRequest): Promise<ISombraResponse> {
  return sombra
    .post(EXCHANGE_SESSION_PATH)
    .send(req)
    .then(r => {
      return { body: r.body, statusCode: r.status };
    })
    .catch(e => {
      return formattedErrorResponse(req, e);
    });
}

export async function refreshAccess(
  payload: ValidRefreshTokenPayload,
  req: IDaveRequest,
): Promise<ISombraResponse> {
  return sombra
    .post(REFRESH_ACCESS_PATH)
    .set('X-Refresh-Token', payload.refreshToken)
    .send()
    .then(r => {
      return { body: r.body, statusCode: r.status };
    })
    .catch(e => {
      return formattedErrorResponse(req, e);
    });
}

export async function emailMFA(req: IDaveRequest): Promise<ISombraResponse> {
  return sombra
    .post(EMAIL_MFA_PATH)
    .send(req.body)
    .then(r => {
      return { body: r.body, statusCode: r.status };
    })
    .catch(e => {
      return formattedErrorResponse(req, e);
    });
}

export async function revoke(
  payload: ValidRefreshTokenPayload,
  req: IDaveRequest,
): Promise<ISombraResponse> {
  return sombra
    .delete(REVOKE_PATH)
    .set('X-Refresh-Token', payload.refreshToken)
    .send()
    .then(r => {
      return { body: r.body, statusCode: r.status };
    })
    .catch(e => {
      return formattedErrorResponse(req, e);
    });
}

export async function exchange(req: IDaveRequest): Promise<ISombraResponse> {
  return sombra
    .post(EXCHANGE_SESSION_PATH)
    .send(req.body)
    .then(r => {
      return { body: r.body, statusCode: r.status };
    })
    .catch(e => {
      return formattedErrorResponse(req, e);
    });
}
