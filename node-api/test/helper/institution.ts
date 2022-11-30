import { expect } from 'chai';
import * as sinon from 'sinon';
import { InstitutionWithInstitutionData } from 'plaid';

import InstitutionHelper from '../../src/helper/institution';
import plaidClient from '../../src/lib/plaid';
import mxClient from '../../src/lib/mx';
import * as utils from '../../src/lib/utils';

import factory from '../factories';
import { Institution } from '../../src/models';
import { clean } from '../test-helpers';

describe('Institution Helper', () => {
  const sandbox = sinon.createSandbox();

  before(() => clean());
  afterEach(() => clean(sandbox));

  describe('findOrCreatePlaidInstitution', () => {
    it('should return a matching institution by plaid institution id', async () => {
      const plaidInstitutionId = 'fake-plaid-institution-id';

      const institution = await factory.create<Institution>('institution', {
        plaidInstitutionId,
      });

      const createInstitutionSpy = sandbox.spy(Institution, 'create');

      const result = await InstitutionHelper.findOrCreatePlaidInstitution(plaidInstitutionId);

      expect(result.id).to.eq(institution.id);
      sinon.assert.notCalled(createInstitutionSpy);
    });

    it('should return a newly created institution if no match found', async () => {
      const plaidInstitutionId = 'fake-plaid-institution-id';

      const institution = await factory.create<Institution>('institution', {
        displayName: 'Chase',
      });

      const createInstitutionSpy = sandbox.spy(Institution, 'create');

      const plaidInstitution: InstitutionWithInstitutionData = {
        primary_color: 'fake-color',
        credentials: [
          { name: 'username', label: 'Username', type: 'password' },
          {
            name: 'password',
            label: 'Password',
            type: 'password',
          },
          { name: 'pin', label: 'Pin', type: 'password' },
        ],
        name: 'Fake Bank',
        logo: 'fake-base64-encoded-logo',
        url: 'fake-url-',
        has_mfa: false,
        institution_id: '123',
        mfa: ['fake'],
        country_codes: ['us'],
        products: ['transactions'],
        oauth: false,
      };

      sandbox
        .stub(plaidClient, 'getInstitutionById')
        .withArgs(plaidInstitutionId, { include_optional_metadata: true })
        .returns({ institution: plaidInstitution });

      const result = await InstitutionHelper.findOrCreatePlaidInstitution(plaidInstitutionId);

      expect(result.id).is.not.eq(institution.id);
      sinon.assert.calledWith(createInstitutionSpy, {
        displayName: plaidInstitution.name,
        plaidInstitutionId,
        logo: plaidInstitution.logo,
        primaryColor: plaidInstitution.primary_color,
        usernameLabel: plaidInstitution.credentials[0].label,
        passwordLabel: plaidInstitution.credentials[1].label,
        pinLabel: plaidInstitution.credentials[2].label,
      });
    });
  });

  describe('findOrCreateMxInstitution', () => {
    it('should return a matching institution by mx institution code', async () => {
      const mxInstitutionCode = 'fake-mx-institution-code';
      const mxUserGuid = 'fake-mx-user-guid';
      const mxInstitution = {
        guid: 'fake-mx-institution-guid',
        code: mxInstitutionCode,
        name: 'Chase Bank',
        mediumLogoUrl: 'fake-logo-url',
      };

      const institution = await factory.create<Institution>('institution', {
        mxInstitutionCode: mxInstitution.code,
      });

      const createInstitutionSpy = sandbox.spy(Institution, 'create');

      const result = await InstitutionHelper.findOrCreateMxInstitution(
        mxInstitutionCode,
        mxUserGuid,
      );

      expect(result.id).to.eq(institution.id);
      sinon.assert.notCalled(createInstitutionSpy);
    });

    it('should return a newly created institution if no match found', async () => {
      const mxInstitutionCode = 'fake-mx-institution-code';
      const mxUserGuid = 'fake-mx-user-guid';
      const mxInstitution = {
        guid: 'fake-mx-institution-guid',
        code: mxInstitutionCode,
        name: 'Some Other Bank',
        mediumLogoUrl: 'fake-logo-url',
      };
      const base64EncodedLogo = 'fake-base64-encoded-logo';

      const institution = await factory.create<Institution>('institution', {
        displayName: 'Chase',
      });

      const createInstitutionSpy = sandbox.spy(Institution, 'create');

      sandbox
        .stub(mxClient.institutions, 'readInstitution')
        .withArgs(mxInstitutionCode)
        .returns({ body: { institution: mxInstitution } });

      sandbox
        .stub(utils, 'downloadImageAndBase64Encode')
        .withArgs(mxInstitution.mediumLogoUrl)
        .returns(base64EncodedLogo);

      const result = await InstitutionHelper.findOrCreateMxInstitution(
        mxInstitutionCode,
        mxUserGuid,
      );

      expect(result.id).to.not.eq(institution.id);
      sinon.assert.calledWith(createInstitutionSpy, {
        displayName: mxInstitution.name,
        mxInstitutionCode: mxInstitution.code,
        logo: base64EncodedLogo,
        primaryColor: '#ffffff', // TODO - update after fixing a default color
      });
    });
  });
});
