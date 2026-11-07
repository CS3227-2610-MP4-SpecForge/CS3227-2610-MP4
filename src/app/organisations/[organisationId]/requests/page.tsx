import { RequestList } from "@/components/request-list";
export default async function Page({ params }: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await params;
  return <RequestList organisationId={organisationId} />;
}
