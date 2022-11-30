import { UserIncident } from '../../src/models';

export default function(factory: any) {
  factory.define('user-incident', UserIncident, {
    incidentId: factory.assoc('incident', 'id'),
    userId: factory.assoc('user', 'id'),
  });
}
