import { createLogger } from './logger.ts';

const logger = createLogger('scheduler');

type Job = {
  name: string;
  fn: () => Promise<void>;
  interval: number;
  dependencies?: string[];
  lastRun?: number;
  isRunning?: boolean;
};

export class JobScheduler {
  private static instance: JobScheduler;
  private jobs: Job[] = [];
  private intervals: number[] = [];

  private constructor() {}

  public static getInstance(): JobScheduler {
    if (!JobScheduler.instance) {
      JobScheduler.instance = new JobScheduler();
    }
    return JobScheduler.instance;
  }

  public addJob(name: string, fn: () => Promise<void>, interval: number, dependencies?: string[]) {
    this.jobs.push({ name, fn, interval, dependencies, lastRun: 0, isRunning: false });
    logger.info(`Added job: ${name} with interval ${interval}ms${dependencies ? ` (depends on: ${dependencies.join(', ')})` : ''}`);
  }

  private async runJob(job: Job) {
    // Skip if job is already running
    if (job.isRunning) {
      return;
    }

    // Check dependencies
    if (job.dependencies?.length) {
      for (const depName of job.dependencies) {
        const dep = this.jobs.find(j => j.name === depName);
        if (!dep) {
          logger.error(`Dependency ${depName} not found for job ${job.name}`);
          return;
        }
        
        // Skip if dependency hasn't run yet or is currently running
        if (!dep.lastRun || dep.isRunning) {
          return;
        }
      }
    }

    // Check if enough time has passed since last run
    const now = Date.now();
    if (job.lastRun && (now - job.lastRun) < job.interval) {
      return;
    }

    try {
      job.isRunning = true;
      await job.fn();
      job.lastRun = now;
    } catch (error) {
      logger.error(`Error in job ${job.name}:`, error);
    } finally {
      job.isRunning = false;
    }
  }

  public start() {
    // Run all jobs immediately
    for (const job of this.jobs) {
      void this.runJob(job);
    }

    // Set up intervals to check jobs
    const interval = setInterval(() => {
      for (const job of this.jobs) {
        void this.runJob(job);
      }
    }, 1000); // Check every second
    
    this.intervals.push(interval);
    logger.info('Started all jobs');
  }

  public stop() {
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
    logger.info('Stopped all jobs');
  }
}
