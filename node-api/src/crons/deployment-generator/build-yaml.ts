import makeTemplate from './template';
import * as config from 'config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { isNil } from 'lodash';
import * as path from 'path';
import { Cron, CronConcurrencyPolicy } from '../cron';

const { taskPoolName, dockerImageName } = config.get('gke');

const cronPath = config.get<string>('crons.yamlPath');

const writePath = path.resolve(cronPath);

/**
 * Builds a cron job k8s deployment based on the provided parameters via a template system
 *
 * @param {DaveCron} name
 * @param {string} schedule
 * @param {number | undefined} successfulJobsHistoryLimit
 * @param {CronConcurrencyPolicy | undefined} concurrencyPolicy
 * @returns {string}
 */
export function buildYaml({
  name,
  schedule,
  successfulJobsHistoryLimit = 3,
  concurrencyPolicy = CronConcurrencyPolicy.Allow,
  suspend,
  startingDeadlineSeconds,
  envVars,
}: Cron): string {
  const cron: any = Object.assign({}, makeTemplate());

  // set the name field
  cron.metadata.name = name;
  cron.metadata.labels.run = name;
  cron.spec.jobTemplate.spec.template.metadata.labels.run = name;
  cron.spec.jobTemplate.spec.template.spec.containers[0].name = name;

  // set project specific configs
  cron.spec.jobTemplate.spec.template.spec.containers[0].image = dockerImageName;
  cron.spec.jobTemplate.spec.template.spec.nodeSelector[
    'cloud.google.com/gke-nodepool'
  ] = taskPoolName;

  // set schedule
  cron.spec.schedule = schedule;

  // suspend job?
  if (!isNil(suspend)) {
    cron.spec.suspend = suspend;
  }

  if (!isNil(startingDeadlineSeconds)) {
    cron.spec.startingDeadlineSeconds = startingDeadlineSeconds;
  }

  // set job history policy
  cron.spec.successfulJobsHistoryLimit = successfulJobsHistoryLimit;

  // set concurrency policy
  cron.spec.concurrencyPolicy = concurrencyPolicy;

  // set deployment name and dd service name
  cron.spec.jobTemplate.spec.template.spec.containers[0].env[0].value = name;
  cron.spec.jobTemplate.spec.template.spec.containers[0].env[1].value = name;

  // Append extra env vars
  for (const key in envVars) {
    if (key && envVars[key]) {
      cron.spec.jobTemplate.spec.template.spec.containers[0].env.push({
        name: key,
        value: envVars[key],
      });
    }
  }

  // create directory if we need to
  if (!fs.existsSync(writePath)) {
    fs.mkdirSync(writePath);
  }

  const fileLocation = `dist/src/crons/deployment-generator/run-cron-task.js`;
  cron.spec.jobTemplate.spec.template.spec.containers[0].args[0] = fileLocation;
  cron.spec.jobTemplate.spec.template.spec.containers[0].args[1] = name;

  // convert file to yaml, make the directory and write file
  const output = yaml.dump(cron);
  fs.writeFileSync(`${writePath}/${name}.yml`, output);

  return output;
}
