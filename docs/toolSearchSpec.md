# Tool Search: A Complete Technical Specification

## For Developer Teams Implementing Deferred Tool Loading with the Anthropic Messages API

**Version:** 1.0
**Last Updated:** March 2026
**Audience:** Backend engineers, agent framework developers, junior-to-senior

---

## Table of Contents

1. [The Problem: Why Tool Search Exists](#1-the-problem-why-tool-search-exists)
2. [Mental Model: How the Messages API Normally Handles Tools](#2-mental-model-how-the-messages-api-normally-handles-tools)
3. [Tool Search Architecture Overview](#3-tool-search-architecture-overview)
4. [The Two Search Variants](#4-the-two-search-variants)
5. [Deferred Loading: The `defer_loading` Flag](#5-deferred-loading-the-defer_loading-flag)
6. [What Claude Actually Sees at Each Stage](#6-what-claude-actually-sees-at-each-stage)
7. [End-to-End Request/Response Lifecycle](#7-end-to-end-requestresponse-lifecycle)
8. [Complete Code Examples](#8-complete-code-examples)
9. [MCP Server Integration](#9-mcp-server-integration)
10. [Custom Tool Search (Build Your Own)](#10-custom-tool-search-build-your-own)
11. [Prompt Caching Interaction](#11-prompt-caching-interaction)
12. [Multi-Turn Conversations](#12-multi-turn-conversations)
13. [Error Handling](#13-error-handling)
14. [Limits, Constraints, and Edge Cases](#14-limits-constraints-and-edge-cases)
15. [Optimization Best Practices](#15-optimization-best-practices)
16. [Claude Code Specifics: How It Uses Tool Search Internally](#16-claude-code-specifics-how-it-uses-tool-search-internally)
17. [Glossary](#17-glossary)

---

## 1. The Problem: Why Tool Search Exists

### 1.1 Token Cost of Tool Definitions

Every time you call the Messages API, the `tools` array you send gets serialized into the model's context window as input tokens. The model needs to "read" every tool definition to understand what tools it can use — just like it reads your system prompt and messages.

A single tool definition typically consumes 50–200 tokens depending on the complexity of its description and JSON schema. Here is a rough breakdown:

```
Tool name:          ~2-5 tokens
Description:        ~20-80 tokens
Input schema:       ~30-150 tokens
────────────────────────────────
Total per tool:     ~50-200 tokens (typical range)
```

This means:

| Number of tools | Estimated token overhead | Context window consumed (200K) |
|-----------------|------------------------|-------------------------------|
| 5 tools         | ~500-1,000 tokens      | ~0.5%                         |
| 20 tools        | ~2,000-4,000 tokens    | ~2%                           |
| 50 tools        | ~5,000-10,000 tokens   | ~5%                           |
| 100 tools       | ~10,000-20,000 tokens  | ~10%                          |
| 200 tools       | ~20,000-40,000 tokens  | ~20%                          |
| 500 tools       | ~50,000-100,000 tokens | ~50%                          |

### 1.2 The Compounding Effect

These tokens are paid on **every single API call** in a conversation. In a 10-turn conversation with 100 tools, you're paying ~10K-20K tokens × 10 = ~100K-200K input tokens **just for tool definitions**, before counting messages, system prompts, or actual content.

### 1.3 Accuracy Degradation

Beyond cost, Claude's ability to select the correct tool degrades significantly once the tool count exceeds ~30-50. With hundreds of tools, the model has to reason about which one to pick from a massive list, often with similar names (e.g., `notification_send_user` vs `notification_send_channel`). This leads to wrong tool selection and incorrect parameter construction.

### 1.4 What Tool Search Solves

Tool Search addresses both problems:

- **Token reduction:** Only 3-5 relevant tool definitions are loaded per query, instead of all of them. For a 200-tool setup, this is an ~85% reduction.
- **Accuracy improvement:** Claude reasons over a focused set of 3-5 tools, not hundreds. Anthropic's internal evaluations showed accuracy jumps from 49% to 74% (Opus 4) and from 79.5% to 88.1% (Opus 4.5) with Tool Search enabled.

---

## 2. Mental Model: How the Messages API Normally Handles Tools

Before understanding Tool Search, you need a solid understanding of how normal (non-deferred) tool use works.

### 2.1 Standard Tool Use Flow

```
┌──────────────────────────────────────────────────────┐
│                    YOUR APPLICATION                    │
│                                                        │
│  1. Build the request:                                 │
│     - system prompt                                    │
│     - messages array (conversation history)            │
│     - tools array (ALL tool definitions)               │
│                                                        │
│  2. POST /v1/messages ──────────────────────────────►  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │               ANTHROPIC API SERVER                │  │
│  │                                                    │  │
│  │  Serializes everything into Claude's context:      │  │
│  │  ┌────────────────────────────────────────────┐   │  │
│  │  │ CONTEXT WINDOW (~200K tokens)              │   │  │
│  │  │                                            │   │  │
│  │  │ [System Prompt]         ~500 tokens         │   │  │
│  │  │ [Tool A definition]     ~150 tokens         │   │  │
│  │  │ [Tool B definition]     ~100 tokens         │   │  │
│  │  │ [Tool C definition]     ~200 tokens         │   │  │
│  │  │ [Tool D definition]     ~120 tokens         │   │  │
│  │  │ [Tool E definition]     ~180 tokens         │   │  │
│  │  │ [User message: "Hello"]   ~1 token          │   │  │
│  │  │                                            │   │  │
│  │  │ Total: ~1,251 tokens for a "Hello"         │   │  │
│  │  └────────────────────────────────────────────┘   │  │
│  │                                                    │  │
│  │  Claude processes ALL of this and responds          │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  3. ◄──────────────────── Response                     │
│     Claude either:                                     │
│     a) Responds with text (stop_reason: "end_turn")    │
│     b) Requests a tool call (stop_reason: "tool_use")  │
│                                                        │
│  4. If tool_use: execute the tool, send result back    │
│  5. Repeat from step 2 (with updated messages)         │
└──────────────────────────────────────────────────────┘
```

### 2.2 Key Insight

Notice that in step 2, **every tool definition is serialized into the context window**, regardless of whether Claude will use it. If Claude just says "Hello back!" and doesn't use any tools, you still paid for all 5 tool definitions. This is the core inefficiency that Tool Search addresses.

---

## 3. Tool Search Architecture Overview

### 3.1 High-Level Flow with Tool Search

```
┌────────────────────────────────────────────────────────────┐
│                     YOUR APPLICATION                        │
│                                                              │
│  1. Build the request:                                       │
│     - system prompt                                          │
│     - messages array                                         │
│     - tools array with:                                      │
│       • Tool Search tool (non-deferred, ~100-200 tokens)     │
│       • 3-5 critical tools (non-deferred, loaded normally)   │
│       • N deferred tools (NOT loaded into context)           │
│                                                              │
│  2. POST /v1/messages ────────────────────────────────────►  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                  ANTHROPIC API SERVER                    │  │
│  │                                                          │  │
│  │  Separates tools into two groups:                        │  │
│  │                                                          │  │
│  │  IN CONTEXT (what Claude sees):                          │  │
│  │  ┌──────────────────────────────────────────────┐       │  │
│  │  │ [System Prompt]                               │       │  │
│  │  │ [Tool Search tool definition]   ~100-200 tok  │       │  │
│  │  │ [Critical Tool A definition]    ~150 tok      │       │  │
│  │  │ [Critical Tool B definition]    ~100 tok      │       │  │
│  │  │ [User message]                                │       │  │
│  │  └──────────────────────────────────────────────┘       │  │
│  │                                                          │  │
│  │  STORED BUT HIDDEN (tool catalog, NOT in context):       │  │
│  │  ┌──────────────────────────────────────────────┐       │  │
│  │  │ [Deferred Tool 1] [Deferred Tool 2] ...       │       │  │
│  │  │ [Deferred Tool 3] [Deferred Tool 4] ...       │       │  │
│  │  │ ... up to 10,000 tools ...                    │       │  │
│  │  │                                               │       │  │
│  │  │ Searchable index of names + descriptions      │       │  │
│  │  └──────────────────────────────────────────────┘       │  │
│  │                                                          │  │
│  │  If Claude needs a deferred tool:                        │  │
│  │  Claude calls tool_search → API searches catalog →       │  │
│  │  Returns tool_references → API expands to full defs →    │  │
│  │  Claude now sees those tools and can call them            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  3. ◄──────────────────── Response                           │
└────────────────────────────────────────────────────────────┘
```

### 3.2 What the "Catalog" Contains

The API-side catalog is built from the metadata of every tool you marked with `defer_loading: true`. The searchable fields are:

1. **Tool name** (e.g., `"slack_send_message"`)
2. **Tool description** (e.g., `"Send a message to a Slack channel or user"`)
3. **Argument names** (e.g., `"channel"`, `"message"`, `"thread_ts"`)
4. **Argument descriptions** (e.g., `"The Slack channel ID to send the message to"`)

Claude does NOT see any of these fields initially. It only sees them after a successful search returns references, which the API then expands.

---

## 4. The Two Search Variants

Anthropic provides two built-in search strategies. You pick one when you include the tool search tool in your request.

### 4.1 Regex Variant

**Type identifier:** `tool_search_tool_regex_20251119`

**How it works:** Claude constructs a Python-compatible regex pattern (using `re.search()` semantics). The API runs this regex against the concatenation of tool names, descriptions, argument names, and argument descriptions for each deferred tool. Tools that match are returned.

**Claude's query examples:**

| User request | Claude's regex query | What it matches |
|---|---|---|
| "Send a message on Slack" | `"slack\|message"` | Tools with "slack" OR "message" in their metadata |
| "Get weather data" | `"weather"` | Tools with "weather" anywhere |
| "Create a GitHub PR" | `"github.*pull\|pull.*request\|create.*pr"` | Various patterns for PR-related tools |
| "Query the database" | `"(?i)database\|db\|query\|sql"` | Case-insensitive search for DB-related terms |
| "List all user permissions" | `"user.*permission\|permission.*list\|acl"` | Permission-related tools |

**Constraint:** Maximum query length is 200 characters.

**When to use:** When your tool names follow predictable naming conventions (e.g., `github_create_pr`, `slack_send_message`). Regex is precise and fast.

### 4.2 BM25 Variant

**Type identifier:** `tool_search_tool_bm25_20251119`

**How it works:** Claude writes a natural language query. The API uses the BM25 ranking algorithm (a standard information retrieval algorithm based on term frequency) to score and rank tools by relevance to the query.

**Claude's query examples:**

| User request | Claude's BM25 query |
|---|---|
| "Send a message on Slack" | `"send message slack channel"` |
| "Get weather data" | `"get current weather location"` |
| "Create a GitHub PR" | `"create pull request github repository"` |

**When to use:** When tool descriptions are written in natural language and you want semantic-ish matching without exact keyword hits.

### 4.3 Comparison

| Aspect | Regex | BM25 |
|--------|-------|------|
| Query language | Python regex syntax | Natural language |
| Matching style | Exact pattern matching | Term frequency ranking |
| Best for | Predictable naming conventions | Natural language descriptions |
| Precision | Higher (exact matches) | Slightly fuzzier |
| Failure mode | Missed tools if regex too narrow | Irrelevant tools if descriptions are vague |

### 4.4 Can You Use Both?

No. You include exactly one tool search tool per request. You cannot mix regex and BM25 in the same API call. However, you can switch between them across different requests.

---

## 5. Deferred Loading: The `defer_loading` Flag

### 5.1 What It Does

Adding `"defer_loading": true` to a tool definition tells the API: "Store this tool in the searchable catalog, but do NOT put its definition into Claude's context window."

### 5.2 Standard Tool Definition (Non-Deferred)

```json
{
  "name": "get_current_time",
  "description": "Returns the current UTC time",
  "input_schema": {
    "type": "object",
    "properties": {
      "timezone": {
        "type": "string",
        "description": "IANA timezone string, e.g. 'America/New_York'"
      }
    },
    "required": ["timezone"]
  }
}
```

This tool is loaded into Claude's context on every request. Claude can see and use it immediately.

### 5.3 Deferred Tool Definition

```json
{
  "name": "get_current_time",
  "description": "Returns the current UTC time",
  "input_schema": {
    "type": "object",
    "properties": {
      "timezone": {
        "type": "string",
        "description": "IANA timezone string, e.g. 'America/New_York'"
      }
    },
    "required": ["timezone"]
  },
  "defer_loading": true
}
```

Identical, except for `"defer_loading": true`. This tool is NOT in Claude's context. Claude cannot see it or use it until it discovers it via tool search.

### 5.4 Rules

1. **The Tool Search tool itself must NEVER be deferred.** It needs to be in context so Claude can use it.
2. **At least one tool must be non-deferred.** You cannot defer everything — the API returns a 400 error.
3. **Keep your 3-5 most frequently used tools as non-deferred.** This avoids unnecessary search round-trips for tools Claude almost always needs.
4. **All deferred tool definitions are still sent in the `tools` array.** The API needs the full definitions to expand references later. You send everything; the API decides what to load into context.

### 5.5 Decision Framework

```
For each tool, ask:

  "Will Claude need this tool in >50% of conversations?"
    ├── YES → Don't defer (keep in context)
    └── NO  → Defer it
         │
         └── "Is this tool critical for safety/auth checks?"
               ├── YES → Don't defer (even if rarely used)
               └── NO  → Defer it
```

---

## 6. What Claude Actually Sees at Each Stage

This section walks through exactly what is in Claude's context window at each point in the process.

### Stage 1: Initial Request (Before Any Search)

Claude's context contains:

```
╔════════════════════════════════════════════════════════╗
║  SYSTEM PROMPT                                         ║
║  "You are a helpful assistant. You have access to      ║
║   tools for Slack, GitHub, Jira, and weather data.     ║
║   Use tool search to find the right tool."             ║
║                                                        ║
║  TOOL: tool_search_tool_regex                          ║
║  (Claude sees the search tool's schema — it knows      ║
║   it can call this tool with a "query" parameter)      ║
║                                                        ║
║  TOOL: get_current_time  [non-deferred]                ║
║  (Claude sees this tool's full definition)             ║
║                                                        ║
║  USER MESSAGE: "Send a message to #general on Slack    ║
║  saying 'Deploy complete'"                             ║
║                                                        ║
║  ⚠️ Claude does NOT see:                               ║
║     - slack_send_message                               ║
║     - slack_list_channels                              ║
║     - github_create_pr                                 ║
║     - jira_create_issue                                ║
║     - get_weather                                      ║
║     - ... (any other deferred tools)                   ║
║                                                        ║
║  Claude does NOT have a summary or list of deferred    ║
║  tool names. It is essentially "blind" to them.        ║
╚════════════════════════════════════════════════════════╝
```

**Key insight:** Claude does NOT get a list like "Available deferred tools: slack_send_message, github_create_pr, ...". It only knows what tools might exist from your system prompt (if you mentioned it) and from the general context of the conversation. This is why **system prompt hints are important** (see Section 15).

### Stage 2: Claude Calls Tool Search

Claude decides it needs a Slack-related tool and generates:

```json
{
  "type": "server_tool_use",
  "id": "srvtoolu_01ABC123",
  "name": "tool_search_tool_regex",
  "input": {
    "query": "slack.*send|send.*message"
  }
}
```

### Stage 3: API Executes Search, Returns References

The API searches all deferred tools and returns matches:

```json
{
  "type": "tool_search_tool_result",
  "tool_use_id": "srvtoolu_01ABC123",
  "content": {
    "type": "tool_search_tool_search_result",
    "tool_references": [
      { "type": "tool_reference", "tool_name": "slack_send_message" },
      { "type": "tool_reference", "tool_name": "slack_send_dm" }
    ]
  }
}
```

### Stage 4: API Expands References Into Full Definitions

**This happens automatically.** The API takes the tool names from `tool_references`, finds their full definitions in your original `tools` array, and injects them into Claude's context. Claude now sees:

```
╔════════════════════════════════════════════════════════╗
║  (everything from Stage 1, plus...)                    ║
║                                                        ║
║  TOOL: slack_send_message                              ║
║  {                                                     ║
║    "name": "slack_send_message",                       ║
║    "description": "Send a message to a Slack channel", ║
║    "input_schema": {                                   ║
║      "type": "object",                                 ║
║      "properties": {                                   ║
║        "channel": { "type": "string", ... },           ║
║        "text": { "type": "string", ... }               ║
║      }                                                 ║
║    }                                                   ║
║  }                                                     ║
║                                                        ║
║  TOOL: slack_send_dm                                   ║
║  { ... full definition ... }                           ║
║                                                        ║
║  Claude can now call either of these tools.            ║
╚════════════════════════════════════════════════════════╝
```

### Stage 5: Claude Calls the Discovered Tool

```json
{
  "type": "tool_use",
  "id": "toolu_01XYZ789",
  "name": "slack_send_message",
  "input": {
    "channel": "#general",
    "text": "Deploy complete"
  }
}
```

This is a standard `tool_use` block — identical to what Claude would produce without Tool Search. Your application handles it the same way.

---

## 7. End-to-End Request/Response Lifecycle

### 7.1 Sequence Diagram

```
YOUR APP                    ANTHROPIC API                   CLAUDE (MODEL)
   │                             │                               │
   │  POST /v1/messages          │                               │
   │  (tools: [search_tool,      │                               │
   │   critical_tools,           │                               │
   │   deferred_tools])          │                               │
   │ ──────────────────────────► │                               │
   │                             │  Separate deferred vs         │
   │                             │  non-deferred tools.          │
   │                             │  Build search catalog.        │
   │                             │  Load only non-deferred       │
   │                             │  tools + search tool          │
   │                             │  into context.                │
   │                             │ ─────────────────────────────►│
   │                             │                               │
   │                             │  Claude reads user message,   │
   │                             │  decides it needs a tool      │
   │                             │  it can't see.                │
   │                             │                               │
   │                             │  Claude calls                 │
   │                             │  tool_search_tool_regex       │
   │                             │  with query: "slack"          │
   │                             │ ◄─────────────────────────────│
   │                             │                               │
   │                             │  API searches catalog.        │
   │                             │  Finds matches.               │
   │                             │  Returns tool_references.     │
   │                             │  Expands references into      │
   │                             │  full definitions.            │
   │                             │  Injects into context.        │
   │                             │ ─────────────────────────────►│
   │                             │                               │
   │                             │  Claude now sees the full     │
   │                             │  tool definitions.            │
   │                             │  Claude calls                 │
   │                             │  slack_send_message            │
   │                             │ ◄─────────────────────────────│
   │                             │                               │
   │  Response with:             │                               │
   │  - server_tool_use (search) │                               │
   │  - tool_search_tool_result  │                               │
   │  - tool_use (slack_send)    │                               │
   │ ◄──────────────────────────│                               │
   │                             │                               │
   │  Execute slack_send_message │                               │
   │  locally. Build tool_result.│                               │
   │                             │                               │
   │  POST /v1/messages          │                               │
   │  (with tool_result)         │                               │
   │ ──────────────────────────► │                               │
   │                             │                               │
   │  ... conversation continues │                               │
```

### 7.2 Important: This All Happens in ONE API Call

The tool search, reference expansion, and subsequent tool call all happen within a **single** API request/response cycle. You do NOT need to make multiple API calls. The response you receive contains all the blocks:

1. `server_tool_use` — Claude's search invocation
2. `tool_search_tool_result` — the search results
3. `text` — Claude's reasoning (optional)
4. `tool_use` — Claude's actual tool call

You only need to handle the `tool_use` block (execute the tool and send the result back), just like normal tool use.

---

## 8. Complete Code Examples

### 8.1 Minimal Example (Pseudocode, Language-Agnostic)

```
// === STEP 1: Define your tools ===

tools = [
  // The search tool (NEVER deferred)
  {
    type: "tool_search_tool_regex_20251119",
    name: "tool_search_tool_regex"
  },

  // A critical tool you always need (NOT deferred)
  {
    name: "get_current_time",
    description: "Returns the current UTC time",
    input_schema: {
      type: "object",
      properties: {
        timezone: { type: "string" }
      },
      required: ["timezone"]
    }
    // No defer_loading → loaded into context every time
  },

  // Deferred tools (NOT loaded into context initially)
  {
    name: "slack_send_message",
    description: "Send a message to a Slack channel",
    input_schema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name or ID" },
        text:    { type: "string", description: "Message content" }
      },
      required: ["channel", "text"]
    },
    defer_loading: true   // ← THIS IS THE KEY FLAG
  },
  {
    name: "slack_list_channels",
    description: "List all Slack channels the bot has access to",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "integer", description: "Max channels to return" }
      }
    },
    defer_loading: true
  },
  {
    name: "github_create_pr",
    description: "Create a pull request on a GitHub repository",
    input_schema: {
      type: "object",
      properties: {
        repo:   { type: "string", description: "owner/repo format" },
        title:  { type: "string" },
        body:   { type: "string" },
        head:   { type: "string", description: "Source branch" },
        base:   { type: "string", description: "Target branch" }
      },
      required: ["repo", "title", "head", "base"]
    },
    defer_loading: true
  },
  {
    name: "jira_create_issue",
    description: "Create a Jira issue in a project",
    input_schema: {
      type: "object",
      properties: {
        project_key: { type: "string" },
        summary:     { type: "string" },
        description: { type: "string" },
        issue_type:  { type: "string", enum: ["Bug", "Task", "Story"] }
      },
      required: ["project_key", "summary", "issue_type"]
    },
    defer_loading: true
  },
  {
    name: "get_weather",
    description: "Get current weather conditions for a location",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name or coordinates" },
        unit:     { type: "string", enum: ["celsius", "fahrenheit"] }
      },
      required: ["location"]
    },
    defer_loading: true
  }
]


// === STEP 2: Make the API request ===

request_body = {
  model: "claude-sonnet-4-6",
  max_tokens: 2048,
  system: "You are a helpful assistant with access to Slack, GitHub, "
        + "Jira, and weather tools. Use tool search to find the right "
        + "tool for the user's request.",
  messages: [
    {
      role: "user",
      content: "Post 'Build succeeded' in #deployments on Slack"
    }
  ],
  tools: tools
}

response = HTTP_POST("https://api.anthropic.com/v1/messages", request_body)


// === STEP 3: Parse the response ===

// The response.content array will contain multiple blocks:

for block in response.content:

  if block.type == "server_tool_use":
    // Claude invoked tool search. This is informational for you.
    // You do NOT need to execute anything.
    LOG("Claude searched for tools with query: " + block.input.query)

  if block.type == "tool_search_tool_result":
    // The API's search results. Also informational.
    // The expansion already happened server-side.
    refs = block.content.tool_references
    LOG("Found tools: " + refs.map(r => r.tool_name))

  if block.type == "text":
    // Claude's text output
    DISPLAY(block.text)

  if block.type == "tool_use":
    // Claude wants YOU to execute this tool.
    // This is the only block you need to act on.
    tool_name = block.name        // e.g. "slack_send_message"
    tool_input = block.input      // e.g. { channel: "#deployments", text: "Build succeeded" }
    tool_use_id = block.id        // e.g. "toolu_01XYZ789"

    result = EXECUTE_TOOL(tool_name, tool_input)

    // Send the result back
    next_request = {
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        { role: "user", content: "Post 'Build succeeded' in #deployments on Slack" },
        { role: "assistant", content: response.content },  // Full response including search blocks
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: tool_use_id,
              content: JSON.stringify(result)
            }
          ]
        }
      ],
      tools: tools  // Same tools array as before
    }

    final_response = HTTP_POST("https://api.anthropic.com/v1/messages", next_request)
```

### 8.2 The Actual HTTP Request (curl)

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-6",
    "max_tokens": 2048,
    "system": "You are a helpful assistant with access to Slack, GitHub, Jira, and weather tools. Use tool search to find the right tool.",
    "messages": [
      {
        "role": "user",
        "content": "Post Build succeeded in #deployments on Slack"
      }
    ],
    "tools": [
      {
        "type": "tool_search_tool_regex_20251119",
        "name": "tool_search_tool_regex"
      },
      {
        "name": "get_current_time",
        "description": "Returns the current UTC time",
        "input_schema": {
          "type": "object",
          "properties": {
            "timezone": { "type": "string" }
          },
          "required": ["timezone"]
        }
      },
      {
        "name": "slack_send_message",
        "description": "Send a message to a Slack channel",
        "input_schema": {
          "type": "object",
          "properties": {
            "channel": { "type": "string", "description": "Channel name or ID" },
            "text": { "type": "string", "description": "Message content" }
          },
          "required": ["channel", "text"]
        },
        "defer_loading": true
      },
      {
        "name": "github_create_pr",
        "description": "Create a pull request on a GitHub repository",
        "input_schema": {
          "type": "object",
          "properties": {
            "repo": { "type": "string" },
            "title": { "type": "string" },
            "head": { "type": "string" },
            "base": { "type": "string" }
          },
          "required": ["repo", "title", "head", "base"]
        },
        "defer_loading": true
      }
    ]
  }'
```

### 8.3 The Actual HTTP Response

```json
{
  "id": "msg_01ABC123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll search for a Slack messaging tool."
    },
    {
      "type": "server_tool_use",
      "id": "srvtoolu_01DEF456",
      "name": "tool_search_tool_regex",
      "input": {
        "query": "slack.*send|send.*message"
      }
    },
    {
      "type": "tool_search_tool_result",
      "tool_use_id": "srvtoolu_01DEF456",
      "content": {
        "type": "tool_search_tool_search_result",
        "tool_references": [
          { "type": "tool_reference", "tool_name": "slack_send_message" }
        ]
      }
    },
    {
      "type": "text",
      "text": "I found the Slack messaging tool. Let me send that message."
    },
    {
      "type": "tool_use",
      "id": "toolu_01GHI789",
      "name": "slack_send_message",
      "input": {
        "channel": "#deployments",
        "text": "Build succeeded"
      }
    }
  ],
  "model": "claude-sonnet-4-6",
  "stop_reason": "tool_use",
  "usage": {
    "input_tokens": 847,
    "output_tokens": 156,
    "server_tool_use": {
      "tool_search_requests": 1
    }
  }
}
```

### 8.4 What You Need to Handle

From a developer perspective, Tool Search adds very little to your existing tool use handling code. Here's a decision matrix:

| Block type | Your responsibility |
|---|---|
| `server_tool_use` | **Nothing.** This is handled API-side. Log it for debugging if you want. |
| `tool_search_tool_result` | **Nothing.** The API already expanded the references. Log for debugging. |
| `text` | Display to user (same as always). |
| `tool_use` | **Execute the tool and return the result** (same as always). |

The key takeaway: **your tool execution code does not change at all.** The only change is in how you construct the `tools` array (adding `defer_loading: true` and the search tool).

---

## 9. MCP Server Integration

MCP (Model Context Protocol) servers expose tools dynamically. Tool Search integrates with MCP via the `mcp_toolset` configuration.

### 9.1 Problem with MCP Without Tool Search

An MCP server like GitHub's might expose 91 tools. Loading all of them into context consumes ~17K tokens before Claude does anything. With 5 MCP servers, you can easily hit 50-100K tokens of tool definitions.

### 9.2 MCP with Tool Search

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 2048,
  "mcp_servers": [
    {
      "type": "url",
      "name": "github-server",
      "url": "https://mcp.github.com/sse"
    },
    {
      "type": "url",
      "name": "slack-server",
      "url": "https://mcp.slack.com/sse"
    }
  ],
  "tools": [
    {
      "type": "tool_search_tool_regex_20251119",
      "name": "tool_search_tool_regex"
    },
    {
      "type": "mcp_toolset",
      "mcp_server_name": "github-server",
      "default_config": {
        "defer_loading": true
      },
      "configs": {
        "search_repositories": {
          "defer_loading": false
        }
      }
    },
    {
      "type": "mcp_toolset",
      "mcp_server_name": "slack-server",
      "default_config": {
        "defer_loading": true
      }
    }
  ],
  "messages": [...]
}
```

**What this does:**

- **`default_config.defer_loading: true`** — All tools from the MCP server are deferred by default.
- **`configs.search_repositories.defer_loading: false`** — Override for a specific tool: `search_repositories` is loaded immediately (non-deferred).
- This gives you per-tool control over which MCP tools Claude sees upfront.

**Note:** MCP integration requires the beta header: `"anthropic-beta": "mcp-client-2025-11-20"`.

---

## 10. Custom Tool Search (Build Your Own)

If the built-in regex/BM25 search isn't sufficient, you can implement your own search logic — using embeddings, semantic search, a vector database, or any retrieval strategy.

### 10.1 Architecture

```
YOUR APP                    ANTHROPIC API                 CLAUDE
   │                             │                           │
   │  tools: [                   │                           │
   │    your_custom_search_tool, │                           │
   │    deferred tools...        │                           │
   │  ]                          │                           │
   │ ──────────────────────────► │ ────────────────────────► │
   │                             │                           │
   │                             │  Claude calls             │
   │                             │  your_custom_search_tool  │
   │                             │ ◄──────────────────────── │
   │                             │                           │
   │  ◄──────────────────────── │                           │
   │  (stop_reason: "tool_use")  │                           │
   │                             │                           │
   │  YOUR CODE runs custom      │                           │
   │  search (embeddings, etc.)  │                           │
   │                             │                           │
   │  Returns tool_result with   │                           │
   │  tool_reference blocks      │                           │
   │ ──────────────────────────► │                           │
   │                             │  API expands references   │
   │                             │  into full definitions    │
   │                             │ ────────────────────────► │
   │                             │                           │
   │                             │  Claude uses the tool     │
```

### 10.2 Custom Search Tool Definition

Define a normal tool that Claude will call when it needs to discover tools:

```json
{
  "name": "search_available_tools",
  "description": "Search for available tools by describing what you need. Returns tool references that will be loaded into your context.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {
        "type": "string",
        "description": "Natural language description of the tool you need"
      }
    },
    "required": ["query"]
  }
}
```

### 10.3 Returning `tool_reference` Blocks

When Claude calls your custom search tool, your application runs its own search logic and returns a `tool_result` that contains `tool_reference` content blocks:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01ABC123",
      "content": [
        { "type": "tool_reference", "tool_name": "slack_send_message" },
        { "type": "tool_reference", "tool_name": "slack_list_channels" }
      ]
    }
  ]
}
```

**Critical rule:** Every tool name in a `tool_reference` must have a corresponding tool definition in your `tools` array with `defer_loading: true`. If you reference a tool name that doesn't exist in your tools, the API returns a 400 error.

### 10.4 Custom Search Pseudocode

```
function handle_custom_search(query):
  // Step 1: Embed the query
  query_embedding = EMBED(query)  // Your embedding model

  // Step 2: Search your tool catalog
  // (You maintain a vector DB of tool name + description embeddings)
  results = VECTOR_DB.search(query_embedding, top_k=5)

  // Step 3: Return tool_reference blocks
  references = []
  for result in results:
    if result.similarity > 0.7:  // Your threshold
      references.append({
        type: "tool_reference",
        tool_name: result.tool_name
      })

  return {
    type: "tool_result",
    tool_use_id: original_tool_use_id,
    content: references
  }
```

### 10.5 Advantages of Custom Search

- **Semantic understanding:** Embeddings can match "notify the team" → `slack_send_message` even without keyword overlap.
- **Custom ranking:** You control relevance scoring, business rules, access control.
- **ZDR compatible:** Client-side implementations are eligible for Zero Data Retention.
- **Hybrid approaches:** Combine keyword search with semantic search, or use a re-ranker.

### 10.6 Disadvantage

- **Extra round-trip:** Unlike server-side Tool Search (which resolves within a single API call), custom search requires your app to handle the `tool_use` call, execute the search, and send a new request. This adds latency (one extra API round-trip).

---

## 11. Prompt Caching Interaction

### 11.1 How Caching Works With Tool Search

Prompt caching stores previously processed input tokens so they don't need to be re-processed on subsequent requests. Cached tokens cost significantly less (typically 90% less).

With Tool Search, deferred tool definitions are **excluded from the initial prompt entirely**. They are only added to context after Claude searches for them. This means:

- **Your system prompt and non-deferred tools remain cacheable.** They don't change between turns.
- **Deferred tools don't break the cache** because they were never in the prompt to begin with.
- **Discovered tools are added mid-conversation** and become part of the conversation history (which is also cacheable on subsequent turns).

### 11.2 Caching Example

```
Turn 1: [system_prompt + search_tool + critical_tools + user_msg_1]
         └── All of this gets cached ──────────────────────────┘

Turn 2: [system_prompt + search_tool + critical_tools + user_msg_1 + assistant_response_1 + user_msg_2]
         └── This prefix is a cache HIT ──────────────┘  └── Only this is new ──────────────────┘

Turn 3: Same pattern — growing prefix is cached
```

### 11.3 Adding Cache Breakpoints

Use `cache_control` to mark where cache breakpoints should go:

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "What about London?",
      "cache_control": { "type": "ephemeral" }
    }
  ]
}
```

---

## 12. Multi-Turn Conversations

### 12.1 Tool Reference Expansion Across Turns

A powerful feature: the API automatically expands `tool_reference` blocks throughout the **entire conversation history**. This means:

- **Turn 1:** Claude searches for `slack_send_message`, gets it loaded.
- **Turn 2:** The conversation history from Turn 1 (which includes the `tool_search_tool_result` with `tool_reference` blocks) is automatically expanded. Claude can see and use `slack_send_message` without re-searching.

### 12.2 What This Means for Your Code

When you send the conversation history back to the API, you include the `server_tool_use` and `tool_search_tool_result` blocks as-is (as part of the assistant's response). The API handles expansion. You do NOT need to manually inject tool definitions.

```json
{
  "messages": [
    { "role": "user", "content": "Send hello to #general on Slack" },
    {
      "role": "assistant",
      "content": [
        { "type": "server_tool_use", "id": "srvtoolu_01...", "name": "tool_search_tool_regex", "input": { "query": "slack" } },
        { "type": "tool_search_tool_result", "tool_use_id": "srvtoolu_01...", "content": { "type": "tool_search_tool_search_result", "tool_references": [{ "type": "tool_reference", "tool_name": "slack_send_message" }] } },
        { "type": "tool_use", "id": "toolu_01...", "name": "slack_send_message", "input": { "channel": "#general", "text": "hello" } }
      ]
    },
    {
      "role": "user",
      "content": [
        { "type": "tool_result", "tool_use_id": "toolu_01...", "content": "Message sent successfully" }
      ]
    },
    { "role": "user", "content": "Now send 'goodbye' to the same channel" }
  ]
}
```

On this second request, Claude can directly use `slack_send_message` without searching again — the API expanded the `tool_reference` from the history.

---

## 13. Error Handling

### 13.1 HTTP 400 Errors (Request Rejected)

These happen before any processing. The API rejects your request.

| Error | Cause | Fix |
|---|---|---|
| "All tools have defer_loading set. At least one tool must be non-deferred." | Every tool (including the search tool) is deferred | Make the search tool non-deferred. Add at least one non-deferred tool. |
| "Tool reference 'unknown_tool' has no corresponding tool definition" | A `tool_reference` points to a tool name not in your `tools` array | Ensure every referenced tool name exists in your `tools` array with its full definition. |

### 13.2 HTTP 200 With Tool Result Errors

These happen during processing. The API returns a 200 but the search failed.

| Error code | Meaning | What to do |
|---|---|---|
| `too_many_requests` | Rate limit on tool search operations | Implement backoff/retry. |
| `invalid_pattern` | Malformed regex (regex variant only) | Claude generated bad regex. This is rare; retry or improve system prompt guidance. |
| `pattern_too_long` | Regex exceeds 200 chars | Claude generated an overly complex pattern. Retry. |
| `unavailable` | Tool search service is temporarily down | Retry after a delay, or fall back to non-deferred tools. |

### 13.3 Silent Failure: No Tools Found

If Claude's search returns zero matches, the `tool_references` array will be empty. Claude then has to either:
- Try a different search query
- Tell the user it couldn't find a relevant tool
- Fall back to non-deferred tools

This is not an error per se — it just means the search didn't match anything. Improving tool descriptions and names helps prevent this.

---

## 14. Limits, Constraints, and Edge Cases

### 14.1 Hard Limits

| Parameter | Limit |
|---|---|
| Maximum tools in catalog | 10,000 |
| Search results per query | 3-5 tools |
| Regex pattern max length | 200 characters |
| Supported models | Sonnet 4.0+, Opus 4.0+ (no Haiku) |

### 14.2 Edge Cases

**Q: What if Claude needs more than 5 tools from a single search?**
A: Claude can call tool search multiple times in a single response, each with a different query. The API returns 3-5 tools per search call.

**Q: What if Claude searches and finds the wrong tools?**
A: Claude can search again with a refined query. It's not limited to one search per response.

**Q: What if all deferred tools have similar names?**
A: Use clear, distinct namespacing. Prefix tool names by service: `slack_send_message`, `teams_send_message`, `discord_send_message`. The description field is also searched, so make descriptions specific.

**Q: Can Claude use a discovered tool in the same API call?**
A: Yes. The search, expansion, and tool invocation all happen within a single request/response cycle.

**Q: What about tool use examples (few-shot prompting)?**
A: Tool Search is NOT compatible with tool use examples. If you need few-shot examples of tool usage, use standard (non-deferred) tool calling.

---

## 15. Optimization Best Practices

### 15.1 System Prompt Hints

Since Claude is "blind" to deferred tools, tell it what categories of tools exist:

```
GOOD system prompt:
"You have access to tools for: Slack messaging, GitHub repository management,
Jira issue tracking, weather data, and database queries. Use tool search to
find the right tool for each task."

BAD system prompt:
"You are a helpful assistant."
(Claude has no idea what tools might exist and may not think to search)
```

### 15.2 Tool Naming Conventions

Use consistent, descriptive names with service prefixes:

```
GOOD:                           BAD:
slack_send_message              send
slack_list_channels             list
github_create_pr                create
github_list_repos               get_data
jira_create_issue               make_thing
```

### 15.3 Tool Descriptions

Write descriptions with the search algorithm in mind:

```
GOOD: "Send a message to a Slack channel or direct message to a user. Supports
       threading, attachments, and rich text formatting."

BAD:  "Send msg"
```

Include synonyms and related terms that a user might use:

```
"Get current weather conditions, forecast, and temperature for a location.
 Also known as: climate data, meteorological information, weather report."
```

### 15.4 Non-Deferred Tool Selection

Keep these tools non-deferred:

1. Tools used in >50% of conversations
2. Safety or authentication tools
3. Tools that Claude needs for its core workflow (e.g., a file read tool in a coding agent)

### 15.5 Monitoring

Track which tools Claude discovers to identify:

- Tools that are always searched for → consider making them non-deferred
- Tools that are never found → check their descriptions
- Search queries that return zero results → improve tool metadata

The API response includes usage tracking:

```json
{
  "usage": {
    "server_tool_use": {
      "tool_search_requests": 2
    }
  }
}
```

---

## 16. Claude Code Specifics: How It Uses Tool Search Internally

Claude Code is Anthropic's CLI-based coding agent. It's a real-world, production example of Tool Search in action.

### 16.1 Before Tool Search (pre-v2.1.7)

- All built-in tools (Bash, Read, Edit, Write, Glob, Grep, Agent, etc.) were loaded into context on every message.
- This consumed ~14-16K tokens just for system tools.
- Each connected MCP server added its own tool definitions on top of that.
- With 5+ MCP servers, users lost 50-70% of their 200K context window before typing anything.

### 16.2 After Tool Search (v2.1.7+, expanded in v2.1.69)

- MCP tools are deferred when their definitions exceed 10% of the context window.
- As of v2.1.69, even built-in system tools (Bash, Read, Edit, etc.) are deferred.
- Only the ToolSearch tool itself is loaded upfront (~968 tokens for system tools).
- Claude discovers and loads tools on-demand as it needs them.

### 16.3 Configuration in Claude Code

Users can control this via settings:

```json
// In .claude/settings.json or similar

// Set the threshold for when MCP tools get deferred
// Default: 10% of context window
// "auto:5" means defer when tools exceed 5% of context
"ENABLE_TOOL_SEARCH": "auto:5"

// Disable tool search entirely (legacy behavior, loads everything upfront)
"ENABLE_TOOL_SEARCH": false

// Or add MCPSearch / ToolSearch to disallowedTools
```

### 16.4 The /context Command

Claude Code users can run `/context` to see how their tokens are distributed:

```
System prompt:     ~2,500 tokens  (1.3%)
System tools:        ~968 tokens  (0.5%)   ← With ToolSearch
MCP tools:         ~1,200 tokens  (0.6%)   ← Deferred, only search index
Conversation:     ~45,000 tokens  (22.5%)
Available:       ~150,332 tokens  (75.1%)
```

Compare to before Tool Search:

```
System prompt:     ~2,500 tokens  (1.3%)
System tools:    ~14,500 tokens  (7.3%)    ← All loaded upfront
MCP tools:       ~55,000 tokens  (27.5%)   ← All loaded upfront
Conversation:    ~45,000 tokens  (22.5%)
Available:       ~83,000 tokens  (41.5%)   ← Much less room
```

---

## 17. Glossary

| Term | Definition |
|---|---|
| **Context window** | The total token capacity Claude can process in one request (~200K tokens for most models). Everything — system prompt, tools, messages, and Claude's response — must fit within this window. |
| **Deferred tool** | A tool definition marked with `defer_loading: true`. Stored in the API's catalog but not loaded into Claude's context until discovered via search. |
| **Non-deferred tool** | A tool definition without `defer_loading` (or with it set to `false`). Loaded into Claude's context on every request, visible immediately. |
| **Tool catalog** | The API-side index of all deferred tools' metadata (names, descriptions, argument names, argument descriptions). Built fresh from your `tools` array on each request. |
| **Tool reference** | A lightweight pointer (`{ "type": "tool_reference", "tool_name": "..." }`) that tells the API to expand a deferred tool's full definition into Claude's context. |
| **Reference expansion** | The process where the API takes `tool_reference` blocks and replaces them with full tool definitions in Claude's context. Happens automatically and transparently. |
| **server_tool_use** | A response block indicating Claude invoked a server-side tool (like tool search). You do NOT execute these — the API handles them. |
| **tool_use** | A response block indicating Claude wants YOU to execute a tool. This is the standard tool invocation you're already familiar with. |
| **BM25** | Best Matching 25. A ranking function used in information retrieval, based on term frequency and document length normalization. The non-regex variant of Tool Search uses this. |
| **MCP** | Model Context Protocol. An open protocol for connecting AI models to external tools and data sources via standardized servers. |
| **Prompt caching** | An API feature where previously processed input tokens are cached and reused at a lower cost on subsequent requests. |
| **`mcp_toolset`** | A special tool type for configuring MCP server tools in the API, including per-tool `defer_loading` settings. |

---

## Appendix: Quick Reference Cheat Sheet

### Minimum Viable Tool Search Request

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "tools": [
    { "type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex" },
    { "name": "my_tool", "description": "...", "input_schema": {...}, "defer_loading": true }
  ],
  "messages": [{ "role": "user", "content": "..." }]
}
```

### Response Block Types to Handle

| Block type | Action required |
|---|---|
| `server_tool_use` | None (log for debugging) |
| `tool_search_tool_result` | None (log for debugging) |
| `text` | Display to user |
| `tool_use` | Execute the tool, return `tool_result` |

### Checklist Before Deploying

- [ ] Tool Search tool is included and NOT deferred
- [ ] At least one other tool is non-deferred
- [ ] 3-5 most-used tools are non-deferred
- [ ] System prompt mentions what categories of tools are available
- [ ] Tool names use consistent service prefixes
- [ ] Tool descriptions are detailed and include synonyms
- [ ] Error handling covers both 400 and 200-with-error cases
- [ ] Conversation history preserves `server_tool_use` and `tool_search_tool_result` blocks
- [ ] Monitoring tracks `tool_search_requests` in usage

---

*Source: Anthropic API Documentation — https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool*
*Anthropic Engineering Blog — https://www.anthropic.com/engineering/advanced-tool-use*