export default {
  transform: {}, // Nonaktifkan transformasi karena kita pakai Native ESM
  testEnvironment: "node",
  verbose: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  testMatch: ["**/tests/**/*.test.js"],
};
