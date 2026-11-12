import { AccountForm } from "@/components/account-form";
import { DemoKit } from "@/components/demo-kit";
export default function Page() {
  return <AccountForm mode="signin" footer={<DemoKit />} />;
}
