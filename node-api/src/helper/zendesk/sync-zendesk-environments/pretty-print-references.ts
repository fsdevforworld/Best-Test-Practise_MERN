import { forEach } from 'lodash';
import referenceMappings from './reference-mappings';
import logger from '../../../lib/logger';

function replaceUnderscoreWithSpace(string: string): string {
  return string.replace(/_/g, ' ');
}

export default function prettyPrintReferences(): void {
  const fromToReferences = referenceMappings.get();
  forEach(fromToReferences, (resource, title) => {
    logger.info(`
      ${replaceUnderscoreWithSpace(title).toUpperCase()}
      ${'-'.repeat(title.length)}`);

    forEach(resource, resourceEntry => {
      logger.info(`
        Name: ${resourceEntry.name}
        From Environment Id: ${resourceEntry.fromId}
        To Environment Id: ${resourceEntry.toId}
      `);
    });
  });
}
