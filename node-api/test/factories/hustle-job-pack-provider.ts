import { HustleJobPackProvider } from '../../src/models';
import { SequelizeAdapterOrObjectAdapter } from './sequelize-or-object-adapter';

export default function(factory: any) {
  factory.setAdapter(new SequelizeAdapterOrObjectAdapter(), 'hustle-job-pack-search');
  factory.define('hustle-job-pack-provider', HustleJobPackProvider, {
    hustleJobPackId: factory.assoc('hustle-job-pack', 'id'),
    sideHustleProviderId: factory.assoc('side-hustle-provider', 'id'),
  });
}
