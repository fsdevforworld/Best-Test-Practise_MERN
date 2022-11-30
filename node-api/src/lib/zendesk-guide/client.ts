import { HelpCenterArticle, HelpCenterSection, HelpCenter } from '@dave-inc/wire-typings';
import * as querystring from 'querystring';
import * as request from 'superagent';
import { ZendeskGuideSection, ZendeskGuideArticle } from '../../typings/zendesk';
import { ISuperAgentAgent } from '../../typings';

type ZendeskParams = { label_names?: string; include?: string; per_page?: number };

export default class ZendeskGuideClient {
  private agent: ISuperAgentAgent<request.SuperAgentRequest> = request.agent();
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public async fetchHelpCenter(otherParams: ZendeskParams = {}): Promise<HelpCenter> {
    const params = querystring.stringify({ include: 'sections', per_page: 200, ...otherParams });
    const resObj = await this.fetchFromZendeskAPI(this.baseUrl, 'articles', params);

    if (!resObj.articles || !resObj.sections) {
      return { articles: [], sections: [], topArticles: [] };
    }

    const articles: HelpCenterArticle[] = resObj.articles.map(this.formattedArticle);
    const sections: HelpCenterSection[] = resObj.sections.map((s: ZendeskGuideSection) =>
      this.formattedSection(s, articles),
    );

    const topArticles = articles
      .filter(a => a.positionInTop)
      .sort((a, b) => a.positionInTop - b.positionInTop);

    return { articles, sections, topArticles };
  }

  private async fetchFromZendeskAPI(baseUrl: string, docType: string, params: string = '') {
    const { body } = await this.agent.get(
      `${baseUrl}/api/v2/help_center/${docType}.json?${params}`,
    );
    return body;
  }

  private formattedSection(section: ZendeskGuideSection, articles: HelpCenterArticle[]) {
    return {
      title: section.name,
      description: section.description,
      articles: articles.filter(a => a.sectionId === section.id),
    };
  }

  private formattedArticle(article: ZendeskGuideArticle) {
    const positionInTop = article.label_names.includes('top1')
      ? 1
      : article.label_names.includes('top2')
      ? 2
      : article.label_names.includes('top3')
      ? 3
      : null;

    return {
      id: article.id,
      title: article.name,
      sectionId: article.section_id,
      body: article.body,
      labelNames: article.label_names,
      positionInTop,
    };
  }
}
