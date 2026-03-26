import fs from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';

import { MarkdownPage } from '../components/MarkdownPage';

export const metadata: Metadata = {
  title: 'Terms and Conditions — OpenFlow',
  description: 'OpenFlow GmbH Terms and Conditions',
};

export default function TermsPage() {
  const filePath = path.resolve(process.cwd(), '..', '..', 'terms.md');
  const content = fs.readFileSync(filePath, 'utf-8');

  return <MarkdownPage content={content} />;
}
