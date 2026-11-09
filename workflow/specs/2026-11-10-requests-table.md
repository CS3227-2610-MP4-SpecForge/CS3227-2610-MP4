# Requests page table and filters

Scope follows the user's 2026-11-10 Requests page instructions.

- Label the PM creation button New task and align it with the Requests title
  below the organisation name.
- Remove the visibility paragraph and the Overdue only checkbox. Keep the
  full-width filter card compact, with a title search field across the card and
  a search icon on the right that applies the filters.
- Use the shared dropdown for status, priority, assignee and sort. Size each to
  its longest option within the available width and wrap the controls on narrow
  screens. Keep Apply filters, member lookup, keyboard typeahead and list
  pagination.
- Show a table with Title, Owner, Assignees, Status and Priority in that order.
  Title links open the ticket. Use the current author username as Owner, the
  existing assignee labels and the shared status and priority pills. Keep private
  drafts distinguishable and confine narrow-screen scrolling to the table.
- Remove Refresh requests. Browser reload fetches fresh data and returns to the
  default view. Apply filters can repeat the current filtered query. Existing
  ticket access, mutations, filter endpoint and permissions stay in place.

Verify at the existing approved browser request-list seam from
`2026-11-08-ticket-pill-dropdowns.md`. Extend the current PM and Developer
journeys to check the table, shared dropdown interaction, filtering, reload and
narrow-screen layout. This tests the UI over the existing authenticated API.
