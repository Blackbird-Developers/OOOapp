import { AuthNotice } from "@/components/AuthShell";
import { loadPendingSignup } from "@/lib/registration";
import CompleteSignupForm from "./form";

export const dynamic = "force-dynamic";

/** The emailed link: choose a password and the account (and company) is made. */
export default async function CompleteSignupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const pending = /^[a-f0-9]{48}$/.test(token) ? await loadPendingSignup(token) : null;

  if (!pending) {
    return (
      <AuthNotice title="Link no longer valid">
        This link has expired or has already been used. Sign in, or start again to get a new one.
      </AuthNotice>
    );
  }

  return <CompleteSignupForm token={token} pending={pending} />;
}
