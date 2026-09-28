import AuthShell from "@/components/AuthShell";
import SignupForm from "./SignupForm";

export const metadata = { title: "Create your company · Blackbird Leave" };

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
