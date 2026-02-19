/* eslint-disable */

module.exports = async function () {
  console.log('\nE2E Setup: global-setup invoked.');
  console.log(
    'The NestJS app + MongoMemoryServer are bootstrapped lazily via app-factory.ts in each test worker.\n',
  );
};
