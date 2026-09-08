import LegalPageBody, { legalMetadata } from "@/components/legal-page";

export const generateMetadata = () => legalMetadata("refund-policy");

export default function RefundPolicyPage() {
  return <LegalPageBody slug="refund-policy" />;
}
