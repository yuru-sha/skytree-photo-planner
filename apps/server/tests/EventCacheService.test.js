const mockRows = [];
const mockPrisma = {};

jest.mock("../src/database/prisma", () => ({
  prisma: mockPrisma,
  PrismaClientManager: { getInstance: () => mockPrisma },
}));
jest.mock("@skytree-photo-planner/utils", () => ({
  getComponentLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  handleCalculationError: jest.fn((error) => ({
    correlationId: "test-calculation",
    originalError: error,
  })),
  timeUtils: {
    formatDateString: (date) => date.toISOString(),
  },
}), { virtual: true });

const location = {
  id: 7,
  name: "Test location",
  prefecture: "Tokyo",
  latitude: 35,
  longitude: 139,
  elevation: 0,
  azimuthToSkytree: 0,
  elevationToSkytree: 0,
  distanceToSkytree: 0,
  status: "active",
};

function makeEvent(subType) {
  return {
    id: subType,
    type: subType === "sunrise" ? "diamond" : "pearl",
    subType,
    time: new Date("2026-05-10T06:00:00.000Z"),
    location,
    azimuth: 90,
    elevation: 10,
    accuracy: "good",
    moonPhase: null,
    moonIllumination: null,
  };
}

function makeDeferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("EventCacheService overlapping rebuilds", () => {
  beforeEach(() => {
    jest.resetModules();
    mockRows.splice(0, mockRows.length);
    Object.keys(mockPrisma).forEach((key) => delete mockPrisma[key]);
  });

  it("serializes yearly, monthly, and daily rebuilds without duplicate or partial rows", async () => {
    const calculationsStarted = makeDeferred();
    const releaseCalculations = makeDeferred();
    let calculationCount = 0;
    let uniqueViolationCount = 0;
    const waitForOtherCalculations = async () => {
      calculationCount += 1;
      if (calculationCount === 4) calculationsStarted.resolve();
      await releaseCalculations.promise;
    };

    const uniqueKey = (row) =>
      `${row.locationId}:${row.eventDate.toISOString()}:${row.eventType}`;
    const database = {
      location: {
        findMany: jest.fn().mockResolvedValue([location]),
        findUnique: jest.fn().mockResolvedValue(location),
      },
      locationEvent: {
        deleteMany: jest.fn(async ({ where }) => {
          const before = mockRows.length;
          for (let index = mockRows.length - 1; index >= 0; index -= 1) {
            const row = mockRows[index];
            if (
              (where.locationId === undefined || row.locationId === where.locationId) &&
              row.calculationYear === where.calculationYear &&
              (!where.eventTime ||
                (row.eventTime >= where.eventTime.gte && row.eventTime <= where.eventTime.lte))
            ) {
              mockRows.splice(index, 1);
            }
          }
          return { count: before - mockRows.length };
        }),
        createMany: jest.fn(async ({ data }) => {
          const keys = data.map(uniqueKey);
          if (
            new Set(keys).size !== keys.length ||
            keys.some((key) => mockRows.some((row) => uniqueKey(row) === key))
          ) {
            uniqueViolationCount += 1;
            throw new Error("unique constraint violation");
          }
          mockRows.push(...data.map((row) => ({ ...row })));
          return { count: data.length };
        }),
      },
    };

    let lockTail = Promise.resolve();
    mockPrisma.$transaction = jest.fn(async (work) => {
      const transactionRows = mockRows.map((row) => ({ ...row }));
      let release;
      const previous = lockTail;
      lockTail = new Promise((resolve) => {
        release = resolve;
      });
      const tx = {
        ...database,
        $queryRaw: jest.fn(async () => {
          await previous;
        }),
      };
      try {
        const result = await work(tx);
        release();
        return result;
      } catch (error) {
        mockRows.splice(0, mockRows.length, ...transactionRows);
        release();
        throw error;
      }
    });
    Object.assign(mockPrisma, database);

    const { EventCacheService } = require("../src/services/EventCacheService");
    const calculator = {
      calculateLocationYearlyEvents: jest.fn(async () => {
        await waitForOtherCalculations();
        return [makeEvent("sunrise"), makeEvent("rising")];
      }),
      calculateMonthlyEvents: jest.fn(async () => {
        await waitForOtherCalculations();
        return [makeEvent("sunrise"), makeEvent("rising")];
      }),
      calculateDiamondSkytree: jest.fn(async () => {
        await waitForOtherCalculations();
        return [makeEvent("sunrise")];
      }),
      calculatePearlSkytree: jest.fn(async () => [makeEvent("rising")]),
    };
    const service = new EventCacheService(calculator);

    const rebuilds = [
      service.generateYearlyCache(2026),
      service.generateLocationCache(location.id, 2026),
      service.generateLocationMonthCache(location.id, 2026, 5),
      service.generateLocationDayCache(location.id, 2026, 5, 10),
    ];
    await calculationsStarted.promise;
    releaseCalculations.resolve();
    const results = await Promise.all(rebuilds);

    expect(uniqueViolationCount).toBe(0);
    expect(results.map((result) => result.success)).toEqual([true, true, true, true]);
    expect(mockRows).toHaveLength(2);
    expect(new Set(mockRows.map(uniqueKey)).size).toBe(2);
  });
  it("restores the old cache when a later insert batch fails", async () => {
    const original = {
      locationId: location.id,
      eventDate: new Date("2026-01-01T09:00:00.000Z"),
      eventTime: new Date("2026-01-01T06:00:00.000Z"),
      azimuth: 80,
      altitude: 5,
      qualityScore: 0.6,
      moonPhase: null,
      moonIllumination: null,
      calculationYear: 2026,
      eventType: "diamond_sunrise",
      accuracy: "good",
    };
    mockRows.push(original);
    let insertBatch = 0;
    const database = {
      location: {
        findUnique: jest.fn().mockResolvedValue(location),
      },
      locationEvent: {
        deleteMany: jest.fn(async () => {
          mockRows.splice(0, mockRows.length);
          return { count: 1 };
        }),
        createMany: jest.fn(async ({ data }) => {
          insertBatch += 1;
          if (insertBatch === 2) throw new Error("insert failed");
          mockRows.push(...data);
          return { count: data.length };
        }),
      },
    };
    mockPrisma.$transaction = jest.fn(async (work) => {
      const transactionRows = mockRows.map((row) => ({ ...row }));
      const tx = {
        ...database,
        $queryRaw: jest.fn().mockResolvedValue([]),
      };
      try {
        return await work(tx);
      } catch (error) {
        mockRows.splice(0, mockRows.length, ...transactionRows);
        throw error;
      }
    });
    Object.assign(mockPrisma, database);

    const { EventCacheService } = require("../src/services/EventCacheService");
    const events = Array.from({ length: 101 }, (_, index) => ({
      ...makeEvent("sunrise"),
      time: new Date(Date.UTC(2026, 0, index + 1, 6)),
    }));
    const service = new EventCacheService({
      calculateLocationYearlyEvents: jest.fn().mockResolvedValue(events),
    });

    await expect(service.generateLocationCache(location.id, 2026)).rejects.toThrow(
      "insert failed",
    );
    expect(mockRows).toEqual([original]);
  });
  it("keeps the old yearly cache when a location calculation fails", async () => {
    const original = {
      id: 1,
      locationId: location.id,
      eventDate: new Date("2026-01-01T09:00:00.000Z"),
      eventTime: new Date("2026-01-01T06:00:00.000Z"),
      azimuth: 80,
      altitude: 5,
      qualityScore: 0.6,
      moonPhase: null,
      moonIllumination: null,
      calculationYear: 2026,
      eventType: "diamond_sunrise",
      accuracy: "good",
    };
    mockRows.push(original);
    const database = {
      location: {
        findMany: jest.fn().mockResolvedValue([location]),
      },
      locationEvent: {
        deleteMany: jest.fn(async () => {
          mockRows.splice(0, mockRows.length);
          return { count: 1 };
        }),
        createMany: jest.fn(async ({ data }) => {
          mockRows.push(...data);
          return { count: data.length };
        }),
      },
    };
    mockPrisma.$transaction = jest.fn(async (work) =>
      work({
        ...database,
        $queryRaw: jest.fn().mockResolvedValue([]),
      }),
    );
    Object.assign(mockPrisma, database);

    const { SkytreeAstronomicalCalculatorImpl } = require(
      "../src/services/SkytreeAstronomicalCalculator",
    );
    const calculator = new SkytreeAstronomicalCalculatorImpl({});
    const calculationError = new Error("astronomical calculation failed");
    jest
      .spyOn(calculator.skytreeAlignmentCalc, "findDiamondSkytree")
      .mockRejectedValue(calculationError);
    jest
      .spyOn(calculator.skytreeAlignmentCalc, "findPearlSkytree")
      .mockResolvedValue([]);

    expect(
      await calculator.calculateDiamondSkytree(new Date(2026, 0, 1), [location]),
    ).toEqual([]);
    const { EventCacheService } = require("../src/services/EventCacheService");
    const result = await new EventCacheService(calculator).generateYearlyCache(2026);
    expect(result.error).toBe(calculationError);

    expect(result.success).toBe(false);
    expect(mockRows).toEqual([original]);
  });
  it("reports failed month and day rebuilds at batch level", async () => {
    mockPrisma.location = {
      findMany: jest.fn().mockResolvedValue([location]),
    };
    const eventCacheService = {
      generateLocationMonthCache: jest.fn().mockResolvedValue({
        success: false,
        totalEvents: 0,
        timeMs: 1,
      }),
      generateLocationDayCache: jest.fn().mockResolvedValue({
        success: false,
        totalEvents: 0,
        timeMs: 1,
      }),
    };
    const { BatchCalculationService } = require(
      "../src/services/BatchCalculationService",
    );
    const service = new BatchCalculationService({}, eventCacheService);

    const monthly = await service.calculateMonthlyEvents(2026, 5, [location.id]);
    const daily = await service.calculateDayEvents(2026, 5, 10, [location.id]);

    expect(monthly.success).toBe(false);
    expect(monthly.locationResults).toEqual([
      {
        locationId: location.id,
        locationName: location.name,
        events: 0,
        success: false,
      },
    ]);
    expect(monthly.error).toBe("One or more locations failed");
    expect(daily).toMatchObject({
      success: false,
      processedLocations: 1,
      error: "One or more locations failed",
    });
  });
});
