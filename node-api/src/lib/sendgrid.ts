import * as Sendgrid from '@sendgrid/mail';
import * as config from 'config';
import { AttachmentData } from '@sendgrid/helpers/classes/attachment';
import logger from './logger';
import { dogstatsd } from './datadog-statsd';

const SENDGRID_API_KEY: string = config.get('sendgrid.apiKey');

if (!SENDGRID_API_KEY) {
  throw new Error('SENDGRID_API_KEY environmnent variables are not set on host');
}

Sendgrid.setApiKey(SENDGRID_API_KEY);
Sendgrid.setSubstitutionWrappers('*|', '|*');

async function send(
  subject: string | undefined,
  template: string,
  substitutions: any,
  to: string,
  customArgs?: any,
  from: string = 'no-reply@dave.com',
  categories?: any,
  fromName: string = 'Dave',
  attachments?: AttachmentData[],
) {
  const message = {
    //TODO: Clean up CE-1195
    to: to.replace(/\s/g, ''),
    from: { email: from, name: fromName },
    subject,
    templateId: template,
    substitutions,
    categories,
    customArgs,
    attachments,
  };
  try {
    return await Sendgrid.send(message);
  } catch (err) {
    dogstatsd.increment('sendgrid.send.failed');
    logger.error(`Error sending email`, {
      template,
      to,
      err,
    });
    throw err;
  }
}

async function sendHtml(
  subject: string | undefined,
  html: string,
  to: string | string[],
  from: string = 'no-reply@dave.com',
  fromName: string = 'Dave',
  attachments?: AttachmentData[],
): Promise<void> {
  const message = {
    to,
    from: { email: from, name: fromName },
    subject,
    html,
    attachments,
  };
  try {
    await Sendgrid.send(message);
  } catch (err) {
    logger.error(`Error sending email: ${subject}, to: ${to}`, {
      err,
    });
    throw err;
  }
}

/*
 * Sendgrid's v3 endpoint for dynamic Transactional email templates.
 * Uses handlebars syntax instead of substitution wrappers to pass in variables to email templates.
 */
async function sendDynamic(
  subject: string | undefined,
  templateId: string,
  dynamicTemplateData: any,
  to: string,
  customArgs?: any,
  from: string = 'no-reply@dave.com',
  categories?: any,
  fromName: string = 'Dave',
) {
  const message: any = {
    to,
    from: { email: from, name: fromName },
    subject,
    templateId,
    dynamic_template_data: { ...dynamicTemplateData, subject },
    categories,
    customArgs,
  };
  try {
    return await Sendgrid.send(message);
  } catch (err) {
    logger.error(`Error sending email: ${templateId}, to: ${to}`, {
      err,
    });
    throw err;
  }
}

type SendgridLib = {
  client: typeof Sendgrid.MailService;
  send: typeof send;
  sendDynamic: typeof sendDynamic;
  sendHtml: typeof sendHtml;
};

const sendgridLib: SendgridLib = {
  client: Sendgrid,
  send,
  sendDynamic,
  sendHtml,
};

export default sendgridLib;
