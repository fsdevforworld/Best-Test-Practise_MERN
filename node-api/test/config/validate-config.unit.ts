import { expect } from 'chai';
import { readFileSync } from 'fs';
import getValidator from './config-validation-schema';

describe('validateConfigs', () => {
  const validator = getValidator();

  const prodSchema = {
    id: '/Prod',
    type: 'object',
    required: ['googleCloud'],
    properties: {
      googleCloud: { $ref: '/GoogleCloud' },
    },
  };

  it('Production is valid', () => {
    const content = JSON.parse(readFileSync('config/production.json', 'utf8'));
    const result = validator.validate(content, prodSchema);

    expect(result.errors).to.be.empty;
  });
});
