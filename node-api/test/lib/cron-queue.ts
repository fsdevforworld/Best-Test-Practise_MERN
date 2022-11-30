import * as Bluebird from 'bluebird';
import * as BullQueue from 'bull';
import { JobInformation, Queue } from 'bull';
import { expect } from 'chai';

import { jobInformationToCronRepeatOptions, syncCronQueue } from '../../src/lib/cron-queue';
import QueueOptions from '../../src/lib/queue';

describe('CronQueue', () => {
  let queue: Queue;

  afterEach(async () => {
    const jobs = await queue.getRepeatableJobs();
    await Bluebird.all(
      jobs.map((job: any) =>
        queue.removeRepeatable(job.name, jobInformationToCronRepeatOptions(job)),
      ),
    );
  });

  it('should add a cron job', async () => {
    queue = new BullQueue('should add a cron job', QueueOptions);
    expect(await queue.count()).to.equal(0);
    expect(await queue.getRepeatableCount()).to.equal(0);
    await syncCronQueue(queue, [
      {
        name: 'should add a cron job',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 1 *' } },
      },
    ]);
    expect(await queue.count()).to.equal(1);
    expect(await queue.getRepeatableCount()).to.equal(1);
    const jobs = await queue.getRepeatableJobs();
    expect(jobs[0].name).to.equal('should add a cron job');
    expect(jobs[0].cron).to.equal('0 0 1 1 *');
  });

  it('should raise an error when two job names are the same', async () => {
    queue = new BullQueue('should raise an error when two job names are the same', QueueOptions);
    let error: Error;
    try {
      await syncCronQueue(queue, [
        {
          name: 'a',
          process: async () => {},
          options: { repeat: { cron: '0 0 1 1 *' } },
        },
        {
          name: 'a',
          process: async () => {},
          options: { repeat: { cron: '0 0 1 2 *' } },
        },
      ]);
    } catch (e) {
      error = e;
    }
    expect(error.toString()).to.equal(`Error: cron job "a" is already registered.`);
  });

  it('should add another cron job to an existing queue', async () => {
    queue = new BullQueue('should add another cron job to an existing queue', QueueOptions);
    await syncCronQueue(queue, [
      {
        name: 'should add another cron job to an existing queue1',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 1 *' } },
      },
    ]);

    queue = new BullQueue('should add another cron job to an existing queue', QueueOptions);
    expect(await queue.count()).to.equal(1);
    expect(await queue.getRepeatableCount()).to.equal(1);
    await syncCronQueue(queue, [
      {
        name: 'should add another cron job to an existing queue1',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 1 *' } },
      },
      {
        name: 'should add another cron job to an existing queue2',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 2 *' } },
      },
    ]);

    expect(await queue.count()).to.equal(2);
    expect(await queue.getRepeatableCount()).to.equal(2);
    const jobs = await queue.getRepeatableJobs();
    jobs.sort(sortJobs);
    expect(jobs[0].name).to.equal('should add another cron job to an existing queue1');
    expect(jobs[0].cron).to.equal('0 0 1 1 *');
    expect(jobs[1].name).to.equal('should add another cron job to an existing queue2');
    expect(jobs[1].cron).to.equal('0 0 1 2 *');
  });

  it('should remove a cron job from an existing queue', async () => {
    queue = new BullQueue('should remove a cron job from an existing queue', QueueOptions);
    await syncCronQueue(queue, [
      {
        name: 'should remove a cron job from an existing queue1',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 1 *' } },
      },
    ]);

    queue = new BullQueue('should remove a cron job from an existing queue', QueueOptions);
    await syncCronQueue(queue, []);
    expect(await queue.count()).to.equal(0);
    expect(await queue.getRepeatableCount()).to.equal(0);
  });

  it('should update a cron job in an existing queue', async () => {
    queue = new BullQueue('should update a cron job in an existing queue', QueueOptions);
    await syncCronQueue(queue, [
      {
        name: 'should update a cron job in an existing queue',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 1 *' } },
      },
    ]);
    let jobs = await queue.getRepeatableJobs();
    expect(jobs[0].name).to.equal('should update a cron job in an existing queue');
    expect(jobs[0].cron).to.equal('0 0 1 1 *');

    queue = new BullQueue('should update a cron job in an existing queue', QueueOptions);
    expect(await queue.count()).to.equal(1);
    expect(await queue.getRepeatableCount()).to.equal(1);
    await syncCronQueue(queue, [
      {
        name: 'should update a cron job in an existing queue',
        process: async () => {},
        options: { repeat: { cron: '0 0 1 2 *' } },
      },
    ]);
    expect(await queue.count()).to.equal(1);
    expect(await queue.getRepeatableCount()).to.equal(1);
    jobs = await queue.getRepeatableJobs();
    expect(jobs[0].name).to.equal('should update a cron job in an existing queue');
    expect(jobs[0].cron).to.equal('0 0 1 2 *');
  });
});

function sortJobs(a: JobInformation, b: JobInformation): number {
  return a.name.localeCompare(b.name);
}
