import { ReferenceMappingsType } from './typings';

class ReferenceMappings {
  private fromToReferences: { [key: string]: ReferenceMappingsType } = {};

  public get() {
    return this.fromToReferences;
  }

  public add({
    resource,
    fromId,
    toId,
    name,
  }: {
    resource: string;
    fromId: number;
    toId: number;
    name: string;
  }): void {
    this.fromToReferences[resource] = this.fromToReferences[resource] || {};
    this.fromToReferences[resource][fromId] = {
      fromId,
      toId,
      name,
    };
  }
}

export default new ReferenceMappings();
