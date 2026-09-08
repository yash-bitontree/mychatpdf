// Maps blog posts to their local WebP cover images (public/images).
// Known slugs get a topical match; anything new falls back deterministically.

const COVERS = [
  "/images/blog-research.webp",
  "/images/blog-contract.webp",
  "/images/blog-study.webp",
  "/images/blog-analysis.webp",
  "/images/blog-reading.webp",
];

const SLUG_COVERS: Record<string, string> = {
  "how-to-get-accurate-answers-from-your-pdfs": "/images/blog-contract.webp",
  "multi-document-conversations-are-here": "/images/blog-research.webp",
  "chat-with-pdf-free-guide": "/images/blog-reading.webp",
  "ai-pdf-summarizer-vs-document-chat": "/images/blog-analysis.webp",
  "how-to-analyze-multiple-pdfs-with-ai": "/images/blog-research.webp",
  "ai-document-chat-for-students-study-guide": "/images/blog-study.webp",
};

export function blogCover(slug: string): string {
  const mapped = SLUG_COVERS[slug];
  if (mapped) return mapped;
  let hash = 0;
  for (const ch of slug) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return COVERS[hash % COVERS.length];
}
