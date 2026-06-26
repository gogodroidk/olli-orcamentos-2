# Archive

This folder keeps historical files that are useful as evidence or context, but should not live in the project root or active tool-output folders.

Nothing here was deleted from the project. Files were moved here to make the working tree easier to scan.

## Folders

- `screenshots`: standalone visual references that were previously loose in the root.
- `supabase`: Supabase CLI state or notes that should not live under `supabase/.temp`.
- `tool-runs`: captured output from local tools such as Codex and Playwright MCP.

## Rule of thumb

If a file is needed by the app at runtime, it should not be here. If a file proves what was tested, inspected, or generated during a run, this is the right place.
