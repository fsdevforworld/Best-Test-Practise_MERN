import { IApiResourceObject } from '../../../../typings';
import ChangelogEntryDetail from './changelog-entry-detail';

interface IChangelogEntryResource extends IApiResourceObject {
  type: 'changelog-entry';
  attributes: {
    title: string;
    initiator: 'agent' | 'system' | 'user';
    details: ChangelogEntryDetail[];
    occurredAt: string;
    priority?: 'low' | 'medium' | 'high';
    status?: string;
  };
}

export default IChangelogEntryResource;
