/* eslint-disable */

/**
 * Jest setupFiles — runs in the same process as the tests,
 * before each test suite is executed.
 */
module.exports = async function () {
  // Increase default timeout for E2E tests (app boot can take a while)
  jest.setTimeout(30000);
};
