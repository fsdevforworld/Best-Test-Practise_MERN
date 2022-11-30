import { InstanceUpdateOptions } from 'sequelize';

export interface InstanceUpdateOptionsWithMetadata extends InstanceUpdateOptions {
  metadata: object;
}
