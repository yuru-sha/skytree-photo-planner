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
  const queue = {
    close: jest.fn().mockResolvedValue(undefined),
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
