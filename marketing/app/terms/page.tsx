import LegalPageBody, { legalMetadata } from "@/components/legal-page";

export const generateMetadata = () => legalMetadata("terms");

export default function TermsPage() {
  return <LegalPageBody slug="terms" />;
}
