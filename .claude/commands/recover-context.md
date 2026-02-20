Recover full context after a session restart or context loss.

Do the following:
1. Read CLAUDE.md (project root) for stable project truth
2. Read MEMORY.md for last known session state
3. Run `git status` and `git log --oneline -15` to see what actually happened
4. If MEMORY.md seems stale or incomplete:
   a. Find JSONL transcript files: `ls -lt ~/.claude/projects/-Users-kumardivyarajat-WebstormProjects-Notiflo/*.jsonl`
   b. Read the most recent transcript to extract user messages and key decisions
   c. Update MEMORY.md with recovered context
5. Check for active plan files in `~/.claude/plans/`
6. Present a summary of: where we are, what's done, what's next
7. Do NOT ask the user to re-explain anything — recover it from the files
