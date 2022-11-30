import * as request from 'superagent';
import { ISuperAgentAgent } from '../../typings';
import { shallowMungeObjToCase } from '../../lib/utils';
import { get } from 'lodash';
import singularizeResource from '../../helper/zendesk/sync-zendesk-environments/singularize-resource';
import { ZENDESK_ARTICLE_VOTE_DIRECTION } from './constants';
import logger from '../logger';
import { ZendeskError } from '../error';
import ErrorHelper from '@dave-inc/error-helper';
import { NotFoundError } from '@dave-inc/error-types';

const resourceMap: { [key: string]: { path: string; singularName: string } } = {
  dynamic_content: {
    path: 'dynamic_content/items.json',
    singularName: 'item',
  },
};

function getUrlString(baseUrl: string, resource: string): string {
  const irregularResource = resourceMap[resource];

  return get(irregularResource, 'path')
    ? `${baseUrl}/api/v2/${irregularResource.path}`
    : `${baseUrl}/api/v2/${resource}.json`;
}

function serialize(resource: string, value: { [key: string]: any }) {
  const irregularResource = resourceMap[resource];

  return get(irregularResource, 'singularName')
    ? { [irregularResource.singularName]: value }
    : { [singularizeResource(resource)]: value };
}

export default class ZendeskClient {
  public agent: ISuperAgentAgent<request.SuperAgentRequest>;
  public email: string;
  public token: string;
  public url: string;

  constructor({ email, token, url }: { email: string; token: string; url: string }) {
    this.email = email;
    this.token = token;
    this.url = url;

    this.setupAgent();
  }

  public list(resourceName: string, queryParams?: { [key: string]: any }) {
    const url = `${this.url}/api/v2/${resourceName}.json`;

    return this.agent.get(url).query(shallowMungeObjToCase(queryParams, 'snakeCase'));
  }

  public async listTicketFieldOptions(fieldId: number) {
    const url = `${this.url}/api/v2/ticket_fields/${fieldId}/options.json`;
    return this.agent.get(url);
  }

  public next(nextUrl: string) {
    return this.agent.get(nextUrl);
  }

  public create({ resource, value }: { resource: string; value: { [key: string]: any } }) {
    const url = getUrlString(this.url, resource);
    const createObject = serialize(resource, value);

    return this.agent
      .post(url)
      .type('application/json')
      .send(createObject);
  }

  public update(resource: string, id: number, updateParams: { [key: string]: any }) {
    const url = `${this.url}/api/v2/${resource}/${id}.json`;

    return this.agent
      .put(url)
      .type('application/json')
      .send(updateParams);
  }

  public async voteArticleUpOrDown(articleId: number, direction: ZENDESK_ARTICLE_VOTE_DIRECTION) {
    const url = `${this.url}/api/v2/help_center/articles/${articleId}/${direction}.json`;
    try {
      await this.agent
        .post(url)
        .type('application/json')
        .send();
      return true;
    } catch (err) {
      const formattedError = ErrorHelper.logFormat({ ...err, data: err.response.body });
      logger.error(`zendesk: error voting on article`, {
        ...formattedError,
        url,
        articleId,
        direction,
      });
      return false;
    }
  }

  public async searchUser({ email }: { email: string }): Promise<number> {
    const url = `${this.url}/api/v2/users/search.json`;
    try {
      const response = await this.agent
        .get(url)
        .type('application/json')
        .query({ query: `email:${email}` })
        .send();
      if (!Boolean(response.body.users.length)) {
        throw new NotFoundError('zendesk user not found');
      }
      return response.body?.users?.[0]?.id;
    } catch (err) {
      const formattedError = ErrorHelper.logFormat({ ...err });
      logger.error(`zendesk: error finding zendesk user`, {
        ...formattedError,
        url,
      });
      throw new ZendeskError('error finding third party support ticketing end user');
    }
  }

  public async createOrUpdateZendeskEndUser({
    email,
    firstName,
    lastName,
    id,
  }: {
    email: string;
    firstName: string;
    lastName: string;
    id: number;
  }): Promise<number> {
    const url = `${this.url}/api/v2/users/create_or_update.json`;
    const userParams = { user: { name: `${firstName} ${lastName}`, email } };
    try {
      const zdResp = await this.agent
        .post(url)
        .type('application/json')
        .send(userParams);
      return zdResp.body.user.id;
    } catch (err) {
      const formattedError = this.formatError(err);
      logger.error(`zendesk: error creating zendesk user`, {
        ...formattedError,
        url,
        userID: id,
      });
      throw new ZendeskError('error creating third party support ticketing end user');
    }
  }

  public async uploadFiles(files: Map<string, Buffer>) {
    let token: string;
    for await (const filename of files.keys()) {
      token = await this.uploadFile(filename, files.get(filename), token);
    }
    return token;
  }

  public async createTicket(
    zendeskUserId: number,
    brand: number,
    subject: string,
    description: string,
    customFields: Array<[number, any]>,
    attachmentToken: string,
  ): Promise<number> {
    const url = `${this.url}/api/v2/tickets.json`;
    const customFieldArray: Array<{ id: number; value: string }> = [];
    for (const customField of customFields) {
      customFieldArray.push({
        id: customField[0],
        value: customField[1],
      });
    }
    const ticketJson = {
      ticket: {
        requester_id: zendeskUserId,
        brand_id: brand,
        subject,
        custom_fields: customFieldArray,
        comment: {
          body: description,
          uploads: [attachmentToken],
        },
      },
    };

    try {
      const zdResp = await this.agent
        .post(url)
        .type('application/json')
        .send(ticketJson);
      return zdResp.body.ticket.id;
    } catch (err) {
      const formattedError = this.formatError(err);
      logger.error('zendesk: error creating ticket', { ...formattedError, url });
      throw new ZendeskError('error creating third party support ticket');
    }
  }

  private async uploadFile(filename: string, file: Buffer, token?: string): Promise<string> {
    const tokenQry = token ? `&token=${token}` : '';
    const url = `${this.url}/api/v2/uploads.json?filename=${filename}${tokenQry}`;
    let respJson;
    try {
      respJson = await this.agent
        .post(url)
        .type('application/binary')
        .send(file);
      return JSON.parse(respJson.text).upload.token;
    } catch (err) {
      const formattedError = this.formatError(err);
      logger.error('zendesk: error uploading attachment', {
        ...formattedError,
        url,
        filename,
        filesize: Buffer.byteLength(file),
      });
      throw new ZendeskError('error uploading attachments to third party ticketing systems');
    }
  }

  private formatError(err: any) {
    return ErrorHelper.logFormat({ ...err, data: err?.response?.body });
  }

  private setupAgent() {
    this.agent = (request.agent() as ISuperAgentAgent<request.SuperAgentRequest>).auth(
      `${this.email}/token`,
      `${this.token}`,
    );
  }
}
