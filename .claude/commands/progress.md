Show current project progress and update MEMORY.md.

Do the following:
1. Read MEMORY.md to understand last known state
2. Run `git status` and `git log --oneline -10`
3. Check if there's an active plan file in `~/.claude/plans/`
4. Summarize:
   - Current branch and uncommitted changes
   - What's been built (from git log + MEMORY.md)
   - What's pending / in progress
   - Any active plan and its status
5. Update MEMORY.md with the current state
6. Present the summary to the user
