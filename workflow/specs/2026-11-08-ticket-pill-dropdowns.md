# Ticket priority and status pill dropdowns

Status: approved by the user on 2026-11-08.

## Findings and scope

The shared UI library (`src/components/ui.tsx`) has no reusable dropdown.
Native selects share CSS in globals.css; the email assignee combobox is a
specialized multi-selection search interface. Add a reusable fixed-choice
dropdown and pill presentation to the shared component library, documenting
its use in workflow/ui.md. Use it for ticket priority and delivery status.
Keep the email picker specialized; unrelated account and filter controls need
not be redesigned. Priority filters must offer only the three valid priorities.

## Behavior

- Priority has exactly Low, Medium, High. Their pills use yellow, orange, red,
  respectively, with readable text and centrally defined theme tokens.
- Delivery status retains its five values: To do (gray), In progress (blue),
  In review (purple), Done (green), Cancelled (gray).
- Editable ticket fields show the selected value as a pill dropdown trigger;
  opening shows the fixed choices with the same pill colors. Read-only fields
  and ticket-list badges use the same pill presentation and labels.
- The shared dropdown accepts a labelled value/options/change interface,
  optional option tones, and disabled state. It owns focus, open/close state,
  keyboard navigation, outside-click dismissal and bounded scrollable options.
  Support Enter/Space opening, arrow navigation, Enter selection, Escape
  dismissal with focus returned, and normal Tab navigation. It must not submit
  enclosing forms or mutate values on dismissal. Text labels convey meaning
  independently of color. Preserve visible focus and mobile layout.
- Existing author/assignee editing permissions, draft autosave, published Update
  behavior and disabled draft status remain unchanged.

## Data compatibility

Use an additive local migration to map existing urgent priorities to high and
restrict new saved priorities/filter inputs to low/medium/high in SQL and HTTP.
Increment delivery revision for affected tickets so stale edits conflict;
preserve content revisions and historical activity. Do not rewrite earlier
migrations. No hosted changes or new dependencies.

## Test interfaces

Approved test seams:

- Browser ticket/editor/list: shared dropdown selection, keyboard/focus,
  dismissal, disabled/read-only presentation, priority/status pill consistency,
  autosave/Update persistence and mobile layout. This checks public behavior
  rather than dropdown internals.
- Local database RPC and authenticated HTTP: accept three priorities, reject
  urgent, preserve existing save permissions and filtering. Exercise the additive
  migration using disposable legacy urgent data to verify normalization and
  revision handling; no hosted data.

Implement with the local TDD and codebase-design skills, run relevant project
checks and one independent code/architecture review at completion. This changes
presentation and priority validation, not authorization or identity exposure.
