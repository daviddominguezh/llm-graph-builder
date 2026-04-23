import { MarkdownHooks } from 'react-markdown';
import rehypeStarryNight from 'rehype-starry-night';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';

// Mirrors packages/web/.../MessageView/MessageContent.tsx for the non-whatsapp
// Markdown branch. Same wrapper classes (px-3 py-1.5 break-words text-xs
// leading-[1.5]) and same plugin set so widget messages render identically to
// the dashboard message preview.
export function MarkdownText({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="px-3 py-1.5 break-words text-sm leading-[1.55] text-foreground">
      <div className="markdown-content">
        <MarkdownHooks remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeStarryNight]}>
          {text}
        </MarkdownHooks>
      </div>
    </div>
  );
}
