/**
 * Constants for the Call Agent module
 * All magic strings and numbers extracted for maintainability
 */
import { FIRST_INDEX } from '@src/constants/index.js';
import type { ToolFieldValue } from '@src/types/graph.js';

const MAX_RETRY_ATTEMPTS = 4;
const MEDIUM_MODEL_THRESHOLD = 2;
const MEDIUMHIGH_MODEL_THRESHOLD = 3;
const HIGH_MODEL_THRESHOLD = 4;
const LAST_ELEMENT_OFFSET = 1;
const DEFAULT_EXAMPLE_VALUE = 'example';

export const AGENT_CONSTANTS = {
  // Retry configuration
  MAX_RETRY_ATTEMPTS,
  MEDIUM_MODEL_THRESHOLD,
  MEDIUMHIGH_MODEL_THRESHOLD,
  HIGH_MODEL_THRESHOLD,

  // Node names
  INITIAL_STEP: 'INITIAL_STEP',
  GREETING_NODE: 'Greeting',
  USER_SPECIFIED_NAME_NODE: 'UserSpecifiedName',
  PROCEED_WITH_GIVEN_QUANTITY_NODE: 'ProceedWithGivenQuantity',
  PROCEED_WITH_MULTIPLE_GIVEN_QUANTITY_NODE: 'ProceedWithMultipleGivenQuantity',

  // Tag patterns
  THINK_TAG_PREFIX: '<think>',
  THINK_TAG_SUFFIX: '</think>',
  JSON_MARKDOWN_PREFIX: '```json',
  JSON_MARKDOWN_SUFFIX: '```',

  // Node IDs
  DEFAULT_OUTPUT_NODE: '1',

  // Suffixes for debug messages
  AFTER_TOOL_REPLY_SUFFIX: '-after-tool-then-reply',

  // Nodes that should display products history
  PRODUCTS_SHOWN_HISTORY: ['SingleProduct', 'MultipleProducts', 'NoProductsFound', 'AskQuantity'] as string[],

  // Nodes where we send customization links (prevent product hallucination)
  CUSTOMIZATION_LINK_NODES: ['CustomLink', 'RemindCustom'] as string[],
} as const;

function formatFixedFields(toolFields: Record<string, ToolFieldValue> | undefined): string {
  if (toolFields === undefined) return '';
  const lines: string[] = [];
  for (const [name, field] of Object.entries(toolFields)) {
    if (field.type === 'fixed') {
      lines.push(`- ${name}: "${field.value}"`);
    }
  }
  if (lines.length === FIRST_INDEX) return '';
  return `\n\nFor the following parameters, use these EXACT values:\n${lines.join('\n')}`;
}

export const PROMPTS = {
  TOOL_CALL_FORCE:
    'You MUST properly call the tool NOW. Do NOT request additional information to the user. Your ONLY task now is to call the tool immediatly',
  GLOBAL_NODE_MUST_CALL_TOOL: (toolName: string, toolFields?: Record<string, ToolFieldValue>) => {
    const base = `You must immediately call the tool "${toolName}".
Do not reply with text.
DO NOT REPLY TO THE USER, JUST CALL THE TOOL.
Do not explain or confirm.
Do not do anything else.
Just call the tool "${toolName}" right now and pass the required parameters.
This is mandatory. Failure to do so means the task fails.
Call the tool "${toolName}" RIGHT NOW.`;
    return base + formatFixedFields(toolFields);
  },
  GLOBAL_NODE_REPLY_SUFFIX:
    '\n\nYour message to the user MUST address the question the user asked with a summary of the information you got from calling the tool.\nONLY IF you have not said hello yet, do it.',
  NO_ORDERS_WARNING:
    '\nDO NOT ASK THE USER IF THEY WANT TO SEE/KNOW ANYTHING ABOUT THEIR ORDERS. THE USER DOES NOT HAVE ANY ORDER, SO DO NOT MENTION IT.',
  NO_PRODUCT_LISTING_IN_CUSTOMIZATION: `

**CRITICAL - DO NOT LIST SPECIFIC PRODUCTS:**
When sending the customization link, do NOT list specific product names.
- ❌ WRONG: "personaliza tu orden seleccionando talla para las Zapatillas XYZ y ABC"
- ✅ CORRECT: "por favor revisa tus personalizaciones, y confirma que tengan los valores adecuados"

Products shown in search results are NOT necessarily in the cart. ONLY the addMultipleItemsToCart tool confirms what's in the cart.
Keep the message generic - the user will see their actual cart items in the customization form.`,
  PERSONALIZATION_EXACT_NAMES_REQUIRED: (
    toolName: string,
    typesWithValues: Record<string, string[]>,
    productId: string
  ) => {
    const types = Object.keys(typesWithValues);
    let result = '\n\n**CRITICAL: EXACT PERSONALIZATION TYPE NAMES REQUIRED**\n';
    result += `**When calling ${toolName} tool, you MUST use the EXACT personalization type names shown below**\n`;
    types.forEach((type) => {
      const { [type]: typeValues } = typesWithValues;
      if (typeValues === undefined) return;
      const values = typeValues.join(', ');
      result += `  - **"${type}"** (use this EXACT name, not abbreviations like "${type.toLowerCase()}" or similar)\n`;
      result += `    Available values: ${values}\n`;
    });
    result += '\n**Example of CORRECT usage:**\n';
    result += '```json\n';
    result += '{\n';
    result += '  "items": [{\n';
    result += `    "productId": "${productId}",\n`;
    result += '    "quantity": 1,\n';
    result += '    "personalizations": [\n';
    types.forEach((type, idx) => {
      const { [type]: typeValues } = typesWithValues;
      if (typeValues === undefined) return;
      const [firstValue] = typeValues;
      const exampleValue = firstValue ?? DEFAULT_EXAMPLE_VALUE;
      const isNotLastElement = idx < types.length - LAST_ELEMENT_OFFSET;
      result += `      {"type": "${type}", "value": "${exampleValue}"}${isNotLastElement ? ',' : ''}\n`;
    });
    result += '    ]\n';
    result += '  }]\n';
    result += '}\n';
    result += '```\n\n';
    return result;
  },
} as const;

export const ERROR_MESSAGES = {
  JSON_PARSE_ERROR: (response: string) =>
    `Error: error trying to parse JSON from model response. Response was:\n${response}`,
} as const;
