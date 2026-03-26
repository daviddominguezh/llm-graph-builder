import fs from 'node:fs';
import path from 'node:path';

import type { Metadata } from 'next';

import { MarkdownPage } from '../components/MarkdownPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — OpenFlow',
  description: 'OpenFlow GmbH Privacy Policy',
};

export default function PrivacyPage() {
  const filePath = path.resolve(process.cwd(), '..', '..', 'privacy.md');
  const content = fs.readFileSync(filePath, 'utf-8');

  return <MarkdownPage content={content} />;
}
