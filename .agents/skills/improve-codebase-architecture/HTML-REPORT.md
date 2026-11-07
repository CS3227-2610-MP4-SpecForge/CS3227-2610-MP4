# Offline architecture report

Write a self-contained static HTML report to a fresh OS temporary file. Open it
only after inspecting the generated source for active content or external assets.

- Use trusted fixed HTML structure, inline CSS and optional hand-authored SVG.
- Escape every repository-derived name, path, snippet and diagram label as text
  (`html.escape(value, quote=True)` or equivalent). Do not interpret those values
  as HTML, SVG markup, URLs, attributes, event handlers or style declarations.
- No JavaScript, Mermaid runtime, external fonts/CDNs, remote images, forms,
  embedded frames or network resources. Use fixed plain-text paths instead of
  clickable repository-derived URLs. No secrets or private snippets in the report.
- Put a UTF-8 charset and a restrictive CSP in the head:
  `default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'`.
- Show candidates with files, concrete friction, proposed improvement, benefits,
  before/after visuals and recommendation strength. Use the domain vocabulary.
- Finish with one top recommendation. The report proposes work; it does not
  implement refactors or claim tests passed.

Before opening, use a dummy label such as `<img src=x onerror=alert(1)>` and check
the source displays it escaped rather than creating an element. This is a focused
sanity check, not a proof against every possible rendering vulnerability.
