import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Reveal from "@/components/motion/reveal";
import ScrollProgress from "@/components/motion/scroll-progress";
import TextBody from "@/components/text-body";
import { ArrowRightIcon } from "@/components/icons";
import { blogCover } from "@/lib/blog-cover";
import { APP_URL, SITE_URL, getBlogPost, getBlogPosts, type BlogPost } from "@/lib/cms";
import { DEFAULT_OG_IMAGE } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPost(slug);
  if (!post) return {};
  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.excerpt;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      type: "article",
      publishedTime: post.publishDate,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
  };
}

const WORDS_PER_MINUTE = 200;

function readingTime(body?: string) {
  const words = body ? body.trim().split(/\s+/).length : 0;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function formatDate(date?: string) {
  if (!date) return null;
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function KeepReadingCard({ post }: { post: BlogPost }) {
  return (
    <article className="group card-gradient-border card-lift shadow-panel h-full rounded-2xl p-6">
      <p className="text-sm text-slate-500">
        {post.publishDate && (
          <>
            <time dateTime={post.publishDate}>{formatDate(post.publishDate)}</time>
            <span aria-hidden> &middot; </span>
          </>
        )}
        {readingTime(post.body)} min read
      </p>
      <h3 className="text-ink mt-2 text-lg font-semibold">
        <Link href={`/blog/${post.slug}`} className="hover:text-sea transition-colors">
          {post.title}
        </Link>
      </h3>
      {post.excerpt && <p className="mt-2 leading-relaxed text-slate-600 line-clamp-2">{post.excerpt}</p>}
    </article>
  );
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, posts] = await Promise.all([getBlogPost(slug), getBlogPosts()]);
  if (!post) notFound();

  const otherPosts = posts.filter((p) => p.slug !== post.slug).slice(0, 2);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    url: `${SITE_URL}/blog/${post.slug}`,
    ...(post.publishDate ? { datePublished: post.publishDate } : {}),
    ...(post.author ? { author: { "@type": "Person", name: post.author } } : {}),
    ...(post.excerpt ? { description: post.excerpt } : {}),
  };

  return (
    <>
      <ScrollProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <article>
        <header className="bg-hero-wash relative overflow-hidden">
          <div
            className="bg-dot-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-14 sm:px-6 sm:pt-16 sm:pb-16">
            <Reveal>
              <p>
                <Link href="/blog" className="text-sea inline-flex items-center gap-1.5 text-sm font-semibold">
                  <ArrowRightIcon className="h-4 w-4 rotate-180" />
                  All posts
                </Link>
              </p>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="text-ink mt-6 text-4xl font-extrabold tracking-tight text-balance">{post.title}</h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                {post.author && (
                  <>
                    <span className="text-ink font-medium">{post.author}</span>
                    <span aria-hidden>&middot;</span>
                  </>
                )}
                {post.publishDate && (
                  <>
                    <time dateTime={post.publishDate}>{formatDate(post.publishDate)}</time>
                    <span aria-hidden>&middot;</span>
                  </>
                )}
                <span>{readingTime(post.body)} min read</span>
              </p>
            </Reveal>
            <Reveal delay={220}>
              <div className="relative mt-8 h-56 overflow-hidden rounded-3xl shadow-lg shadow-slate-900/10 sm:h-72">
                <Image
                  src={blogCover(post.slug)}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 42rem, 100vw"
                  loading="eager"
                  className="object-cover"
                />
              </div>
            </Reveal>
          </div>
        </header>

        {post.body && (
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <TextBody text={post.body} />
          </div>
        )}
      </article>

      {otherPosts.length > 0 && (
        <section className="bg-mist" aria-labelledby="keep-reading">
          <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
            <Reveal>
              <h2 id="keep-reading" className="text-ink text-2xl font-bold tracking-tight">
                Keep reading
              </h2>
            </Reveal>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {otherPosts.map((other, i) => (
                <Reveal key={other.slug} delay={i * 110}>
                  <KeepReadingCard post={other} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="bg-white">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6 sm:py-16">
          <Reveal direction="zoom">
            <div className="bg-brand-gradient-animated relative overflow-hidden rounded-3xl px-6 py-12 text-center sm:px-10">
              <div className="bg-dot-grid-dark absolute inset-0 opacity-20" aria-hidden />
              <div className="relative">
                <h2 className="mx-auto max-w-md text-2xl font-bold tracking-tight text-balance text-white sm:text-3xl">
                  Put it into practice
                </h2>
                <p className="mx-auto mt-3 max-w-md leading-relaxed text-white">
                  Upload a document and get cited answers in minutes. No credit card required.
                </p>
                <div className="mt-7">
                  <a
                    href={APP_URL}
                    className="text-sea inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 text-base font-semibold shadow-lg shadow-black/10 transition-transform duration-300 hover:-translate-y-0.5"
                  >
                    Try MyPDFChat free
                    <ArrowRightIcon className="h-4.5 w-4.5" />
                  </a>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
