import { expect } from 'chai';
import * as request from 'superagent';
import * as config from 'config';
import * as sinon from 'sinon';
import Client from '../../../src/lib/zendesk-guide/client';

const overdraftBaseUrl = config.get<string>('zendesk.guide.overdraftUrl');

describe('Zendesk Guide Client', () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => sandbox.restore());

  describe('fetchHelpCenter', () => {
    it('should return articles, sections and topSections where topSections are sorted', async () => {
      sandbox.stub(request.agent.prototype, 'get').resolves({
        body: {
          articles: [
            {
              id: 1,
              name: 'random article 1',
              section_id: 1,
              body: 'some random article stuff',
              label_names: [],
            },
            {
              id: 2,
              name: 'random article 2',
              section_id: 2,
              body: 'some random article stuff',
              label_names: ['top2'],
            },
            {
              id: 3,
              name: 'random article 3',
              section_id: 1,
              body: 'some random article stuff',
              label_names: ['top1'],
            },
          ],
          sections: [
            {
              name: 'frogger',
              description: 'tetris',
              id: 1,
            },
            {
              name: 'atari',
              description: 'playstation',
              id: 2,
            },
          ],
        },
      });
      const client = new Client(overdraftBaseUrl);
      const { articles, sections, topArticles } = await client.fetchHelpCenter();
      const topArticle1 = {
        id: 3,
        title: 'random article 3',
        sectionId: 1,
        body: 'some random article stuff',
        labelNames: ['top1'],
        positionInTop: 1,
      };
      const topArticle2 = {
        id: 2,
        title: 'random article 2',
        sectionId: 2,
        body: 'some random article stuff',
        labelNames: ['top2'],
        positionInTop: 2,
      };
      expect(articles).to.be.deep.eq([
        {
          id: 1,
          title: 'random article 1',
          sectionId: 1,
          body: 'some random article stuff',
          labelNames: [],
          positionInTop: null,
        },
        topArticle2,
        topArticle1,
      ]);
      expect(sections).to.be.deep.eq([
        {
          title: 'frogger',
          description: 'tetris',
          articles: [
            {
              id: 1,
              title: 'random article 1',
              sectionId: 1,
              body: 'some random article stuff',
              labelNames: [],
              positionInTop: null,
            },
            topArticle1,
          ],
        },
        {
          title: 'atari',
          description: 'playstation',
          articles: [topArticle2],
        },
      ]);
      expect(topArticles).to.be.deep.eq([topArticle1, topArticle2]);
    });

    it('should return empty arrays for articles, sections and topSections if nothing comes back', async () => {
      sandbox.stub(request.agent.prototype, 'get').resolves({
        body: {
          articles: [],
          sections: [],
        },
      });
      const client = new Client(overdraftBaseUrl);
      const { articles, sections, topArticles } = await client.fetchHelpCenter();

      expect(articles).to.be.empty;
      expect(sections).to.be.empty;
      expect(topArticles).to.be.empty;
    });
  });
});
