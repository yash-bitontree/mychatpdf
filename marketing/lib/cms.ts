// All Contentful access for the marketing site goes through this module.
// Fetches use the Delivery API with Next's fetch cache tagged CMS_TAG, so
// POST /api/revalidate makes content edits live without a redeploy.
// When CMS env vars are missing (or the space has no content yet), every
// fetcher returns typed fallback content so the site builds and renders.

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN;
const ENVIRONMENT = process.env.CONTENTFUL_ENVIRONMENT || "master";

export const CMS_TAG = "cms";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.mychatpdf.example";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://mypdfchat.com").replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NavLink = { label: string; href: string };
export type FooterColumn = { title: string; links: NavLink[] };

export type SiteSettings = {
  siteName: string;
  tagline?: string;
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  navItems: NavLink[];
  footerColumns: FooterColumn[];
  footerText?: string;
  defaultSeoTitle?: string;
  defaultSeoDescription?: string;
};

export type SectionItem = {
  title?: string;
  description?: string;
  quote?: string;
  author?: string;
  role?: string;
  /** Icon key for feature cards; see components/icons.tsx SECTION_ICONS. */
  iconKey?: string;
  /** Stat value like "10s" or "99.9%". */
  value?: string;
  /** Short stat label shown under the value. */
  label?: string;
};

export type LandingSection = {
  variant: "hero" | "features" | "steps" | "stats" | "testimonial" | "logos" | "usecases" | "faq" | "cta";
  heading?: string;
  subheading?: string;
  body?: string;
  /** Small eyebrow/badge line above the hero heading. */
  badge?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  secondaryCtaLabel?: string;
  secondaryCtaUrl?: string;
  items?: SectionItem[];
  order?: number;
};

export type Page = {
  title: string;
  slug: string;
  body?: string;
  sections: LandingSection[];
  seoTitle?: string;
  seoDescription?: string;
};

export type Service = {
  title: string;
  slug: string;
  summary?: string;
  body?: string;
  order?: number;
  seoTitle?: string;
  seoDescription?: string;
};

export type BlogPost = {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  author?: string;
  publishDate?: string;
  seoTitle?: string;
  seoDescription?: string;
};

export type FaqItem = { question: string; answer: string; order?: number };

export type LegalPage = {
  title: string;
  slug: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
};

// ---------------------------------------------------------------------------
// Delivery API client
// ---------------------------------------------------------------------------

type CdaEntry = { sys: { id: string; contentType?: { sys: { id: string } } }; fields: Record<string, unknown> };
type CdaResponse = { items: CdaEntry[]; includes?: { Entry?: CdaEntry[] } };

async function cdaFetch(params: Record<string, string>): Promise<CdaResponse | null> {
  if (!SPACE || !TOKEN) return null;
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(
      `https://cdn.contentful.com/spaces/${SPACE}/environments/${ENVIRONMENT}/entries?${qs}`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        cache: "force-cache",
        next: { tags: [CMS_TAG] },
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as CdaResponse;
  } catch {
    return null;
  }
}

// Resolves a linked-entry field ({ sys: { id } } links) against includes.
function resolveLinks(entry: CdaEntry, field: string, response: CdaResponse): CdaEntry[] {
  const links = entry.fields[field];
  if (!Array.isArray(links)) return [];
  const included = new Map(
    [...response.items, ...(response.includes?.Entry ?? [])].map((e) => [e.sys.id, e])
  );
  return links
    .map((l: { sys?: { id?: string } }) => (l?.sys?.id ? included.get(l.sys.id) : undefined))
    .filter((e): e is CdaEntry => Boolean(e));
}

// Contentful previously used the old product-name order in several entries.
// Normalize delivered display copy so stale CMS content cannot reintroduce it.
function normalizeBrand<T>(value: T): T {
  if (typeof value === "string") {
    return value
      .replace(/\bMyChatPDF\b/g, "MyPDFChat")
      .replace(/\bMy Chat PDF\b/g, "MyPDFChat")
      .replace(/\bMy PDF Chat\b/g, "MyPDFChat")
      .replace(/\bMyPdfChat\b/g, "MyPDFChat")
      .replace(/\bMyPDFchat\b/g, "MyPDFChat") as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBrand(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeBrand(item)])
    ) as T;
  }
  return value;
}

const f = <T>(entry: CdaEntry) => normalizeBrand(entry.fields) as T;

// ---------------------------------------------------------------------------
// Fallback content (used without CMS creds or before the space is seeded)
// ---------------------------------------------------------------------------

const FALLBACK_SETTINGS: SiteSettings = {
  siteName: "MyPDFChat",
  tagline: "Chat with your documents, with citations",
  companyName: "MyPDFChat Inc.",
  contactEmail: "contact@mypdfchat.com",
  navItems: [
    { label: "Services", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/faq" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footerColumns: [
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
        { label: "Refund Policy", href: "/refund-policy" },
      ],
    },
  ],
  footerText: "MyPDFChat Inc. All rights reserved.",
  defaultSeoTitle: "MyPDFChat: Chat with PDFs and documents",
  defaultSeoDescription:
    "Upload PDFs and documents, ask questions in plain language, and get answers with citations.",
};

const FALLBACK_PAGES: Record<string, Page> = {
  home: {
    title: "MyPDFChat",
    slug: "home",
    sections: [
      {
        variant: "hero",
        badge: "Every answer backed by a citation",
        heading: "Chat with your documents. Get answers you can verify.",
        subheading:
          "Upload PDFs, Word files, and more, then ask questions in plain language. MyPDFChat answers from your documents and cites the exact page every time.",
        ctaLabel: "Get started free",
        ctaUrl: "app:signup",
        secondaryCtaLabel: "See how it works",
        secondaryCtaUrl: "#how-it-works",
        order: 1,
      },
      {
        variant: "logos",
        heading: "Built for the documents you actually work with",
        items: [
          { title: "Contracts" },
          { title: "Research papers" },
          { title: "Financial reports" },
          { title: "Legal briefs" },
          { title: "Technical manuals" },
          { title: "Textbooks" },
          { title: "Board minutes" },
          { title: "Policy documents" },
        ],
        order: 2,
      },
      {
        variant: "features",
        heading: "Ask anything. Verify everything.",
        subheading: "Six capabilities that turn a pile of documents into answers you can defend.",
        items: [
          {
            iconKey: "chat",
            title: "Chat with any document",
            description: "Ask questions the way you would ask a colleague and get direct answers pulled from the text.",
          },
          {
            iconKey: "documents",
            title: "Multi-document conversations",
            description: "Bring several files into one chat. Compare drafts, cross-reference reports, study a whole reading list.",
          },
          {
            iconKey: "citation",
            title: "Citations on every answer",
            description: "Each answer links back to the source passage and page number, so you can verify instead of trusting.",
          },
          {
            iconKey: "shield",
            title: "Private by default",
            description: "Your documents stay in your workspace and are never used to train models. Delete a file and it is gone.",
          },
          {
            iconKey: "bolt",
            title: "Answers in seconds",
            description: "Upload a document and start asking right away. Even long reports are ready to chat in moments.",
          },
          {
            iconKey: "folder",
            title: "Organized in folders",
            description: "Keep projects tidy with folders and scoped conversations, so the right documents are always at hand.",
          },
        ],
        order: 3,
      },
      {
        variant: "steps",
        heading: "How it works",
        subheading: "From upload to verified answer in three steps.",
        items: [
          { title: "Upload your documents", description: "Drag in PDFs, Word files, and more. Your files are processed securely in seconds." },
          { title: "Ask in plain language", description: "No special syntax. Ask questions the way you would ask a colleague who read the whole thing." },
          { title: "Verify with citations", description: "Every answer links to the exact passage and page it came from. Click through and check." },
        ],
        order: 4,
      },
      {
        variant: "usecases",
        heading: "Made for the way you work",
        subheading: "Whatever the documents, the loop is the same: ask, verify, move on.",
        items: [
          {
            iconKey: "citation",
            title: "For researchers",
            description: "Load a set of papers into one conversation and ask where they agree, where they conflict, and which methods differ.",
          },
          {
            iconKey: "chat",
            title: "For students",
            description: "Turn readings and slides into a study partner. Ask for explanations, quiz yourself, and check every answer against the page.",
          },
          {
            iconKey: "shield",
            title: "For legal & compliance",
            description: "Find the clause that matters, compare drafts, and keep an audit trail of what was asked and where the answers came from.",
          },
          {
            iconKey: "documents",
            title: "For analysts & teams",
            description: "Trace trends across quarterly reports and board packs, with per-document citations keeping every claim accountable.",
          },
        ],
        order: 5,
      },
      {
        variant: "stats",
        items: [
          { value: "10s", label: "to your first answer", description: "Upload and start asking immediately." },
          { value: "100%", label: "of answers cited", description: "Every response points to its source." },
          { value: "3+", label: "documents per chat", description: "Cross-reference files in one conversation." },
          { value: "24/7", label: "always available", description: "Your documents answer whenever you ask." },
        ],
        order: 6,
      },
      {
        variant: "testimonial",
        heading: "Loved by people who read for a living",
        items: [
          {
            quote: "I stopped reading 80-page contracts line by line. I ask, I check the citation, I move on.",
            author: "Dana M.",
            role: "Contracts manager",
          },
          {
            quote: "The citations are the feature. My advisor asks where a claim came from and I have the page number.",
            author: "Priya S.",
            role: "PhD candidate",
          },
          {
            quote: "We load every board pack into one chat and trace decisions across a year of minutes in minutes.",
            author: "Tom R.",
            role: "Operations lead",
          },
          {
            quote: "Folders per client, chats saved with the files. New teammates catch up on a matter by reading the conversation.",
            author: "Elena K.",
            role: "Paralegal",
          },
          {
            quote: "I quiz myself from the textbook before every exam. Wrong answers link me straight to the section I skipped.",
            author: "Jordan W.",
            role: "Med student",
          },
          {
            quote: "It says 'the documents do not address this' instead of making something up. That honesty is why we trust it.",
            author: "Sam O.",
            role: "Compliance officer",
          },
        ],
        order: 7,
      },
      {
        variant: "faq",
        heading: "Questions, answered",
        subheading: "The short version of what people ask before they try it.",
        items: [
          {
            title: "What is MyPDFChat?",
            description: "An AI document chat platform: upload PDFs or other documents, ask questions in plain language, and get answers with citations pointing to the source passage and page.",
          },
          {
            title: "Is there a free plan?",
            description: "Yes. Upload documents and chat within monthly limits, no credit card required. Paid plans raise limits and file sizes.",
          },
          {
            title: "How do I know the answers are correct?",
            description: "Every answer cites the exact passage and page. Click a citation to see the source in context, and if the documents do not contain the answer, MyPDFChat says so.",
          },
          {
            title: "What happens to my documents?",
            description: "They stay in your workspace, are never used to train AI models, and are removed from our systems when you delete them.",
          },
        ],
        order: 8,
      },
      {
        variant: "cta",
        heading: "Your documents already have the answers.",
        subheading:
          "Upload a file, ask in plain language, and check the citation yourself — all in the next two minutes.",
        ctaLabel: "Try MyPDFChat free",
        ctaUrl: "app:signup",
        secondaryCtaLabel: "Talk to us",
        secondaryCtaUrl: "/contact",
        order: 9,
      },
    ],
  },
  about: {
    title: "About MyPDFChat",
    slug: "about",
    body: "MyPDFChat is an AI document chat platform. Upload PDFs and other documents, ask questions, and get cited answers.",
    sections: [],
  },
};

const FALLBACK_SERVICES: Service[] = [
  {
    title: "AI document chat",
    slug: "ai-document-chat",
    summary: "Upload a document and ask questions in plain language.",
    order: 1,
  },
  {
    title: "Multi-document conversations",
    slug: "multi-document-conversations",
    summary: "Chat across several documents at once.",
    order: 2,
  },
  {
    title: "Cited, verifiable answers",
    slug: "cited-answers",
    summary: "Every answer links back to the exact passage it came from.",
    order: 3,
  },
];

const FALLBACK_POSTS: BlogPost[] = [
  {
    title: "Welcome to the MyPDFChat blog",
    slug: "welcome",
    excerpt: "Product news and practical tips for working with documents.",
    body: "Content is on its way. Connect the CMS to manage blog posts.",
    author: "MyPDFChat Team",
    publishDate: "2026-01-01",
  },
];

const FALLBACK_FAQS: FaqItem[] = [
  {
    question: "What is MyPDFChat?",
    answer:
      "An AI document chat platform: upload PDFs and other documents, ask questions, and get answers with citations.",
    order: 1,
  },
  {
    question: "Is there a free plan?",
    answer: "Yes, you can chat with documents within monthly limits, no credit card required.",
    order: 2,
  },
];

const FALLBACK_LEGAL: Record<string, LegalPage> = {
  privacy: {
    title: "Privacy Policy",
    slug: "privacy",
    body: "Our privacy policy is being finalized. Contact us with any questions about how your data is handled.",
  },
  terms: {
    title: "Terms of Service",
    slug: "terms",
    body: "Our terms of service are being finalized. Contact us with any questions.",
  },
  "refund-policy": {
    title: "Refund Policy",
    slug: "refund-policy",
    body: "Our refund policy is being finalized. Contact us about any billing questions.",
  },
};

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

export async function getSiteSettings(): Promise<SiteSettings> {
  const res = await cdaFetch({ content_type: "siteSettings", limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_SETTINGS;
  const fields = f<Partial<SiteSettings>>(entry);
  return { ...FALLBACK_SETTINGS, ...fields };
}

export async function getPage(slug: string): Promise<Page | null> {
  const res = await cdaFetch({ content_type: "page", "fields.slug": slug, include: "2", limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_PAGES[slug] ?? null;
  const fields = f<Omit<Page, "sections">>(entry);
  const sections = resolveLinks(entry, "sections", res!)
    .map((e) => f<LandingSection>(e))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { ...fields, sections: slug === "home" ? mergeHomeSections(sections) : sections };
}

// Canonical home-page section sequence. When the CMS home page predates a
// variant (e.g. before a reseed adds it), the fallback section fills the gap
// so the landing page never renders as a stub; CMS content wins per variant.
// Deliberate trade-off: the home page's cross-variant order is fixed to this
// sequence — the CMS `order` field reorders sections within a variant only.
const HOME_VARIANT_ORDER: LandingSection["variant"][] = [
  "hero",
  "logos",
  "features",
  "steps",
  "usecases",
  "stats",
  "testimonial",
  "faq",
  "cta",
];

function mergeHomeSections(cmsSections: LandingSection[]): LandingSection[] {
  const byVariant = new Map<string, LandingSection[]>();
  for (const section of cmsSections) {
    byVariant.set(section.variant, [...(byVariant.get(section.variant) ?? []), section]);
  }
  const merged: LandingSection[] = [];
  for (const variant of HOME_VARIANT_ORDER) {
    const fromCms = byVariant.get(variant);
    if (fromCms) {
      merged.push(...fromCms);
      byVariant.delete(variant);
    } else {
      const fallback = FALLBACK_PAGES.home.sections.find((s) => s.variant === variant);
      if (fallback) merged.push(fallback);
    }
  }
  // CMS-defined variants outside the canonical list keep their own order.
  merged.push(...[...byVariant.values()].flat().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  return merged;
}

export async function getServices(): Promise<Service[]> {
  const res = await cdaFetch({ content_type: "service", order: "fields.order" });
  if (!res || res.items.length === 0) return FALLBACK_SERVICES;
  return res.items.map((e) => f<Service>(e));
}

export async function getBlogPosts(): Promise<BlogPost[]> {
  const res = await cdaFetch({ content_type: "blogPost", order: "-fields.publishDate" });
  if (!res || res.items.length === 0) return FALLBACK_POSTS;
  return res.items.map((e) => f<BlogPost>(e));
}

export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  const res = await cdaFetch({ content_type: "blogPost", "fields.slug": slug, limit: "1" });
  // No response means no CMS (fall back); an empty result from a live CMS
  // means the post genuinely does not exist and must 404.
  if (!res) return FALLBACK_POSTS.find((p) => p.slug === slug) ?? null;
  return res.items[0] ? f<BlogPost>(res.items[0]) : null;
}

export async function getFaqItems(): Promise<FaqItem[]> {
  const res = await cdaFetch({ content_type: "faqItem", order: "fields.order" });
  if (!res || res.items.length === 0) return FALLBACK_FAQS;
  return res.items.map((e) => f<FaqItem>(e));
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  const res = await cdaFetch({ content_type: "legalPage", "fields.slug": slug, limit: "1" });
  const entry = res?.items[0];
  if (!entry) return FALLBACK_LEGAL[slug] ?? null;
  return f<LegalPage>(entry);
}

// Resolves CMS CTA URLs: "app:signup" style values point at the product app.
export function ctaHref(url?: string): string {
  if (!url || url.startsWith("app:")) return APP_URL;
  return url;
}
