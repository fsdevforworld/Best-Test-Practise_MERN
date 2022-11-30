import { IApiResourceObject } from '../../../../typings';

interface INotePriorityResource extends IApiResourceObject {
  type: 'dashboard-note-priority';
  attributes: {
    created: string;
    displayName: string;
    ranking: number;
    updated: string;
  };
}

export default INotePriorityResource;
