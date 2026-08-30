<!--
  Claude overlay for the hourly sync skill.
  Sections: optional `kind` / `model` meta, then preamble (before Discovery),
  then discovery (from ## Discovery onward).
-->
<!-- kind: claude|other -->
<!-- model: claude-opus-4-8 -->

Scheduled tasks can run hourly and use configured tools, but the prompt must treat inaccessible chats as unavailable—not pretend it captured every account conversation.

## Discovery/enumeration mechanism

There is no native API tool in this environment that lists claude.ai Projects or their member threads. `session_info` tools only see local Cowork automation sessions, not claude.ai's Projects feature. Use the Claude in Chrome MCP tools instead:

1. Load Chrome tools if deferred (ToolSearch: `tabs_context_mcp`, `navigate`, `get_page_text`, `find`, `tabs_create_mcp`).
2. Navigate to `https://claude.ai/projects` and call `get_page_text` to read the project list (name, description/summary, last-updated).
3. For each project card, use `find` to get its link element and extract the project id from the href (`/project/<uuid>`). This id is the stable `projectId` for `known_projects` / `make_projects_available`.
4. For step 3 of the run order (sync), for each project returned by `tracked_projects`, navigate to `https://claude.ai/project/<projectId>` and read its member chat list the same way, then open each chat to read the transcript content in the sync window.

### Graceful degradation

Browser discovery requires an active, logged-in Chrome tab with the extension connected on the user's machine at the moment the task runs. If `tabs_context_mcp` / `navigate` fail or return no usable tab:

- Do not fail the whole run or invent project/thread data.
- Set `captureCoverage.enumerationAvailable: false` (or `transcriptsAvailable: false` if discovery worked but a specific tracked project's page couldn't be read) and set `captureCoverage.limitation` to a short description (e.g. "Claude in Chrome unavailable — no connected browser tab at run time").
- Still call `sync_threads` with whatever threads *were* successfully read (or an empty array if none), so the checkpoint still advances and the run is recorded as attempted rather than silently skipped.
- Never treat a missing browser session as "nothing to sync" without noting the limitation — that would misrepresent an unavailable capability as a clean zero-result run.
- Explain to the user what needs to be done (extension install and logged in) for it to work properly.
