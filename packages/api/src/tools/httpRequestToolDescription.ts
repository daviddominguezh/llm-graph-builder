export const HTTP_REQUEST_DESCRIPTION =
  'Make an HTTP request to an external API. Supports GET, POST, PUT, PATCH, DELETE with JSON request and response bodies. ' +
  'URL, headers, and string fields in the body may reference tenant secrets via `{{secrets.NAME}}` placeholders — these are resolved at runtime and never appear in tool output. ' +
  'Use this for any third-party REST API the agent needs to call (Shopify, HubSpot, Google Sheets, etc.). ' +
  'Returns `{ status, headers, body }`. Response bodies are truncated to 16KB; truncated responses include a `truncated: true` note. ' +
  'Default timeout is 10s, maximum 30s. Requests to private IP ranges and OpenFlow infrastructure are blocked.';
