import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRootRedirectPath } from "@/lib/route-decisions";

export default async function HomePage() {
  const session = await auth();

  redirect(getRootRedirectPath(Boolean(session?.user)));
}
