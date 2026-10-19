---
'@nickkupriyanov/inboxline-core': minor
---

Add controller filtering and cursor paging.

- **`actions.setFilter(filter)`** now switches the list filter. A different
  filter abandons the rows, the cursor and the in-flight list/page requests of
  the previous one and loads the first page of the new filter when the controller
  is started. The global unread counter and its in-flight request are untouched.
  A filter chosen before `start()` is used by the initial load.
- **`actions.loadMore()`** appends the next page of the current filter and
  context. It does nothing without a cursor, before the first page is ready or
  while another page is loading, so two rapid calls produce one request. A failed
  page keeps the shown rows and the cursor, so the next call retries that same
  page.
- **Safe paging**: overlapping pages are folded into the first occurrence of an
  id, an empty page is a valid answer, and a cursor that was already requested in
  the current chain ends the list instead of looping. The chain starts over with
  every first page.
- **First pages win**: `start`, `refresh`, `setFilter`, a context change and an
  adapter replacement abort an in-flight page load; a late page answer cannot
  append rows to the new chain.
- **`actions.retry()`** also repeats a failed next page at the same cursor, but
  not at the same time as a failed first page, whose retry replaces the chain.

No migration is needed: the public exports are unchanged and the added behaviour
matches the already published action vocabulary.
