module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.cjs"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
