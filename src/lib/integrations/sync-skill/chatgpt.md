<!--
  ChatGPT overlay for the hourly sync skill.
  Sections: optional `kind` / `model` meta, then preamble (before Discovery),
  then discovery (from ## Discovery onward).
-->
<!-- kind: chatgpt|codex|other -->
<!-- model: gpt-5 -->

Scheduled tasks can run hourly and use configured tools, but the prompt must treat inaccessible chats as unavailable—not pretend it captured every account conversation. [Scheduled tasks](https://learn.chatgpt.com/docs/automations.md), [MCP](https://learn.chatgpt.com/docs/extend/mcp.md)

## Discovery/enumeration mechanism

Use the tools available in this ChatGPT scheduled-task environment to list Projects and their member chats/tasks:

1. Enumerate every Project the account can see (name, stable project id, created time if known). Prefer native project-listing / task-listing tools when present.
2. Treat each Project’s stable id as `projectId` for `known_projects` / `make_projects_available`.
3. For step 3 of the run order (sync), for each project returned by `tracked_projects`, list member chats/tasks updated in the time window and read their user-visible transcripts.

### Graceful degradation

If project-listing, task-listing, or transcript-reading tools are unavailable in this run:

- Do not fail the whole run or invent project/thread data.
- Set `captureCoverage.enumerationAvailable: false` (or `transcriptsAvailable: false` if listing worked but transcripts could not be read) and set `captureCoverage.limitation` to a short description.
- Still call `sync_threads` with whatever threads *were* successfully read (or an empty array if none), so the checkpoint still advances and the run is recorded as attempted rather than silently skipped.
- Never treat missing tools as "nothing to sync" without noting the limitation — that would misrepresent an unavailable capability as a clean zero-result run.
