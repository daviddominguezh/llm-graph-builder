export const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.xlsx,.html,.jpg,.jpeg,.png';

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['jpg', 'jpeg', 'png']);

export function isImageFile(file: { name: string; type: string }): boolean {
  if (file.type.startsWith('image/')) return true;
  const dot = file.name.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = file.name.slice(dot + 1).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
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
