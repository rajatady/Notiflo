/* eslint-disable */

module.exports = async function () {
  console.log('\nE2E Teardown: global-teardown invoked.');
  console.log('App and MongoMemoryServer are cleaned up via afterAll hooks in each test worker.\n');
};
