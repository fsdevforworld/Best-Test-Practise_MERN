import * as sinon from 'sinon';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { buildYaml } from '../../../src/crons/deployment-generator/build-yaml';
import { Cron, CronConcurrencyPolicy, DaveCron } from '../../../src/crons/cron';
import { crons } from '../../../src/crons';
import { expect } from 'chai';
import * as path from 'path';

describe('BuildYaml', () => {
  let existsStub: sinon.SinonStub;
  let mkdirStub: sinon.SinonStub;
  let writeFileStub: sinon.SinonStub;
  const sandbox = sinon.createSandbox();

  const cronSchedule: Cron = {
    name: DaveCron.SynapsepayBalanceCheck,
    process: () => {},
    schedule: '* * * * *',
  };

  beforeEach(() => {
    existsStub = sandbox.stub(fs, 'existsSync');
    mkdirStub = sandbox.stub(fs, 'mkdirSync');
    writeFileStub = sandbox.stub(fs, 'writeFileSync');
  });

  afterEach(() => sandbox.restore());

  it('Should create the crons folder if it does not exist', () => {
    existsStub
      .onFirstCall()
      .returns(false)
      .onSecondCall()
      .returns(true);
    buildYaml(cronSchedule);
    expect(existsStub.callCount).to.eq(1);
    expect(mkdirStub.callCount).to.eq(1);
    expect(mkdirStub.firstCall.args[0]).to.eq(path.resolve('infra/crons'));
  });

  it('Should create a yaml file with the task name', () => {
    existsStub
      .onFirstCall()
      .returns(true)
      .onSecondCall()
      .returns(true);
    buildYaml(cronSchedule);
    expect(writeFileStub.callCount).to.eq(1);
    const expectedPath = `${path.resolve('infra/crons')}/${cronSchedule.name}.yml`;
    expect(writeFileStub.firstCall.args[0]).to.eq(expectedPath);
    expect(writeFileStub.firstCall.args[1]).to.contain(`name: ${cronSchedule.name}`);
  });

  it('Should build yaml file with correct env vars', () => {
    const cron = {
      name: DaveCron.SynapsepayBalanceCheck,
      process: () => {},
      schedule: '0 14 * * 1-5',
      successfulJobsHistoryLimit: 0,
      concurrencyPolicy: CronConcurrencyPolicy.Replace,
      startingDeadlineSeconds: 60,
      envVars: {
        READ_REPLICA_HOST: 'cloudsql-proxy-replica',
        READ_REPLICA_PORT: '3306',
        DB_USE_READ_REPLICA: 'true',
      },
    };

    existsStub
      .onFirstCall()
      .returns(true)
      .onSecondCall()
      .returns(true);

    const yamlString = buildYaml(cron);

    const yamlObject = yaml.safeLoad(yamlString);
    const env = yamlObject.spec.jobTemplate.spec.template.spec.containers[0].env;
    expect(env).to.deep.eq([
      { name: 'DEPLOYMENT_NAME', value: cron.name },
      { name: 'DD_SERVICE_NAME', value: cron.name },
      {
        name: 'DD_TRACE_AGENT_HOSTNAME',
        valueFrom: { fieldRef: { fieldPath: 'status.hostIP' } },
      },
      {
        name: 'NAMESPACE',
        valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } },
      },
      {
        name: 'NODE_NAME',
        valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } },
      },
      { name: 'READ_REPLICA_HOST', value: 'cloudsql-proxy-replica' },
      { name: 'READ_REPLICA_PORT', value: '3306' },
      { name: 'DB_USE_READ_REPLICA', value: 'true' },
    ]);
  });

  [
    {
      name: DaveCron.CreateSubscriptionBillings,
      schedule: '* * * * *',
      successfulJobsHistoryLimit: 3,
      concurrencyPolicy: CronConcurrencyPolicy.Allow,
    },
    {
      name: DaveCron.PublishCollectNoOverdraftAdvance,
      schedule: '0 17 * * *',
      successfulJobsHistoryLimit: 1,
      concurrencyPolicy: CronConcurrencyPolicy.Forbid,
    },
    {
      name: DaveCron.SynapsepayBalanceCheck,
      schedule: '0 14 * * 1-5',
      successfulJobsHistoryLimit: 0,
      concurrencyPolicy: CronConcurrencyPolicy.Replace,
      startingDeadlineSeconds: 60,
    },
  ].forEach(
    ({
      name,
      schedule,
      successfulJobsHistoryLimit,
      concurrencyPolicy,
      startingDeadlineSeconds,
    }) => {
      it('should build yaml file with correct cron options', () => {
        existsStub
          .onFirstCall()
          .returns(true)
          .onSecondCall()
          .returns(true);

        const yamlString = buildYaml({
          name,
          process: () => {},
          schedule,
          successfulJobsHistoryLimit,
          concurrencyPolicy,
          startingDeadlineSeconds,
        });

        const yamlObject = yaml.safeLoad(yamlString);

        expect(yamlObject.metadata).to.deep.eq({
          name,
          labels: { run: name },
        });
        expect(yamlObject.spec.startingDeadlineSeconds).to.eq(startingDeadlineSeconds);
        expect(yamlObject.spec).to.include({
          schedule,
          successfulJobsHistoryLimit,
          concurrencyPolicy,
        });
      });
    },
  );

  it('all schedules should be valid', () => {
    const cronRegex = /^(([*|\d+]((\/|-|,)?(\d+))*)\s*){5}$/gi;
    crons.map(schedule => {
      const match = schedule.schedule.match(cronRegex);
      expect(match, `Cron schedule is invalid for ${schedule.name}`).not.to.be.null;
    });
  });
});
