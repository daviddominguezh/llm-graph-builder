export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.html,.jpg,.jpeg,.png';

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png']);

// Extensions supported by Enterprise Document OCR ("standard" mode).
// Office formats + HTML can only be processed by Layout Parser ("advanced").
const STANDARD_OCR_EXTENSIONS: ReadonlySet<string> = new Set(['pdf', 'jpg', 'jpeg', 'png']);

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.has(extensionOf(file.name));
}

export function isStandardOcrCompatible(file: { name: string; type: string }): boolean {
  if (file.type === 'application/pdf') return true;
  if (file.type.startsWith('image/')) return true;
  return STANDARD_OCR_EXTENSIONS.has(extensionOf(file.name));
}

export interface LanguageOption {
  code: string;
  label: string;
}

export const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
];
