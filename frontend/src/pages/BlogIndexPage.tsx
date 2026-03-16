import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { BLOG_POSTS } from '../blog/posts';

export default function BlogIndexPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Helmet>
        <title>Blog — SteamWatch</title>
        <meta name="description" content="Articles on sharp money movement, steam moves, closing line value, and football betting strategy from SteamWatch." />
        <meta property="og:title" content="Blog — SteamWatch" />
        <meta property="og:description" content="Articles on sharp money movement, steam moves, closing line value, and football betting strategy." />
        <meta property="og:url" content="https://www.steamwatch.io/blog" />
        <link rel="canonical" href="https://www.steamwatch.io/blog" />
      </Helmet>

      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-8">Blog</h1>

      <div className="space-y-6">
        {BLOG_POSTS.map((post) => (
          <Link
            key={post.slug}
            to={`/blog/${post.slug}`}
            className="block bg-slate-800/60 rounded-xl border border-slate-700/50 p-5 sm:p-6 hover:border-slate-600 transition-colors group"
          >
            <h2 className="text-lg sm:text-xl font-bold text-white group-hover:text-red-400 transition-colors mb-2">
              {post.title}
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-3">
              {post.description}
            </p>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>{post.author}</span>
              <span>&middot;</span>
              <time dateTime={post.datePublished}>{post.dateFormatted}</time>
              <span>&middot;</span>
              <span>{post.readTime}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
