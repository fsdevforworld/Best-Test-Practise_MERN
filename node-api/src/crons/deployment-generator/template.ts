import { CronConcurrencyPolicy } from '../cron';

export default function makeTemplate(): any {
  return {
    apiVersion: 'batch/v1beta1',
    kind: 'CronJob',
    metadata: {
      name: null,
      labels: { run: null },
    },
    spec: {
      schedule: null,
      successfulJobsHistoryLimit: 3,
      concurrencyPolicy: CronConcurrencyPolicy.Allow,
      jobTemplate: {
        spec: {
          template: {
            metadata: {
              labels: { run: null },
            },
            spec: {
              restartPolicy: 'Never',
              nodeSelector: { ['cloud.google.com/gke-nodepool']: 'fill-this-in' },
              containers: [
                {
                  name: null,
                  imagePullPolicy: 'Always',
                  image: 'fill-this-in',
                  args: [null, null],
                  env: [
                    {
                      name: 'DEPLOYMENT_NAME',
                      value: 'fill-this-in',
                    },
                    {
                      name: 'DD_SERVICE_NAME',
                      value: 'fill-this-in',
                    },
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
                  ],
                  envFrom: [
                    { secretRef: { name: 'dave-secrets' } },
                    { configMapRef: { name: 'default-dave-config' } },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  };
}
