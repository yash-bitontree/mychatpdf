// Seeds the MyPDFChat marketing site content and publishes it.
// Rerunnable: upserts every entry by fixed id. Run setup-contentful.mjs first.
//
// Usage:
//   CONTENTFUL_CMA_TOKEN=<management token> CONTENTFUL_SPACE_ID=<space id> node scripts/seed-contentful.mjs

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_CMA_TOKEN;
const ENV = process.env.CONTENTFUL_ENVIRONMENT || "master";
const LOCALE = "en-US";

if (!SPACE || !TOKEN) {
  console.error("Set CONTENTFUL_SPACE_ID and CONTENTFUL_CMA_TOKEN env vars.");
  process.exit(1);
}

const BASE = `https://api.contentful.com/spaces/${SPACE}/environments/${ENV}`;

async function cma(method, path, { body, version, contentType } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/vnd.contentful.management.v1+json",
      ...(version ? { "X-Contentful-Version": String(version) } : {}),
      ...(contentType ? { "X-Contentful-Content-Type": contentType } : {}),
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

const loc = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { [LOCALE]: v }]));

const link = (id) => ({ sys: { type: "Link", linkType: "Entry", id } });

async function upsertEntry(contentType, id, fields) {
  const existing = await cma("GET", `/entries/${id}`);
  const saved = await cma("PUT", `/entries/${id}`, {
    body: { fields: loc(fields) },
    version: existing?.sys.version,
    contentType: existing ? undefined : contentType,
  });
  await cma("PUT", `/entries/${id}/published`, { version: saved.sys.version });
  console.log(`published ${contentType}: ${id}`);
}

// ---------------------------------------------------------------------------
// Landing sections
// ---------------------------------------------------------------------------

await upsertEntry("landingSection", "sectionHomeHero", {
  name: "Home hero",
  variant: "hero",
  badge: "Cited answers in seconds",
  heading: "Chat with any PDF. Get answers you can verify.",
  subheading:
    "MyPDFChat is an AI document chat tool that turns PDFs and Word files into a conversation. Ask questions in plain language and get fast answers with citations that link to the exact page, so you never have to take the AI's word for it.",
  ctaLabel: "Get started free",
  ctaUrl: "app:signup",
  secondaryCtaLabel: "See how it works",
  secondaryCtaUrl: "#how-it-works",
  order: 1,
});

await upsertEntry("landingSection", "sectionHomeLogos", {
  name: "Home trust strip",
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
});

await upsertEntry("landingSection", "sectionHomeFeatures", {
  name: "Home features",
  variant: "features",
  heading: "Ask anything. Verify everything.",
  subheading:
    "Six capabilities that turn a pile of documents into answers you can defend, without reading every page.",
  items: [
    {
      iconKey: "chat",
      title: "Chat with any document",
      description:
        "Upload PDFs, Word documents, and other text files, then ask questions the way you would ask a colleague. MyPDFChat answers from what the document actually says, not from generic knowledge.",
    },
    {
      iconKey: "documents",
      title: "Multi-document conversations",
      description:
        "Pull several files into one chat and ask questions that span all of them. Compare contract drafts, cross-reference research papers, or work through a full reading list in a single thread.",
    },
    {
      iconKey: "citation",
      title: "Citations on every answer",
      description:
        "Each answer links back to the source passage and page number in the original file. Click a citation to jump straight to the evidence and verify it yourself.",
    },
    {
      iconKey: "shield",
      title: "Private by default",
      description:
        "Your documents stay in your workspace and are never used to train AI models. Delete a file and it is removed from your account and our processing systems.",
    },
    {
      iconKey: "bolt",
      title: "Fast answers, less skimming",
      description:
        "Most questions get a cited answer in seconds, even from long reports and dense contracts. Choose a fast answer when you need speed or a deeper one when quality matters most.",
    },
    {
      iconKey: "folder",
      title: "Folders and chat history",
      description:
        "Organize documents into folders by project, client, or course, and keep every conversation saved. Pick up any chat where you left off instead of starting from scratch.",
    },
  ],
  order: 3,
});

await upsertEntry("landingSection", "sectionHomeSteps", {
  name: "Home how it works",
  variant: "steps",
  heading: "From upload to verified answer in three steps",
  subheading: "No setup, no manuals, no credit card. Upload a document and start asking.",
  items: [
    {
      title: "Upload your documents",
      description:
        "Drag in a PDF or Word file, or add several at once. MyPDFChat reads the full text and gets the file ready to chat in moments. Organize uploads into folders so everything stays easy to find.",
    },
    {
      title: "Ask in plain language",
      description:
        'Type questions the way you would say them out loud: "What are the payment terms?" or "Where do these two reports disagree?" You can ask follow-ups, and your chat history is saved automatically.',
    },
    {
      title: "Check the citations",
      description:
        "Every answer comes with citations that link to the exact passage and page. Click through to confirm the source in context, so you can rely on the answer in work that actually matters.",
    },
  ],
  order: 4,
});

await upsertEntry("landingSection", "sectionHomeUseCases", {
  name: "Home use cases",
  variant: "usecases",
  heading: "Made for the way you work",
  subheading: "Whatever the documents, the loop is the same: ask, verify, move on.",
  items: [
    {
      iconKey: "citation",
      title: "For researchers",
      description:
        "Load a set of papers into one conversation and ask where they agree, where they conflict, and which methodologies differ. Every claim carries a per-document citation you can quote with confidence.",
    },
    {
      iconKey: "chat",
      title: "For students",
      description:
        "Turn readings and lecture slides into a study partner. Ask for plain-language explanations, quiz yourself with active recall, and check every answer against the exact page in the textbook.",
    },
    {
      iconKey: "shield",
      title: "For legal & compliance",
      description:
        "Find the clause that matters without reading 80 pages, compare contract drafts side by side, and keep a saved, cited conversation as a lightweight audit trail of your review.",
    },
    {
      iconKey: "documents",
      title: "For analysts & teams",
      description:
        "Trace trends across quarterly reports and board packs in one chat. Folders keep client documents organized, and per-document citations keep every claim accountable.",
    },
  ],
  order: 5,
});

await upsertEntry("landingSection", "sectionHomeStats", {
  name: "Home stats",
  variant: "stats",
  items: [
    {
      value: "10s",
      label: "Typical time to a first answer",
      description: "Upload a document, ask a question, and get a cited answer in seconds rather than an afternoon of skimming.",
    },
    {
      value: "100%",
      label: "Answers with citations",
      description: "Every response links back to the source passage and page number, so nothing has to be taken on faith.",
    },
    {
      value: "0",
      label: "Documents used for AI training",
      description: "Your files are used only to answer your questions. They are never used to train models, and you can delete them any time.",
    },
    {
      value: "3+",
      label: "Documents per conversation",
      description: "Chat across multiple files at once. The free plan includes up to three documents per conversation, and paid plans raise the limit.",
    },
  ],
  order: 6,
});

await upsertEntry("landingSection", "sectionHomeTestimonials", {
  name: "Home testimonials",
  variant: "testimonial",
  heading: "Why people switch to cited answers",
  subheading:
    "Researchers, legal teams, and students use MyPDFChat when the answer has to be right, not just plausible.",
  items: [
    {
      quote:
        "I used to spend the first hour of every contract review just finding the clauses that mattered. Now I ask, click the citation, and read the exact section. The citations are the whole point; I would not trust an AI answer without them.",
      author: "Dana Whitfield",
      role: "Legal Operations Manager",
    },
    {
      quote:
        "For my literature review I loaded a batch of papers into one conversation and asked where they agreed and where they conflicted. Having every claim tied to a page number meant I could quote sources confidently in my own writing.",
      author: "Marcus Ijeoma",
      role: "PhD Candidate, Public Health",
    },
    {
      quote:
        "Our team keeps client documents in folders and every chat is saved, so any of us can pick up an old conversation and see exactly what was asked and where the answers came from. It replaced a lot of email threads.",
      author: "Priya Raghavan",
      role: "Research Analyst",
    },
    {
      quote:
        "We keep one folder per client and the chats live next to the files. A new teammate can catch up on a matter by reading the conversation instead of asking around.",
      author: "Elena Kovacs",
      role: "Paralegal",
    },
    {
      quote:
        "Before every exam I have it quiz me from the textbook chapter. When I get something wrong, the citation takes me straight to the section I skipped.",
      author: "Jordan Wallace",
      role: "Medical Student",
    },
    {
      quote:
        "The first time it told me 'the documents do not address this' instead of inventing an answer, it earned a permanent place in our compliance workflow.",
      author: "Sam Okafor",
      role: "Compliance Officer",
    },
  ],
  order: 7,
});

await upsertEntry("landingSection", "sectionHomeFaq", {
  name: "Home FAQ preview",
  variant: "faq",
  heading: "Questions, answered",
  subheading: "The short version of what people ask before they try it. The full list lives on the FAQ page.",
  items: [
    {
      title: "What is MyPDFChat?",
      description:
        "An AI document chat platform: upload PDFs or other documents, ask questions in plain language, and get answers with citations pointing to the source passage and page.",
    },
    {
      title: "Is there a free plan?",
      description:
        "Yes. Upload documents and chat within monthly limits, no credit card required. Paid plans add higher limits, larger files, and more documents per conversation.",
    },
    {
      title: "How do I know the answers are correct?",
      description:
        "Every answer cites the exact passage and page. Click a citation to see the source in context, and if the documents do not contain the answer, MyPDFChat says so instead of guessing.",
    },
    {
      title: "What happens to my documents?",
      description:
        "They stay in your workspace, are never used to train AI models, and are removed from your account and our processing systems when you delete them.",
    },
  ],
  order: 8,
});

await upsertEntry("landingSection", "sectionHomeCta", {
  name: "Home CTA",
  variant: "cta",
  heading: "Your documents already have the answers.",
  subheading:
    "Upload a file, ask in plain language, and check the citation yourself — all in the next two minutes. The free plan needs no credit card.",
  ctaLabel: "Try MyPDFChat free",
  ctaUrl: "app:signup",
  secondaryCtaLabel: "Talk to us",
  secondaryCtaUrl: "/contact",
  order: 9,
});

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

await upsertEntry("page", "pageHome", {
  title: "MyPDFChat",
  slug: "home",
  sections: [
    link("sectionHomeHero"),
    link("sectionHomeLogos"),
    link("sectionHomeFeatures"),
    link("sectionHomeSteps"),
    link("sectionHomeUseCases"),
    link("sectionHomeStats"),
    link("sectionHomeTestimonials"),
    link("sectionHomeFaq"),
    link("sectionHomeCta"),
  ],
  seoTitle: "Chat With PDF & Documents Using AI | MyPDFChat",
  seoDescription:
    "Upload PDFs and Word docs, ask questions in plain language, and get fast answers with citations to the exact page. Multi-doc chats and a free plan.",
});

await upsertEntry("page", "pageAbout", {
  title: "About MyPDFChat",
  slug: "about",
  body: `MyPDFChat started with a familiar frustration: the answer you need is on page 47 of a document you do not have time to read. Contracts, research papers, reports, manuals; the world's most important information lives in long documents, and the standard tools for getting at it are still Ctrl+F and caffeine.

## Our mission

We build AI document chat that people can actually rely on. Upload PDFs and Word files, ask questions in plain language, and get fast answers drawn from the text, with citations that link to the exact page. Bring several documents into one conversation to compare and cross-reference. Keep everything organized in folders, with every chat saved so your work is never lost. The goal is simple to state and hard to build: make the knowledge inside documents as easy to ask about as it was hard to find.

## Why citations are non-negotiable

Early in building the product we made a decision that shaped everything after it: no answer ships without a source. A confident answer without a citation is a liability, especially in the legal, research, compliance, and academic work our users do. So every response links back to the passage and page it came from, and clicking a citation takes you to the evidence in the original file. Just as important, when the documents do not contain the answer, MyPDFChat says so plainly instead of guessing. We think the difference between a toy and a tool is whether you can check its work.

## Where we stand on privacy

Your documents are yours. They are stored securely in your workspace and used for exactly one purpose: answering your questions. They are never used to train AI models, and we do not sell your data. When you delete a document, it is removed from your account and our processing systems, not archived somewhere out of reach. We built the product this way because we would not upload our own contracts to a service that behaved otherwise.

## How we work

The team is small, technical, and product-obsessed. We ship improvements weekly, we read every piece of feedback that comes through the contact form, and we prioritize the unglamorous work, like faster answers, better citations, and cleaner document handling, over flashy features that demo well and help nobody. When users tell us something is confusing, we treat that as a bug.

## Who MyPDFChat is for

Our users are people whose work depends on documents being understood correctly: lawyers reviewing contracts, researchers working through literature, analysts mining reports, students studying dense readings, and teams doing due diligence. What they share is a low tolerance for plausible-sounding nonsense, which is exactly the standard we hold the product to.

## Try it on your own documents

The free plan exists so you can judge MyPDFChat on your real work, not our marketing. Upload a document you know well, ask it hard questions, and click the citations. If the product earns your trust, the paid plans will be there when you need higher limits. If something falls short, tell us; we genuinely read it all.`,
  seoTitle: "About MyPDFChat: Why We Built Cited Document Chat",
  seoDescription:
    "The story behind MyPDFChat: why answers need citations, how we handle your documents, and the team ethos behind the product.",
});

// Thin pages that only carry SEO metadata for the listing routes.
const seoPages = [
  {
    id: "pageServices",
    title: "Services",
    slug: "services",
    seoTitle: "AI Document Chat Services & Features",
    seoDescription:
      "Explore what MyPDFChat does: AI document chat, multi-document conversations, and cited answers you can verify. Free plan available.",
  },
  {
    id: "pageBlog",
    title: "Blog",
    slug: "blog",
    seoTitle: "Blog: PDF & AI Document Chat Tips",
    seoDescription:
      "Practical guides on chatting with PDFs, analyzing multiple documents with AI, and getting accurate, cited answers. From the MyPDFChat team.",
  },
  {
    id: "pageFaq",
    title: "FAQ",
    slug: "faq",
    seoTitle: "FAQ: Formats, Privacy, Limits, Pricing",
    seoDescription:
      "Answers to common questions about MyPDFChat: supported file formats, accuracy and citations, privacy, folders, mobile use, and the free plan.",
  },
  {
    id: "pageContact",
    title: "Contact",
    slug: "contact",
    seoTitle: "Contact MyPDFChat Support & Sales",
    seoDescription:
      "Questions about MyPDFChat, pricing, or your account? Send us a message and we usually reply within one business day.",
  },
];
for (const p of seoPages) {
  await upsertEntry("page", p.id, {
    title: p.title,
    slug: p.slug,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  });
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

await upsertEntry("service", "serviceDocumentChat", {
  title: "AI document chat",
  slug: "ai-document-chat",
  summary:
    "Upload a PDF or Word file and ask questions in plain language. MyPDFChat answers directly from the text with citations to the exact page, so you get facts, not guesses.",
  body: `Reading a 90-page report to find one number is a bad use of anyone's time. AI document chat changes the workflow: upload the file, ask your question in plain language, and get an answer drawn from what the document actually says, with a citation pointing to the page it came from.

MyPDFChat reads the full text of your document, including long reports, contracts, manuals, research papers, and policy documents. It does not answer from generic internet knowledge; it retrieves the relevant passages from your file and reasons over them. If the document does not contain the answer, it tells you that instead of guessing, which is exactly what you want from a tool used for real work.

## What document chat handles for you

The tedious parts of reading are where document chat earns its keep. It finds the clause that matters in a contract, extracts figures buried in tables, explains dense technical sections in plain terms, and produces summaries of specific chapters or sections on request. You can ask follow-up questions in the same thread, and your chat history is saved, so a conversation about a document becomes a durable record you can return to later.

## Fast answers when you need them, depth when you don't

Not every question deserves the same treatment. A quick lookup ("What is the effective date?") should come back in seconds, while a nuanced question ("How does the indemnification clause interact with the liability cap?") benefits from a more careful answer. MyPDFChat supports both fast and higher-quality answer modes, so you can match speed to stakes.

## Supported formats and organization

MyPDFChat works with PDFs, Word documents (.docx), and other common text formats. Scanned documents are supported when they contain a text layer. As your library grows, folders keep documents organized by project, client, or course, and every conversation stays attached to its documents so context is never lost.

## Private by design

Your documents stay in your workspace. They are used only to answer your questions, they are never used to train AI models, and deleting a file removes it from your account and our processing systems. The free plan lets you try all of this on your own documents with no credit card required.`,
  order: 1,
  seoTitle: "AI Document Chat: Ask Your PDFs Questions",
  seoDescription:
    "Upload a PDF or Word doc and ask questions in plain language. MyPDFChat answers from the text with page-level citations. Free plan available.",
});

await upsertEntry("service", "serviceMultiDoc", {
  title: "Multi-document conversations",
  slug: "multi-document-conversations",
  summary:
    "Bring several files into one chat and ask questions that span your whole document set. Compare versions, cross-reference sources, and get per-document citations for every claim.",
  body: `Real questions rarely live in a single file. The answer to "what changed between these contract drafts" is spread across two documents. The answer to "what does the literature say" is spread across a dozen papers. MyPDFChat lets you add multiple documents to one conversation and ask questions across all of them at once, which is where AI document chat becomes genuinely more useful than a search box.

## How multi-document chat works

Add several files to a single chat, then ask normally. MyPDFChat retrieves relevant passages from every document in the conversation and answers with per-document citations, so you always know which file each claim came from and can click through to the exact page. The conversation is saved with its full document set, so you can come back next week and continue where you left off.

## What people use it for

Contract teams load two drafts and ask what changed between versions, then drill into the specific clauses that moved. Researchers load a set of papers and ask where the studies agree, where they conflict, and which methodologies differ. Analysts load a year of quarterly reports and ask for trends across periods. Students load lecture slides alongside the assigned reading and ask how the two connect. In each case, the citations keep the comparison honest.

## Question patterns that work well

Cross-document questions work best when they are explicit about scope: "Compare the termination clauses in draft A and draft B" beats "compare these." You can also ask per-document questions inside the same chat, which is convenient when you want to understand each file before comparing them. Keeping related files in one folder makes it quick to assemble the right set for a new conversation.

## Plans and limits

Free accounts can combine up to three documents per conversation. Paid plans raise the document count and file-size limits. Citations, deletion, folder organization, and privacy behavior work exactly as they do for single documents: your files are never used to train models, and deleting them removes them from your account.`,
  order: 2,
  seoTitle: "Chat With Multiple PDFs at Once",
  seoDescription:
    "Add several PDFs to one AI chat. Compare contracts, cross-reference research, and get per-document citations with MyPDFChat. Free to start.",
});

await upsertEntry("service", "serviceCitations", {
  title: "Cited, verifiable answers",
  slug: "cited-answers",
  summary:
    "Every answer links back to the exact passage and page it came from. Verify AI output in one click instead of trusting it blindly.",
  body: `An AI answer without a source is an opinion with good grammar. In any workflow where being wrong has a cost, whether that is legal review, compliance, academic research, or technical documentation, the question is never just "what is the answer" but "how do I know that is true." Citations are how.

## What a citation looks like in MyPDFChat

Every answer MyPDFChat gives includes citations: the passage it drew from, the page number, and the document it came from. Click a citation and you jump straight to the source in the original file, highlighted in context. Verification takes seconds, not a re-read of the document. In multi-document conversations, citations are attributed per document, so a comparison across five files never blurs into an unsourced blend.

## Why this matters more than raw accuracy

Even a highly accurate AI is wrong sometimes, and you cannot tell which times without checking. A tool that shows its sources turns "trust me" into "see for yourself," which changes what you can responsibly use it for. It also improves your questions: when a citation points at boilerplate instead of the substantive clause, you know immediately to rephrase, rather than discovering the problem after you have relied on the answer.

## Honest about what the documents do not say

If your documents do not contain enough information to answer a question, MyPDFChat says so instead of producing a confident guess. That restraint is a feature. It keeps the tool useful for due diligence and review work, where a fabricated answer is worse than no answer.

## Where cited answers fit in real workflows

Legal teams verify clause-level claims before sending advice. Compliance teams document exactly which policy section supports a determination. Researchers pull quotes with page numbers straight into their notes. Students check the AI's explanation against the textbook before writing it down. Because every conversation is saved with its citations, the chat itself becomes a lightweight audit trail of what was asked and where the answers came from.`,
  order: 3,
  seoTitle: "AI Answers With Citations You Can Verify",
  seoDescription:
    "Every MyPDFChat answer cites the exact passage and page. Verify AI output instead of trusting it. Built for legal, research, and compliance work.",
});

// ---------------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------------

await upsertEntry("blogPost", "postAccurateAnswers", {
  title: "How to get accurate answers from your PDFs",
  slug: "how-to-get-accurate-answers-from-your-pdfs",
  excerpt:
    "A few small changes to how you ask questions make a big difference in answer quality. Here is what actually works.",
  author: "MyPDFChat Team",
  publishDate: "2026-06-15",
  body: `Most people get mediocre answers from document AI because they ask vague questions. The tool is not mind-reading; it retrieves passages that match your question and reasons over them. Better questions mean better retrieval, which means better answers.

## Ask about one thing at a time

"Summarize the contract and list the risks and tell me the payment terms" forces the model to juggle three tasks. Split it up. Ask for the payment terms first, then the termination clauses, then a risk summary. Each answer will be sharper and easier to verify.

## Use the document's own vocabulary

If the contract says "Termination for Convenience", ask about that phrase rather than "how do I cancel". Retrieval works best when your words match the source text. Skim the table of contents first if you are not sure what terms the document uses.

## Check the citations

Every MyPDFChat answer includes citations. Click through on anything that matters. If a citation points at a boilerplate section rather than the substantive clause, rephrase your question with more specific language.

## Know when the document does not have the answer

A good document chat tool tells you when the answer is not in the file. If you get a hedge like that, do not push the model to speculate. Add the missing document to the conversation instead.

Small habits, big difference. Try these on your next contract review and compare the results.`,
  seoTitle: "How to get accurate answers from your PDFs",
  seoDescription:
    "Practical tips for asking better questions in AI document chat: one topic per question, source vocabulary, and always checking citations.",
});

await upsertEntry("blogPost", "postMultiDocLaunch", {
  title: "Multi-document conversations are here",
  slug: "multi-document-conversations-are-here",
  excerpt:
    "You can now bring several documents into one chat and ask questions that span all of them. Here is how it works and what it is good for.",
  author: "MyPDFChat Team",
  publishDate: "2026-06-28",
  body: `Until now, a MyPDFChat conversation was tied to a single document. That covered a lot, but the most interesting questions usually involve more than one file. Today we are launching multi-document conversations for all plans.

## What changed

You can add multiple documents to a single chat. Ask a question and MyPDFChat retrieves relevant passages from every file in the conversation, then answers with per-document citations so you always know where each claim came from.

## What people use it for

Early testers gravitated to a few patterns. Contract teams load two drafts and ask what changed between versions. Researchers load a folder of papers and ask where the literature agrees and where it conflicts. Analysts load quarterly reports and ask for trends across periods.

## Limits and plans

Free accounts can combine up to three documents per conversation. Paid plans raise the limit and add larger file sizes. Citations, deletion, and privacy behavior work exactly as they do for single documents.

Open the app, create a new chat, and click "Add documents" to try it. We would love to hear what you cross-reference first.`,
  seoTitle: "Multi-document conversations are here",
  seoDescription:
    "MyPDFChat now supports multi-document conversations: chat across several PDFs at once with per-document citations.",
});

await upsertEntry("blogPost", "postChatWithPdfFree", {
  title: "How to chat with a PDF for free (2026 guide)",
  slug: "chat-with-pdf-free-guide",
  excerpt:
    "A practical, step-by-step guide to chatting with any PDF for free: what you need, how to ask good questions, and how to verify the answers.",
  author: "MyPDFChat Team",
  publishDate: "2026-05-14",
  body: `If you have ever scrolled through a 60-page PDF hunting for one paragraph, you already understand why "chat with PDF" tools exist. Instead of reading or keyword-searching, you upload the file and ask questions in plain language: "What are the payment terms?" "Summarize section 4." "Where does this report mention Q3 revenue?" The tool reads the document and answers from its actual text.

The good news is you do not need to pay anything to try this. Here is how to do it properly, and how to avoid the mistakes that make people conclude these tools "don't work."

## What you need before you start

Two things: a PDF with real text in it, and a document chat tool with a free plan. The text part matters more than people expect. A PDF made from a Word document or exported from a website contains a text layer the AI can read. A pure image scan, like a photographed page, does not. Quick test: try to select and copy a sentence in your PDF viewer. If you can, you are good. If you cannot, run the file through OCR first or find a text version.

For the tool, look for three things on the free plan: no credit card required, citations on answers, and a clear privacy policy about what happens to your files. MyPDFChat checks all three: the free plan lets you upload documents and chat within monthly limits, every answer cites the exact page it came from, and uploaded documents are never used to train AI models.

## Step 1: Upload the document

Create a free account and upload your PDF. Processing usually takes a few moments even for long files. If you plan to work with several documents over time, set up folders early. "Apartment lease," "Thesis sources," and "Client X" folders cost you ten seconds now and save you real time later.

## Step 2: Ask one clear question

Start narrow. "What is the security deposit and when is it returned?" will get a sharper answer than "explain this lease." Document chat works by retrieving the passages most relevant to your question, so specific questions retrieve better passages. Ask about one thing at a time, then follow up in the same chat. Your conversation history is saved, so the thread becomes a record of everything you learned from the document.

A second tip: use the document's own vocabulary when you can. If the contract says "termination for convenience," ask about that phrase rather than "how do I cancel." Matching the source language improves retrieval noticeably.

## Step 3: Verify with citations

This is the step that separates using AI responsibly from hoping for the best. A good answer comes with a citation that links to the exact passage and page in your PDF. Click it. Read the source in context. If the citation points at a boilerplate section instead of the clause you care about, rephrase your question with more specific language and ask again.

If the tool says the document does not contain the answer, believe it. That honesty is a feature. Do not push the AI to speculate; either the information is elsewhere, or you need to add another document to the conversation.

## What free plans typically cover

Free tiers are genuinely useful for individual documents and moderate volume: a lease, a paper, a contract, a manual. In MyPDFChat, the free plan also includes multi-document conversations with up to three files per chat, which covers most comparison tasks like checking two contract drafts against each other.

You will hit free limits if you process large volumes of documents, work with very large files, or need many documents in a single conversation. That is the point where a paid plan makes sense, and by then you will know from experience whether the workflow earns it.

## The habit that makes it stick

People who get value from PDF chat tools share one habit: they treat answers as leads, not verdicts. Ask, click the citation, confirm, move on. That loop takes seconds and turns an AI assistant into something you can actually rely on for work that matters. Start with a document you already know well, test the answers against your own knowledge, and you will quickly calibrate how to ask and when to trust.`,
  seoTitle: "How to Chat With a PDF for Free (2026 Guide)",
  seoDescription:
    "Learn how to chat with a PDF for free: upload, ask questions in plain language, and verify answers with citations. Step-by-step guide, no credit card.",
});

await upsertEntry("blogPost", "postSummarizerVsChat", {
  title: "AI PDF summarizer vs. document chat: which one do you actually need?",
  slug: "ai-pdf-summarizer-vs-document-chat",
  excerpt:
    "Summarizers compress a document once. Document chat lets you ask follow-ups and verify with citations. Here is how to pick the right tool.",
  author: "MyPDFChat Team",
  publishDate: "2026-05-28",
  body: `Search for "AI PDF tool" and you will find two families of products that look similar but do different jobs. An AI PDF summarizer takes your document and produces a condensed version: key points, an abstract, maybe a bullet list per section. An AI document chat tool holds a conversation about the document: you ask questions, it answers from the text, you ask follow-ups.

People often buy one when they needed the other. Here is how to tell which job you actually have.

## What a summarizer does well

A summary answers one implicit question: "What is in this document?" That is exactly right when you are triaging. Twenty papers came back from your search query and you need to know which five deserve real attention. A stack of resumes, a batch of meeting minutes, a long article you may or may not care about. Summarization compresses first contact with a document from minutes to seconds.

The limits follow from the format. A summary is one-shot and one-size: it decides what matters before it knows what you care about. If the detail you need did not make the cut, you are back in the original PDF. And most summarizers do not tell you where in the document each point came from, so verifying a claim means searching for it manually.

## What document chat does well

Document chat answers a different question: "What does this document say about X?" You bring the agenda. Ask about the termination clause, the sample size, the warranty exclusions, the assumptions behind the forecast. Each answer draws from the relevant passages, and in a tool like MyPDFChat, each answer carries citations that link to the exact page, so checking a claim takes one click instead of a manual hunt.

The conversational format matters more than it sounds. Real understanding is iterative: the first answer raises a second question, and the second answer tells you what to read closely. A saved chat thread becomes a record of your interrogation of the document, which is worth a lot when you return to a contract or paper weeks later.

Document chat also scales across files in a way summarization does not. Put two contract drafts in one conversation and ask what changed. Put five studies in and ask where they disagree. A summarizer would give you five separate summaries and leave the cross-referencing to you.

## The honest comparison

Use a summarizer when the document is unfamiliar and your question is "should I care about this at all?" Use document chat when the document matters and your questions are specific: reviewing, studying, comparing, extracting, verifying.

Cost of errors is the other axis. A slightly-off summary of an article you were skimming costs nothing. A slightly-off reading of an indemnification clause costs a great deal. For anything with consequences, you want answers you can verify, which means citations, which means document chat.

## You rarely need to choose

In practice the workflows combine. A sensible pattern for a long report: start the chat by asking for a section-by-section overview, which gets you a summary with citations attached. Then drill into the sections that matter with specific questions. You get the triage benefit of summarization and the precision of Q&A in one thread, with every claim traceable to a page.

That is the pattern MyPDFChat is built around: ask broad, then ask narrow, and verify anything you plan to rely on. The free plan is enough to test the workflow on a real document from your own work, which will tell you more than any comparison article, including this one.`,
  seoTitle: "AI PDF Summarizer vs Document Chat: Which to Use",
  seoDescription:
    "Summaries give you an overview; document chat lets you interrogate the file with cited answers. Here is when each tool fits and how to combine them.",
});

await upsertEntry("blogPost", "postAnalyzeMultiplePdfs", {
  title: "How to analyze multiple PDFs with AI (without losing track of sources)",
  slug: "how-to-analyze-multiple-pdfs-with-ai",
  excerpt:
    "A practical workflow for asking questions across several PDFs at once: setup, question patterns, and how to keep every claim verifiable.",
  author: "MyPDFChat Team",
  publishDate: "2026-06-09",
  body: `The hardest document questions are never about one document. What changed between these two contract drafts? Where do these six studies disagree? How did the risk language evolve across four years of annual reports? Answering questions like these by hand means reading everything, taking notes, and cross-referencing yourself, which is exactly the kind of work AI document chat can compress from days to an afternoon.

Here is a workflow that holds up in practice, along with the mistakes that quietly ruin multi-document analysis.

## Step 1: Assemble a deliberate document set

Resist the urge to dump everything in. A conversation with three carefully chosen documents beats one with fifteen loosely related ones, because retrieval quality drops when the pool is full of near-duplicates and irrelevant files. Decide what question you are answering, then include only the documents that bear on it.

Folder organization pays off here. If your files already live in folders by project, client, or topic, assembling the right set for a new conversation takes seconds. Name files descriptively before uploading: "MSA-draft-v2-2026-03.pdf" beats "final_FINAL(2).pdf" when a citation tells you which document a claim came from.

## Step 2: Understand each document before comparing

A tempting shortcut is to open with a big comparative question. It works better to spend two minutes on per-document grounding first: "Summarize the key terms of draft A." "What is the methodology of the Chen study?" These answers give you the vocabulary the documents actually use, and better vocabulary makes your comparative questions retrieve better passages.

## Step 3: Ask comparative questions with explicit scope

The pattern that works: name the documents and the dimension. "Compare the limitation of liability clauses in draft A and draft B" will beat "what's different between these?" every time. Other patterns that earn their keep:

- Agreement and conflict: "Where do these three reports agree on the cause of the delay, and where do they conflict?"
- Change over time: "How does the description of supply chain risk change from the 2024 report to the 2026 report?"
- Coverage gaps: "Which of these documents does not address data retention at all?"

Ask one comparative question at a time. Stacking three comparisons into one prompt produces answers that are broad, shallow, and hard to verify.

## Step 4: Keep every claim tied to its source

This is where multi-document work gets dangerous without the right tool. When five documents blend into one answer, a claim without an attribution is nearly impossible to check. Use a tool that cites per document: MyPDFChat attaches citations to every answer showing the passage, the page, and which file it came from, so a cross-document comparison stays verifiable claim by claim. Click through on anything you plan to act on. If a citation surprises you, that is signal: either your question needs rephrasing or the documents say something you did not expect.

It also helps that conversations are saved. A completed analysis thread, with its questions, answers, and citations, is a reusable artifact. When a colleague asks "how did you conclude that?", the answer is in the chat.

## Step 5: Know the limits and work within them

Free plans typically cap documents per conversation; in MyPDFChat the free tier allows up to three files per chat, with paid plans raising the limit. For larger corpora, work in batches: compare documents in pairs or small groups, note conclusions, then run a final conversation over the shortlist. Batching sounds like a compromise, but it often produces better analysis, because each conversation stays focused.

One last honesty check: if the documents do not contain the answer, a good tool says so. Treat "the documents do not address this" as a finding, not a failure. In due diligence and research, knowing what is missing is frequently the most valuable answer of all.`,
  seoTitle: "How to Analyze Multiple PDFs With AI at Once",
  seoDescription:
    "Compare contracts, review research, and spot trends across reports. A practical workflow for analyzing multiple PDFs with AI, with cited answers.",
});

await upsertEntry("blogPost", "postStudentsGuide", {
  title: "AI document chat for students: turn your readings into a study partner",
  slug: "ai-document-chat-for-students-study-guide",
  excerpt:
    "How to turn course readings into an interactive study tool: question workflows, active recall, folders per class, and staying honest with citations.",
  author: "MyPDFChat Team",
  publishDate: "2026-07-02",
  body: `Every semester produces the same pile: lecture slides, assigned readings, a dense textbook chapter, maybe a past exam. The traditional options are rereading, which feels productive but is not, and highlighting, which mostly produces colorful pages. AI document chat offers a third option: upload the material and study by asking questions.

Done right, this is not a shortcut around learning. It is a way to spend your study hours on the parts that actually build understanding. Here is a workflow that works, course by course.

## Set up one folder per course

Before anything else, create a folder for each class and upload materials as you get them: slides, readings, syllabi, problem sets. This takes seconds per file and means that by week 10 you have an organized, searchable library instead of a downloads folder full of "lecture7_final.pdf". When exam season arrives, assembling a study conversation from a folder takes moments.

## Use chat for first-pass comprehension

The first read of a hard paper or chapter is where students lose the most time. Instead of grinding through confusion, upload the reading and ask for footholds: "Explain the main argument of this paper in plain terms." "What does the author mean by 'institutional isomorphism' in section 2?" "Walk me through the proof on page 14 step by step."

The point is not to avoid the reading; it is to read with a map. Once you know what the argument is, the dense paragraphs become much easier to parse. And because tools like MyPDFChat cite the exact page for every answer, each explanation points you back into the text rather than away from it. Click the citation, read the original passage, and confirm the explanation matches. That habit, explanation then source, is exactly how comprehension compounds.

## Connect lectures to readings with multi-document chat

Some of the best exam questions live in the gap between the lecture and the reading. Put the week's slides and the assigned paper into one conversation and ask: "How does the lecture's framing of this topic differ from the paper's?" "Which concepts appear in the slides but not the reading?" These cross-document questions surface connections that neither document shows on its own, and each answer cites which source it came from.

## Study with active recall, not passive rereading

Decades of learning research agree on one thing: testing yourself beats rereading. Document chat makes self-testing cheap. Ask the tool to quiz you: "Ask me five questions about this chapter, one at a time, and wait for my answer before continuing." Answer from memory, then check yourself against the cited passages. Wrong answers are the valuable ones; the citation takes you straight to the section you need to revisit.

Your saved chat history quietly becomes a study log. The questions you asked in week 3 are a ready-made review list in week 12, and rereading your own confusion, now resolved, is a surprisingly effective refresher.

## Use it honestly

The line is simple: use document chat to understand material, not to produce work you claim as your own. Asking for an explanation of a concept is studying. Submitting generated text as your essay is not, and most academic integrity policies say so explicitly. The citation-first design helps here too: because every answer links to the source, the natural workflow is to end up in the original text, which is where legitimate studying happens anyway. When you cite in your own papers, cite the readings, and verify the page numbers yourself with one click.

## A realistic weekly rhythm

Monday: upload the week's materials into the course folder. Before lecture: ask for the reading's main argument and three key terms. After lecture: run a slides-plus-reading conversation to connect the two. Before the exam: active-recall sessions from the folder, hardest topics first. The free plan covers this rhythm for a typical course load, which makes it easy to test against your own next assignment and see whether your comprehension, and your grades, notice the difference.`,
  seoTitle: "AI Document Chat for Students: Study Guide",
  seoDescription:
    "Turn readings and lecture slides into an interactive study partner. How students use AI document chat for comprehension, recall, and honest citations.",
});

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------

const faqs = [
  {
    id: "faqWhatIs",
    question: "What is MyPDFChat?",
    answer:
      "MyPDFChat is an AI document chat platform. You upload PDFs or other documents, ask questions in plain language, and get fast answers drawn from the text, each with citations pointing to the source passage and page. Conversations are saved, and documents can be organized into folders.",
    order: 1,
  },
  {
    id: "faqFormats",
    question: "Which file formats are supported?",
    answer:
      "PDF is the primary format. Word documents (.docx) and plain text files are also supported. Scanned PDFs work when they include a text layer; pure image scans without OCR are not readable yet. Quick check: if you can select and copy text in your PDF viewer, MyPDFChat can read it.",
    order: 2,
  },
  {
    id: "faqMultiDoc",
    question: "Can I chat with more than one document at a time?",
    answer:
      "Yes. Multi-document conversations let you add several files to one chat and ask questions across all of them, which is ideal for comparing contract drafts or cross-referencing research. Answers cite each document separately, so you always know which file every claim came from. The free plan supports up to three documents per conversation; paid plans raise the limit.",
    order: 3,
  },
  {
    id: "faqAccuracy",
    question: "How do I know the answers are correct?",
    answer:
      "Every answer includes citations that link back to the exact passage and page in your document. Click a citation to see the source highlighted in context, so verification takes seconds. If your documents do not contain the answer, MyPDFChat says so instead of guessing.",
    order: 4,
  },
  {
    id: "faqPrivacy",
    question: "What happens to my documents after I upload them?",
    answer:
      "Documents are stored securely in your workspace and used only to answer your questions. They are never used to train AI models, and we do not sell your data. When you delete a document, it is removed from your account and our processing systems; deleting your account removes your data as described in our Privacy Policy.",
    order: 5,
  },
  {
    id: "faqPricing",
    question: "Is there a free plan?",
    answer:
      "Yes. The free plan lets you upload documents and chat with them within monthly limits, no credit card required. It includes citations, folders, saved chat history, and multi-document conversations with up to three files. Paid plans add higher limits, larger files, and more documents per conversation. You can cancel any time.",
    order: 6,
  },
  {
    id: "faqVsChatgpt",
    question: "How is MyPDFChat different from ChatGPT?",
    answer:
      "General chatbots answer from broad training knowledge, which is useful but hard to verify against your specific files. MyPDFChat is built around your documents: it answers only from what your files actually say, cites the exact passage and page for every claim, tells you when the documents do not contain the answer, and keeps your files organized in folders with saved conversations. For work where the answer has to match a specific document, that verifiability is the difference.",
    order: 7,
  },
  {
    id: "faqFolders",
    question: "Can I organize documents into folders?",
    answer:
      "Yes. You can create folders for projects, clients, courses, or any structure that fits how you work, and move documents between them at any time. Conversations stay linked to their documents, so a folder becomes a tidy home for both the files and the chats about them.",
    order: 8,
  },
  {
    id: "faqMobile",
    question: "Does it work on mobile?",
    answer:
      "Yes. MyPDFChat runs in the browser and works on phones and tablets as well as desktops. You can upload documents, ask questions, and follow citations from any modern mobile browser; your folders, documents, and chat history stay in sync across devices.",
    order: 9,
  },
  {
    id: "faqLimits",
    question: "How many pages or how large can a document be?",
    answer:
      "The free plan comfortably handles typical documents, up to roughly 100 pages or 20 MB per file, which covers most contracts, papers, and reports. Paid plans raise both limits substantially for long reports, books, and large file sets. If you regularly work with unusually large documents, contact us and we will help you find the right plan.",
    order: 10,
  },
];
for (const f of faqs) {
  await upsertEntry("faqItem", f.id, { question: f.question, answer: f.answer, order: f.order });
}

// ---------------------------------------------------------------------------
// Legal pages
// ---------------------------------------------------------------------------

await upsertEntry("legalPage", "legalPrivacy", {
  title: "Privacy Policy",
  slug: "privacy",
  seoTitle: "Privacy Policy",
  seoDescription: "How MyPDFChat collects, uses, and protects your data and uploaded documents.",
  body: `Last updated: June 1, 2026

This Privacy Policy explains how MyPDFChat ("we", "us") collects, uses, and protects information when you use our website and document chat service.

## Information we collect

Account information: your name, email address, and authentication details when you create an account. Documents and chats: files you upload and the questions and answers in your conversations, stored so the service can function. Usage data: basic analytics such as pages visited and features used, collected to improve the product. Payment data: handled by our payment processor; we never store full card numbers.

## How we use your information

We use your information to provide the service, answer your questions about your documents, maintain your account, process payments, and improve the product. Your documents are used only to answer your questions. We do not use your documents to train AI models, and we do not sell your personal data.

## Data retention and deletion

Documents and conversations remain in your account until you delete them. Deleting a document removes it from your workspace and our processing systems. Deleting your account removes your personal data within 30 days, except where law requires longer retention.

## Sharing

We share data only with service providers needed to run the product (hosting, payments, email), each bound by contractual confidentiality obligations, and where required by law.

## Security

Data is encrypted in transit and at rest. Access to production systems is restricted and logged.

## Your rights

Depending on your jurisdiction, you may request access to, correction of, or deletion of your personal data. Contact us at the email address on the contact page and we will respond within 30 days.

## Changes

We will post any changes to this policy on this page and update the date above. Material changes will be announced by email.`,
});

await upsertEntry("legalPage", "legalTerms", {
  title: "Terms of Service",
  slug: "terms",
  seoTitle: "Terms of Service",
  seoDescription: "The terms that govern your use of MyPDFChat.",
  body: `Last updated: June 1, 2026

These Terms of Service govern your use of MyPDFChat. By creating an account or using the service, you agree to these terms.

## The service

MyPDFChat provides AI-assisted chat over documents you upload. Answers are generated automatically and include citations to the source text. The service is provided "as is"; while we work hard on accuracy, AI-generated answers can contain mistakes and you are responsible for verifying anything you rely on.

## Your account

You must provide accurate information and keep your credentials secure. You are responsible for activity under your account. One person per account unless your plan says otherwise.

## Your content

You keep all rights to documents you upload. You grant us a limited license to store and process them solely to provide the service to you. You must have the right to upload the documents you use, and you may not upload content that is illegal or infringes the rights of others.

## Acceptable use

Do not attempt to break, overload, or reverse engineer the service, resell it without permission, or use it to violate any law. We may suspend accounts that do.

## Billing

Paid plans bill in advance on a recurring basis. You can cancel at any time and keep access until the end of the paid period. See the Refund Policy for refund terms.

## Liability

To the maximum extent permitted by law, our total liability for any claim is limited to the amount you paid us in the twelve months before the claim arose. We are not liable for indirect or consequential damages.

## Termination

You can close your account at any time. We may terminate accounts that violate these terms, with notice where practical.

## Changes

We may update these terms. We will announce material changes by email at least 14 days before they take effect. Continued use after that constitutes acceptance.`,
});

await upsertEntry("legalPage", "legalRefund", {
  title: "Refund Policy",
  slug: "refund-policy",
  seoTitle: "Refund Policy",
  seoDescription: "When and how MyPDFChat issues refunds for paid plans.",
  body: `Last updated: June 1, 2026

We want you to be happy with MyPDFChat. This policy explains when refunds apply.

## Free plan first

The free plan exists so you can evaluate the product before paying. We encourage you to test your real documents on it before subscribing.

## Monthly plans

If MyPDFChat did not work as described, contact us within 14 days of a monthly charge and we will refund that month in full. After 14 days, charges for the current period are non-refundable, but you can cancel to stop future charges and keep access until the period ends.

## Annual plans

Annual subscriptions can be refunded in full within 30 days of the initial purchase. After 30 days, we refund the unused full months remaining on the plan, minus the discounted value of months already used.

## How to request a refund

Email us via the contact page from the address on your account, including the date of the charge. Refunds are issued to the original payment method within 5 to 10 business days of approval.

## Exceptions

We do not refund charges older than 90 days, accounts terminated for violating the Terms of Service, or amounts already refunded once. Where local consumer law grants you stronger rights, that law prevails.`,
});

// ---------------------------------------------------------------------------
// Site settings (singleton)
// ---------------------------------------------------------------------------

await upsertEntry("siteSettings", "siteSettings", {
  siteName: "MyPDFChat",
  tagline: "Chat with your documents. Verify every answer.",
  companyName: "MyPDFChat Inc.",
  contactEmail: "contact@mypdfchat.com",
  contactPhone: "+1 (555) 010-4242",
  address: "600 Congress Ave, Suite 1400, Austin, TX 78701",
  navItems: [
    { label: "Services", href: "/services" },
    { label: "Blog", href: "/blog" },
    { label: "FAQ", href: "/faq" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  footerColumns: [
    {
      title: "Product",
      links: [
        { label: "Services", href: "/services" },
        { label: "FAQ", href: "/faq" },
        { label: "Blog", href: "/blog" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
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
  defaultSeoTitle: "MyPDFChat: Chat With PDFs, Get Cited AI Answers",
  defaultSeoDescription:
    "Upload PDFs and Word docs, ask questions in plain language, and get fast AI answers with citations to the exact page. Free plan, no credit card needed.",
});

console.log("Seed done.");
