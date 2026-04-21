# OpenFlow Chat Widget

Embed an OpenFlow agent on any website with one script tag.

## Quick start

Place this in the `<head>` or end of `<body>` of any page:

```html
<script src="https://<tenant>-<agent>.live.openflow.build/script.js" async></script>
```

The `<tenant>` and `<agent>` segments are provided when you publish an agent.

## Options

- `data-version="N"` pins the iframe to agent version `N`. Omit to always use the latest
  published version.
- `data-autoload="false"` defers iframe creation; call `window.OpenFlowWidget.boot()` after
  your consent banner is accepted.

## Content-Security-Policy

If your site sets CSP, include:

```
script-src  https://<tenant>-<agent>.live.openflow.build;
frame-src   https://<tenant>-<agent>.live.openflow.build;
connect-src https://app.openflow.build;
```

Wildcard forms (`*.live.openflow.build`) also work. If the widget bubble never appears, open
the browser console — we log a CSP checklist warning if the iframe fails to initialize within
eight seconds.

## Debugging

- Add `?openflow_debug=1` to your page URL to have the loader log its resolved state on load.
- Call `window.OpenFlowWidget.debug()` in the browser console at any time.
- The loader logs its version on script load as a single `console.info` line.

## Privacy

- No cookies are set by the widget.
- Conversation history is stored locally in IndexedDB scoped to the chat subdomain. Some
  browsers (Safari ITP, Firefox strict mode) partition or block storage for cross-site
  iframes; the widget transparently falls back to in-memory and chat still works, though
  prior sessions won't persist for those users.
- Message content is sent to `app.openflow.build`. Disclose the widget in your privacy policy.

## Direct-visit URL

`https://<tenant>-<agent>.live.openflow.build` is also a standalone chat page. You can share
this URL directly — it renders a full-viewport ChatGPT-style chat rather than the bubble.
