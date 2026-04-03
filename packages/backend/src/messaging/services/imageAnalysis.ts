/**
 * Image analysis service -- placeholder for AI vision features.
 *
 * TODO: Implement image analysis matching closer-back's functionality:
 *
 * 1. analyzeImageStep (closer-back: /controllers/messages/messageProcessors.ts lines 100-130)
 *    - Call a vision LLM (e.g., GPT-4V, Claude Vision) with the image URL
 *    - Get a text description of the image
 *    - Prefix with IMAGE_DESCRIPTION_PROMPT_PREFFIX
 *    - Use this description as the AI-visible message content
 *
 * 2. imageSemanticSearch (closer-back: /controllers/messages/messageProcessors.ts lines 131-217)
 *    - Embed the image using a vision model
 *    - Vector search the product catalog (Upstash Vector)
 *    - Return matching product IDs
 *    - Serialize matched products as Markdown context messages
 *    - Inject into the AI conversation via saveImageSearchMessages
 *
 * 3. Payment screenshot detection (closer-back: lines 128-153)
 *    - If the user's current graph node is a payment-screenshot node,
 *      skip product search and use fixed content:
 *      "the user sent a screenshot of a payment confirmation"
 */

export function getImageDescription(_imageUrl: string): string {
  // TODO: Call vision LLM to describe the image
  return '[Image]';
}

export function searchProductsByImage(_imageUrl: string): string[] {
  // TODO: Embed image + vector search product catalog
  return [];
}
