import LegalPageBody, { legalMetadata } from "@/components/legal-page";

export const generateMetadata = () => legalMetadata("privacy");

export default function PrivacyPage() {
  return <LegalPageBody slug="privacy" />;
}
