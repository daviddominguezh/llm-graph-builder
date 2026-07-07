import { getRequestConfig } from 'next-intl/server';

// Single-locale setup (no i18n routing): every request resolves to `en` and
// loads the full message catalog from messages/en.json. Adding a locale later
// means reading it from the request (cookie/domain) instead of the constant.
export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
