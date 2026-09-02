import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/options";
import { landingFor } from "@/config/navigation";

/**
 * Everyone used to land on the Executive dashboard, including the engineers who
 * open this app to work a queue. Send each role where its day actually starts.
 */
export default async function DashboardPage() {
  const session = await auth();
  redirect(landingFor(session?.user?.role));
}
