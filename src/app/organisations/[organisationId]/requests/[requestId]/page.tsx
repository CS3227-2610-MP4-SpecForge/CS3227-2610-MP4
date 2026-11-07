import { RequestScreen } from "@/components/request-editor";
export default async function Page({ params }: { params: Promise<{ organisationId: string; requestId: string }> }) {
  const { organisationId, requestId } = await params;
  return <RequestScreen organisationId={organisationId} requestId={requestId} />;
}
