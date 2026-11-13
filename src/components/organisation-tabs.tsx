import { requestsHref } from "@/overview";

/** The Overview | Requests switch under an organisation's name. Plain links, so each tab has its own URL. */
export function OrganisationTabs({
  organisationId,
  current,
}: {
  organisationId: string;
  current: "overview" | "requests";
}) {
  const tabs = [
    { key: "overview", label: "Overview", href: `/organisations/${organisationId}/overview` },
    { key: "requests", label: "Requests", href: requestsHref(organisationId) },
  ] as const;
  return (
    <nav className="organisation-tabs" aria-label="Organisation sections">
      {tabs.map(tab => (
        <a key={tab.key} href={tab.href} aria-current={tab.key === current ? "page" : undefined}>
          {tab.label}
        </a>
      ))}
    </nav>
  );
}
