import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BLOG_POSTS } from '../blog/posts';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  if (!post) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 sm:p-8 text-center">
        <p className="text-red-400 text-base sm:text-lg">Article not found</p>
        <Link to="/blog" className="text-blue-400 hover:text-blue-300 mt-4 inline-block font-medium">
          &larr; Back to articles
        </Link>
      </div>
    );
  }

  const schemaArticle = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: { '@type': 'Person', name: post.author },
    datePublished: post.datePublished,
    publisher: {
      '@type': 'Organization',
      name: 'SteamWatch',
      url: 'https://www.steamwatch.io',
    },
    mainEntityOfPage: `https://www.steamwatch.io/blog/${post.slug}`,
  };

  const schemaFAQ = post.faq
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: post.faq.map((q) => ({
          '@type': 'Question',
          name: q.question,
          acceptedAnswer: { '@type': 'Answer', text: q.answer },
        })),
      }
    : null;

  return (
    <div className="max-w-3xl mx-auto">
      <Helmet>
        <title>{`${post.title} — SteamWatch`}</title>
        <meta name="description" content={post.description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.description} />
        <meta property="og:url" content={`https://www.steamwatch.io/blog/${post.slug}`} />
        <meta property="og:site_name" content="SteamWatch" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.description} />
        <link rel="canonical" href={`https://www.steamwatch.io/blog/${post.slug}`} />
        <script type="application/ld+json">{JSON.stringify(schemaArticle)}</script>
        {schemaFAQ && (
          <script type="application/ld+json">{JSON.stringify(schemaFAQ)}</script>
        )}
      </Helmet>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 mb-8">
        <Link to="/" className="hover:text-slate-300 transition-colors">Home</Link>
        <span>/</span>
        <Link to="/blog" className="hover:text-slate-300 transition-colors">Blog</Link>
        <span>/</span>
        <span className="text-slate-400 truncate">{post.title}</span>
      </nav>

      {/* Article Header */}
      <header className="mb-10">
        <h1 className="text-3xl sm:text-4xl font-bold text-white leading-tight mb-4">
          {post.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span>By {post.author}</span>
          <span>&middot;</span>
          <time dateTime={post.datePublished}>{post.dateFormatted}</time>
          <span>&middot;</span>
          <span>{post.readTime}</span>
        </div>
      </header>

      {/* Article Body */}
      <article className="prose-steamwatch">
        {post.content}
      </article>

      {/* CTA */}
      <div className="mt-12 bg-slate-800/60 rounded-xl border border-slate-700/50 p-6 sm:p-8">
        <h3 className="text-lg font-bold text-white mb-3">Track Steam Moves in Real Time</h3>
        <p className="text-slate-400 text-sm mb-5">
          SteamWatch monitors Pinnacle odds across every major European football league, surfacing
          biggest movers, syndicate action, and closing line shifts — updated every 15 minutes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/steam-results"
            className="px-4 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium hover:bg-red-500/30 transition-colors"
          >
            View Steam Results
          </Link>
          <a
            href="https://t.me/steamwatchalerts"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-[#2AABEE]/20 border border-[#2AABEE]/40 rounded-lg text-[#2AABEE] text-sm font-medium hover:bg-[#2AABEE]/30 transition-colors"
          >
            Free Telegram Alerts
          </a>
        </div>
      </div>
    </div>
  );
}
