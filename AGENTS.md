# AGENTS.md

Edit, add, or delete files freely. Goal: every file stays readable on its
own, so future edits never require loading the whole codebase.

## Boundaries

- Keep logic that has no UI/framework dependency (parsing, building
  commands, pure calculations) free of UI imports and app state.
- A module should expose a small, stable interface and talk to others
  only through that interface — not by reaching into their internals.
- Only one module (the orchestrator/entry layer) should know about and
  wire together multiple other modules. Everything else stays local.

## Code

- One file, one job. One function, one job. Split if you can't describe
  it in a sentence.
- Keep each file's public interface small and stable; let internals
  change freely behind it.
- Avoid new shared/global state. Pass values as arguments instead.
- Prefer a new file over growing an existing one past one responsibility.

## Docs

After any change, update `ARCHITECTURE.md` so it still matches the code —
edit the relevant section in place, no changelog. If unsure whether a
change counts, update it anyway: a stale doc is worse than a small
unnecessary edit.

## Other

No need to package the extension or install it.
