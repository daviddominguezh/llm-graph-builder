import { marked } from 'marked';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

turndown.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`,
});

export function mdToHtml(md: string): string {
  if (md === '') return '';
  return marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
}

export function htmlToMd(html: string): string {
  if (html === '' || html === '<p><br></p>') return '';
  return turndown.turndown(html).trim();
}
