import { expect } from 'chai';
import { clean } from '../test-helpers';
import { DehydratedBaseDocument } from 'synapsepay';
import factory from '../factories';
import { InvalidParametersError } from '../../src/lib/error';
import { SynapsepayDocument } from '../../src/models';

describe('Model: SynapseDocument', () => {
  before(() => clean());

  afterEach(() => clean());

  describe('updateSanctionsScreening', () => {
    it('updates the sanctionsScreeningMatch field to true on a MATCH', async () => {
      const document = await factory.create<SynapsepayDocument>('synapsepay-document', {
        sanctionsScreeningMatch: false,
      });

      const mockDocument = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
        screening_results: {
          fbi_cyber: 'NO_MATCH',
          aucl: 'MATCH',
        },
      });

      await document.updateSanctionsScreening(mockDocument);

      await document.reload();

      expect(document.sanctionsScreeningMatch).to.equal(true);
    });

    it('updates the sanctionsScreeningMatch field to false when there are no MATCH', async () => {
      const document = await factory.create('synapsepay-document', {
        sanctionsScreeningMatch: true,
      });

      const mockDocument = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
        screening_results: {
          fbi_cyber: 'NO_MATCH',
          aucl: 'NO_MATCH',
        },
      });

      await document.updateSanctionsScreening(mockDocument);

      await document.reload();

      expect(document.sanctionsScreeningMatch).to.equal(false);
    });

    it('throws an InvalidParameters error when the screening_results data is not included', async () => {
      const document = await factory.create('synapsepay-document', {
        sanctionsScreeningMatch: false,
      });

      const mockDocument = await factory.build<DehydratedBaseDocument>('dehydrated-base-document', {
        screening_results: null,
      });

      await expect(document.updateSanctionsScreening(mockDocument)).to.be.rejectedWith(
        InvalidParametersError,
      );
    });
  });
});
