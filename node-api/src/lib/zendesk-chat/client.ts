import { get } from 'lodash';
import * as request from 'superagent';
import * as config from 'config';
import { ISuperAgentAgent } from '../../typings';

export default class ZendeskChatClient {
  public baseUrl: string = config.get<string>('zendesk.chat.url');
  private token: string;
  private agent: ISuperAgentAgent<request.SuperAgentRequest>;

  constructor({ token }: { token: string }) {
    this.token = token;

    this.setupAgent();
  }

  public async getAgentCount(): Promise<number> {
    const res = await this.agent.get(`${this.baseUrl}/stream/agents/agents_online`);
    return get(res, 'body.content.data.agents_online', 0);
  }

  private setupAgent() {
    this.agent = (request.agent() as ISuperAgentAgent<request.SuperAgentRequest>).set(
      'Authorization',
      `Bearer ${this.token}`,
    );
  }
}
