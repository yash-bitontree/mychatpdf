import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PageHero from "@/components/page-hero";
import Reveal from "@/components/motion/reveal";
import ScrollDraw from "@/components/motion/scroll-draw";
import { PaperPlaneScene } from "@/components/route-scenes";
import { ArrowRightIcon } from "@/components/icons";
import { blogCover } from "@/lib/blog-cover";
import { getBlogPosts, getPage, type BlogPost } from "@/lib/cms";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage("blog");
  return {
    title: page?.seoTitle ?? "Blog",
    description:
      page?.seoDescription ??
      "Product news and practical tips for getting more out of your documents with MyPDFChat.",
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

function PostMeta({ post }: { post: BlogPost }) {
  return (
    <p className="text-sm text-slate-500">
      {post.publishDate && (
        <>
          <time dateTime={post.publishDate}>{formatDate(post.publishDate)}</time>
          <span aria-hidden> &middot; </span>
        </>
      )}
      {readingTime(post.body)} min read
    </p>
  );
}

export default async function BlogPage() {
  const [page, posts] = await Promise.all([getPage("blog"), getBlogPosts()]);
  const [featured, ...rest] = posts;

  return (
    <>
      <PageHero
        eyebrow="Blog"
        // A CMS title of literally "Blog" would just repeat the eyebrow.
        title={page?.title && page.title.toLowerCase() !== "blog" ? page.title : "Notes on getting answers from documents"}
        subtitle={
          page?.seoDescription ??
          "Product news and practical tips for getting more out of your documents with MyPDFChat."
        }
      />

      <section className="relative bg-white">
        {/* Notes in flight: the plane follows its dashed path with scroll. */}
        <ScrollDraw className="pointer-events-none absolute -top-10 right-0 left-0">
          <PaperPlaneScene className="top-0 right-8 h-32 w-[28rem] opacity-50" />
        </ScrollDraw>
        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
          {featured && (
            <Reveal>
              <article className="group card-gradient-border card-lift shadow-panel overflow-hidden rounded-3xl md:flex">
                <div className="relative min-h-52 overflow-hidden md:w-2/5">
                  <Image
                    src={blogCover(featured.slug)}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 40vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="from-ink/30 absolute inset-0 bg-gradient-to-t to-transparent" aria-hidden />
                </div>
                <div className="p-6 sm:p-10 md:w-3/5">
                  <p className="text-sea text-sm font-semibold tracking-[0.16em] uppercase">Latest post</p>
                  <div className="mt-3">
                    <PostMeta post={featured} />
                  </div>
                  <h2 className="text-ink mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    <Link href={`/blog/${featured.slug}`} className="hover:text-sea transition-colors">
                      {featured.title}
                    </Link>
                  </h2>
                  {featured.excerpt && <p className="mt-3 leading-relaxed text-slate-600">{featured.excerpt}</p>}
                  <p className="mt-5">
                    <Link
                      href={`/blog/${featured.slug}`}
                      className="text-sea inline-flex items-center gap-1.5 text-sm font-semibold"
                    >
                      Read the post
                      <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </p>
                </div>
              </article>
            </Reveal>
          )}

          {rest.length > 0 && (
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {rest.map((post, i) => (
                <Reveal key={post.slug} delay={(i % 2) * 110}>
                  <article className="group card-gradient-border card-lift shadow-panel h-full overflow-hidden rounded-2xl">
                    <div className="relative h-40 overflow-hidden">
                      <Image
                        src={blogCover(post.slug)}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 50vw, 100vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-6">
                    <PostMeta post={post} />
                    <h2 className="text-ink mt-2 text-xl font-semibold">
                      <Link href={`/blog/${post.slug}`} className="hover:text-sea transition-colors">
                        {post.title}
                      </Link>
                    </h2>
                    {post.excerpt && <p className="mt-2 leading-relaxed text-slate-600">{post.excerpt}</p>}
                    <p className="mt-4">
                      <Link
                        href={`/blog/${post.slug}`}
                        className="text-sea inline-flex items-center gap-1.5 text-sm font-semibold"
                      >
                        Read more
                        <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </Link>
                    </p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
