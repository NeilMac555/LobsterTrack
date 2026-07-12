# Project Instructions

## TODO.md

`TODO.md` in the repo root is a lightweight kanban (`## Now` / `## Next`
/ `## Later` / `## Done`). Read it at the start of every session.
Update it before finishing — move cards as they progress, add new ones
surfaced during the session, and append to `## Done` (one line, commit
hash, newest first) for anything actually shipped.

## Session Reports

Generate reports ONLY from the actual git diff / commit range of the current
session (run `git diff` or `git log` first). Never reconstruct from the task
description or memory. If no code was changed, say so explicitly in the
first line. When describing pre-change behaviour, read the pre-change code
(`git show <commit>^:<file>`) first.
