# Async Task Migration

[Bull](https://github.com/OptimalBits/bull) used to be the favored (redis backed) async task runner.  We're looking to get rid of most dependencies on it.

You can help by migrating jobs to Google Cloud Tasks!

## Bull Tasks

Bull Tasks are run by `JobManager`. The [src/jobs/index.ts](./src/jobs/index.ts) file has a list of tasks it runs.

We are looking to delete these one by one, and replace them with GCTs.

Our process is:

1. Replace the scheduling of these JobManager jobs with Cloud Tasks
2. Deploy
3. Wait for the Bull jobs to drain
4. Remove the old Bull task in a separate PR (including from the JobManager list in the file above)

### Concretely, 

You are going to find references to `[TaskNameToReplace].add({...args})` and replace them with the `create**Task` method you make in `/src/jobs/data/index.ts`.  `createUpdatePaymentStatusTask` is an example of this.

## Creating a new Cloud Task

You should use `generateLoggingCreator` to make the new Cloud Task in `src/jobs/data/index.ts`.

1. Find or create the function that will be run.  
  - It MUST not have `Bull` arguments. 
  - It MUST be able to get its argument from the web router. 
2. Add the method to ther [router](./src/services/task-handler/router.ts)
3. Add tests confirming the method itself.
4. Confirm routing manually (or solve that testing issue)

### Previous Migrations

Follow along at home!

- [UpdatePaymentStatus](https://github.com/dave-inc/node-api/commit/44f492bcf4049fe83817376d5889afa2613d0d70)
