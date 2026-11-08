# Ticket description preview

The ticket author can choose **Write** or **Preview** above Description. Write
opens by default and uses the existing Markdown textarea. Preview renders the
current local description, including unsaved edits, with the same Markdown
renderer members see on published tickets. An empty preview shows a short hint.

Switching views preserves the source text and existing save behavior. Authors
can publish or update from Preview and still get required-description feedback.
The tabs support keyboard navigation. The reader view, Markdown syntax, and
server interfaces stay as they are.

Use the approved ticket-layout browser journey through the author editor and
Developer reader. Verify the default tab, keyboard switching, unsaved Markdown
rendering, source preservation, and publication from Preview.

## Bold formatting follow-up

Render `**bold text**` as strong emphasis in prose, headings and list items
through the shared renderer. Keep fenced code and unpaired or escaped markers
literal. Raw HTML stays escaped even inside bold text, and rendering loads no
resources. The existing author/reader browser journey checks semantic bold,
source preservation, literal fenced code and safe rendering of HTML-like text.

## Italic formatting follow-up

Render `*italic text*` and `_italic text_` as emphasis in prose, headings and
lists. Preserve bold, literal underscores within identifiers, escaped and
unpaired markers, and fenced code. Use the existing author/reader browser
journey to verify both forms, source preservation and inert HTML-like text.
