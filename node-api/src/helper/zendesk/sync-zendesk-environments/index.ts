import Client from '../../../lib/zendesk/client';
import singularizeResource from './singularize-resource';
import referenceMappings from './reference-mappings';
import fetchAndProcessResource from './fetch-and-process-resource';
import prettyPrintReferences from './pretty-print-references';
import { AnyZendeskResource } from './typings';
import logger from '../../../lib/logger';

// Note: The order is important since the necessary ids for the various resources
// need to be created before other resources that reference them can be created
const resourcesToSync = ['brands', 'ticket_fields', 'ticket_forms'];

async function createToResource(
  toClient: Client,
  resource: string,
  value: AnyZendeskResource,
): Promise<void> {
  const createResponse = await toClient.create({
    resource,
    value,
  });
  const createdResource = createResponse.body[singularizeResource(resource)];

  referenceMappings.add({
    resource,
    fromId: value.id,
    toId: createdResource.id,
    name: createdResource.name || createdResource.title,
  });
}

async function sync(fromClient: Client, toClient: Client, resource: string): Promise<void> {
  const fetchedResponse = await fetchAndProcessResource(fromClient, toClient, resource);

  logger.info(`Syncing ${resource}`);

  await Promise.all(
    fetchedResponse.map(
      async (value: AnyZendeskResource) => await createToResource(toClient, resource, value),
    ),
  );
}

export default async function syncZendeskEnvironments(
  fromClient: Client,
  toClient: Client,
): Promise<void> {
  for (const resource of resourcesToSync) {
    await sync(fromClient, toClient, resource);
  }

  logger.info('All created old/new references');
  prettyPrintReferences();
}
