import CompanyWizard from "./CompanyWizard";

export const metadata = { title: "Create your company · Whooo" };

/** The wizard brings its own frame: its last step needs a wider page. */
export default function SignupPage() {
  return <CompanyWizard />;
}
