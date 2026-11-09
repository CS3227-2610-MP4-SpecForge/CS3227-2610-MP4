# Edit delivery fields in the Requests table

- Use the shared pill dropdowns in the Status and Priority cells. Choosing a
  different option saves immediately. Keep the controls usable in the horizontally
  scrolling table. Each control has an accessible label that identifies its task.
- Match the ticket editor's permissions. The owner can change priority on drafts
  and published tasks. The owner and current assignees can change the status of a
  published task. Show read-only pills for other cells, including private draft status.
- Send only the selected field and the current delivery revision through the
  existing delivery endpoint. Its session, origin, membership, field permissions
  and revision checks remain authoritative.
- Serialize table saves and refresh the applied query from its first page after
  an attempt. The saved value confirms success. Show errors on failure. On
  conflict or ambiguous failure, read the saved state before another write and
  avoid automatically retrying a write.
  If the read fails, require a successful list reload before editing again.

Use the existing browser and authenticated HTTP test seams. Exercise owner and
assignee changes, a read-only member, draft priority and status presentation,
filtered results, stale revisions and response loss. Use the existing database
integration checks for rejected permissions, invalid fields and isolation.
