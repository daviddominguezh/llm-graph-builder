import Link from 'next/link';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownPageProps {
  content: string;
}

function BackLink() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to home
    </Link>
  );
}

export function MarkdownPage({ content }: MarkdownPageProps) {
  return (
    <div className="min-h-screen bg-background px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <article className="prose mt-8">
          <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
        </article>
      </div>
    </div>
  );
}
