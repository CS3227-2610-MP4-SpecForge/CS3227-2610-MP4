import { handleRequest } from "@/server/runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export { handleRequest as GET, handleRequest as POST, handleRequest as PUT, handleRequest as PATCH, handleRequest as DELETE };
