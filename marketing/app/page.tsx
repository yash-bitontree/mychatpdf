import type { Metadata } from "next";
import Sections from "@/components/sections";
import { getPage, SITE_URL } from "@/lib/cms";
import { DEFAULT_OG_IMAGE, DEFAULT_SEO_DESCRIPTION, DEFAULT_SEO_TITLE } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("home");
  return {
    title: { absolute: DEFAULT_SEO_TITLE },
    description: DEFAULT_SEO_DESCRIPTION,
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      title: DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      url: SITE_URL,
      siteName: page?.title ?? "MyPDFChat",
      type: "website",
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: DEFAULT_SEO_TITLE,
      description: DEFAULT_SEO_DESCRIPTION,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

export default async function HomePage() {
  const page = await getPage("home");
  return <Sections sections={page?.sections ?? []} />;
}
