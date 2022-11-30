import { Validator } from 'jsonschema';

export default function getValidator(): Validator {
  const validator = new Validator();
  validator.addSchema(cloudTaskSchema, '/GoogleCloudTask');
  validator.addSchema(googleCloudSchema, '/GoogleCloud');
  return validator;
}

const cloudTaskSchema = {
  id: '/GoogleCloudTask',
  type: 'object',
  required: ['handlerURL', 'queueName'],
  properties: {
    handlerURL: { type: 'string' },
    queueName: { type: 'string' },
  },
};

const googleCloudSchema = {
  id: '/GoogleCloud',
  type: 'object',
  required: ['location', 'projectId', 'tasks'],
  properties: {
    location: { type: 'string' },
    projectId: {
      type: 'string',
    },
    tasks: {
      type: 'object',
      required: ['signingEmail', 'handlers'],
      properties: {
        signingEmail: { type: 'string' },
        handlers: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            $ref: '/GoogleCloudTask',
          },
        },
      },
    },
  },
};
