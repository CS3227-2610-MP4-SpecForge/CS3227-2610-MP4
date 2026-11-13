import { RequestList } from "@/components/request-list";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ organisationId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { organisationId } = await params;
  return <RequestList organisationId={organisationId} initialSearch={await searchParams} />;
}
