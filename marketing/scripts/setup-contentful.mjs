// Creates (or updates) and publishes the MyPDFChat content model in Contentful.
// Rerunnable: upserts every content type by fixed id.
//
// Usage:
//   CONTENTFUL_CMA_TOKEN=<management token> CONTENTFUL_SPACE_ID=<space id> node scripts/setup-contentful.mjs
//
// CONTENTFUL_ENVIRONMENT defaults to "master".

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_CMA_TOKEN;
const ENV = process.env.CONTENTFUL_ENVIRONMENT || "master";

if (!SPACE || !TOKEN) {
  console.error("Set CONTENTFUL_SPACE_ID and CONTENTFUL_CMA_TOKEN env vars.");
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;

async function cma(method, path, { body, version } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/vnd.contentful.management.v1+json",
      ...(version ? { "X-Contentful-Version": String(version) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Field helpers
const sym = (id, name, opts = {}) => ({ id, name, type: "Symbol", required: false, localized: false, ...opts });
const text = (id, name, opts = {}) => ({ id, name, type: "Text", required: false, localized: false, ...opts });
const int = (id, name) => ({ id, name, type: "Integer", required: false, localized: false });
const obj = (id, name) => ({ id, name, type: "Object", required: false, localized: false });
const date = (id, name) => ({ id, name, type: "Date", required: false, localized: false });

const uniqueSlug = { validations: [{ unique: true }] };

const contentTypes = {
  landingSection: {
    name: "Landing Section",
    displayField: "name",
    fields: [
      sym("name", "Name", { required: true }),
      sym("variant", "Variant", {
        required: true,
        validations: [{ in: ["hero", "features", "steps", "stats", "testimonial", "logos", "usecases", "faq", "cta"] }],
      }),
      sym("badge", "Badge"),
      sym("heading", "Heading"),
      text("subheading", "Subheading"),
      text("body", "Body"),
      sym("ctaLabel", "CTA Label"),
      sym("ctaUrl", "CTA URL"),
      sym("secondaryCtaLabel", "Secondary CTA Label"),
      sym("secondaryCtaUrl", "Secondary CTA URL"),
      // JSON array of items; shape depends on variant:
      // features -> [{ title, description, iconKey }], steps -> [{ title, description }],
      // stats -> [{ value, label, description }], testimonial -> [{ quote, author, role }],
      // logos -> [{ title }]
      obj("items", "Items"),
      int("order", "Order"),
    ],
  },
  page: {
    name: "Page",
    displayField: "title",
    fields: [
      sym("title", "Title", { required: true }),
      sym("slug", "Slug", { required: true, ...uniqueSlug }),
      text("body", "Body"),
      {
        id: "sections",
        name: "Sections",
        type: "Array",
        required: false,
        localized: false,
        items: {
          type: "Link",
          linkType: "Entry",
          validations: [{ linkContentType: ["landingSection"] }],
        },
      },
      sym("seoTitle", "SEO Title"),
      text("seoDescription", "SEO Description"),
    ],
  },
  service: {
    name: "Service",
    displayField: "title",
    fields: [
      sym("title", "Title", { required: true }),
      sym("slug", "Slug", { required: true, ...uniqueSlug }),
      text("summary", "Summary"),
      text("body", "Body"),
      int("order", "Order"),
      sym("seoTitle", "SEO Title"),
      text("seoDescription", "SEO Description"),
    ],
  },
  blogPost: {
    name: "Blog Post",
    displayField: "title",
    fields: [
      sym("title", "Title", { required: true }),
      sym("slug", "Slug", { required: true, ...uniqueSlug }),
      text("excerpt", "Excerpt"),
      text("body", "Body"),
      sym("author", "Author"),
      date("publishDate", "Publish Date"),
      sym("seoTitle", "SEO Title"),
      text("seoDescription", "SEO Description"),
    ],
  },
  faqItem: {
    name: "FAQ Item",
    displayField: "question",
    fields: [
      sym("question", "Question", { required: true }),
      text("answer", "Answer", { required: true }),
      int("order", "Order"),
    ],
  },
  legalPage: {
    name: "Legal Page",
    displayField: "title",
    fields: [
      sym("title", "Title", { required: true }),
      sym("slug", "Slug", { required: true, ...uniqueSlug }),
      text("body", "Body", { required: true }),
      sym("seoTitle", "SEO Title"),
      text("seoDescription", "SEO Description"),
    ],
  },
  siteSettings: {
    name: "Site Settings",
    displayField: "siteName",
    fields: [
      sym("siteName", "Site Name", { required: true }),
      sym("tagline", "Tagline"),
      sym("companyName", "Company Name"),
      sym("contactEmail", "Contact Email"),
      sym("contactPhone", "Contact Phone"),
      sym("address", "Address"),
      // JSON array of { label, href }
      obj("navItems", "Nav Items"),
      // JSON array of { title, links: [{ label, href }] }
      obj("footerColumns", "Footer Columns"),
      sym("footerText", "Footer Text"),
      sym("defaultSeoTitle", "Default SEO Title"),
      text("defaultSeoDescription", "Default SEO Description"),
    ],
  },
};

async function upsertContentType(id, definition) {
  const existing = await cma("GET", `/content_types/${id}`);
  const saved = await cma("PUT", `/content_types/${id}`, {
    body: definition,
    version: existing?.sys.version,
  });
  await cma("PUT", `/content_types/${id}/published`, { version: saved.sys.version });
  console.log(`published content type: ${id}`);
}

// landingSection first: page links to it.
for (const id of ["landingSection", "page", "service", "blogPost", "faqItem", "legalPage", "siteSettings"]) {
  await upsertContentType(id, contentTypes[id]);
}
console.log("Content model done.");
