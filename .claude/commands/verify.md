Run the full test suite across all projects and report results.

Do the following:
1. Run all three test suites in parallel:
   - `npx nx test notiflo`
   - `npx nx test napi-bridge`
   - `npx nx test pipeline-pipeline`
2. Report results in this format:
   - notiflo: X passing, Y failing
   - napi-bridge: X passing, Y failing
   - pipeline: X passing, Y failing
3. If there are NEW failures (not pre-existing), flag them prominently
4. If all tests pass (excluding known pre-existing failures), confirm the system is healthy
