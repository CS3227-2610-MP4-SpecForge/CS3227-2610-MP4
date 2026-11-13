import { OrganisationOverviewPage } from "@/components/organisation-overview";
export default async function Page({ params }: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await params;
  return <OrganisationOverviewPage organisationId={organisationId} />;
}
