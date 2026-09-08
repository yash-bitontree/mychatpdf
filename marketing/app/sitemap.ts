import type { MetadataRoute } from "next";
import { getBlogPosts, SITE_URL } from "@/lib/cms";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPaths = [
    "",
    "/services",
    "/about",
    "/blog",
    "/contact",
    "/faq",
    "/privacy",
    "/terms",
    "/refund-policy",
  ];
  const posts = await getBlogPosts();
  return [
    ...staticPaths.map((path) => ({ url: `${SITE_URL}${path}` })),
    ...posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.publishDate,
    })),
  ];
}
