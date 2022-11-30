import tracer from 'dd-trace';

if (process.env.DATADOG_ENABLED === 'true') {
  tracer.init();

  tracer.use('express', {
    // Disable instrumenting health-check endpoint
    blocklist: ['/'],
  });
}

export default tracer;
