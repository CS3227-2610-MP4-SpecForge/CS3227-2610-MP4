# Sort requests by status

- Add **Status** to the Requests sort dropdown. Apply filters uses it across
  all visible tickets before pagination.
- Order groups as Private draft, To do, In progress, In review, Cancelled,
  then Done. Within each group, show the most recently updated first, with the
  ticket ID as a stable tie-breaker.
- Keep the existing default and due-date sorts, filter combinations and
  visibility checks. Add the fixed sort value to the existing authenticated list
  endpoint and database RPC through an additive migration.

Use the existing browser and authenticated HTTP/database test seams. Verify
selection from the sort dropdown, group order across pages and draft visibility
for an organisation member. Check that invalid sort values are still rejected.
