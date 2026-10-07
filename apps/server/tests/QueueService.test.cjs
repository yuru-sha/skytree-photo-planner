const { EventEmitter } = require("events");

const mockRedisInstances = [];
const mockQueueInstances = [];
const mockWorkerInstances = [];

class MockRedis extends EventEmitter {
  constructor() {
    super();
    this.quit = jest.fn().mockResolvedValue("OK");
    this.ping = jest.fn().mockResolvedValue("PONG");
    mockRedisInstances.push(this);
  }
}

const MockQueue = jest.fn().mockImplementation(() => {
  const jobsById = new Map();
  const queue = {
    close: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockImplementation(async (name, data, options = {}) => {
      if (options.jobId && jobsById.has(options.jobId)) {
        return jobsById.get(options.jobId);
      }

      const job = {
        id: options.jobId || `job-${jobsById.size + 1}`,
        name,
        data,
        opts: options,
      };
      if (options.jobId) {
        jobsById.set(options.jobId, job);
      }
      return job;
    }),
  };
  mockQueueInstances.push(queue);
  return queue;
});

const MockWorker = jest.fn().mockImplementation((_name, _processor, options) => {
  const worker = new EventEmitter();
  worker.opts = options;
  worker.close = jest.fn().mockResolvedValue(undefined);
  worker.pause = jest.fn().mockResolvedValue(undefined);
  mockWorkerInstances.push(worker);
  return worker;
});

jest.mock("ioredis", () => ({
  Redis: MockRedis,
}));

jest.mock("bullmq", () => ({
  Queue: MockQueue,
  Worker: MockWorker,
}));

jest.mock(
  "@skytree-photo-planner/utils",
  () => ({
    getComponentLogger: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  { virtual: true },
);

describe("QueueService initialization lifecycle", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    mockRedisInstances.splice(0);
    mockQueueInstances.splice(0);
    mockWorkerInstances.splice(0);
    MockQueue.mockClear();
    MockWorker.mockClear();
    delete process.env.DISABLE_REDIS;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("initializes one queue and worker across repeated Redis ready events", async () => {
    const { QueueService } = require("../src/services/QueueService");
    const service = new QueueService(null, true);
    const redis = mockRedisInstances[0];

    redis.emit("ready");
    redis.emit("ready");

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    redis.emit("ready");
    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(MockQueue).toHaveBeenCalledTimes(1);
    expect(MockWorker).toHaveBeenCalledTimes(1);

    await service.shutdown();
    expect(mockQueueInstances[0].close).toHaveBeenCalledTimes(1);
    expect(mockWorkerInstances[0].close).toHaveBeenCalledTimes(1);
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });

  it("uses deterministic job IDs to deduplicate location calculations", async () => {
    const { QueueService } = require("../src/services/QueueService");
    const service = new QueueService(null, false);
    const redis = mockRedisInstances[0];

    redis.emit("ready");
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    const firstId = await service.scheduleLocationCalculation(42, 2027, 2027, "low");
    const duplicateId = await service.scheduleLocationCalculation(42, 2027, 2027, "low");
    const differentLocationId = await service.scheduleLocationCalculation(43, 2027, 2027, "low");
    const differentRangeId = await service.scheduleLocationCalculation(42, 2027, 2028, "low");

    expect(firstId).toBe("location-42-2027-2027");
    expect(duplicateId).toBe(firstId);
    expect(differentLocationId).toBe("location-43-2027-2027");
    expect(differentRangeId).toBe("location-42-2027-2028");

    const addCalls = mockQueueInstances[0].add.mock.calls;
    expect(addCalls[0][2].jobId).toBe("location-42-2027-2027");
    expect(addCalls[1][2].jobId).toBe("location-42-2027-2027");
    expect(addCalls[2][2].jobId).toBe("location-43-2027-2027");
    expect(addCalls[3][2].jobId).toBe("location-42-2027-2028");

    await service.shutdown();
  });

  it("cancels delayed initialization when shutdown starts", async () => {
    const { QueueService } = require("../src/services/QueueService");
    const service = new QueueService(null, true);
    const redis = mockRedisInstances[0];

    redis.emit("ready");
    await service.shutdown();

    jest.advanceTimersByTime(1000);
    await Promise.resolve();

    expect(MockQueue).not.toHaveBeenCalled();
    expect(MockWorker).not.toHaveBeenCalled();
    expect(redis.quit).toHaveBeenCalledTimes(1);
  });
});
