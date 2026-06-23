/* Tool descriptions */
export const SEARCH_TOOL_DESC =
  'Search the web for current information on any topic. Use for news, facts, or data beyond your knowledge cutoff. Returns snippets and source URLs.';
export const EXTRACT_TOOL_DESC =
  'Extract content from URLs. Returns raw page content in markdown or text format.';
export const CRAWL_TOOL_DESC =
  'Crawl a website starting from a URL. Extracts content from pages with configurable depth and breadth.';
export const MAP_TOOL_DESC =
  "Map a website's structure. Returns a list of URLs found starting from the base URL.";

/* search params */
export const SEARCH_QUERY_DESC = 'Search query';
export const SEARCH_MAX_RESULTS_DESC = 'The maximum number of search results to return';
export const SEARCH_DEPTH_DESC =
  "The depth of the search. 'basic' for generic results, 'advanced' for more thorough search, 'fast' for optimized low latency with high relevance, 'ultra-fast' for prioritizing latency above all else";
export const SEARCH_TOPIC_DESC =
  'The category of the search. This will determine which of our agents will be used for the search';
export const SEARCH_TIME_RANGE_DESC =
  'The time range back from the current date to include in the search results';
export const SEARCH_INCLUDE_IMAGES_DESC = 'Include a list of query-related images in the response';
export const SEARCH_INCLUDE_IMAGE_DESCRIPTIONS_DESC =
  'Include a list of query-related images and their descriptions in the response';
export const SEARCH_INCLUDE_RAW_CONTENT_DESC =
  'Include the cleaned and parsed HTML content of each search result';
export const SEARCH_INCLUDE_DOMAINS_DESC =
  'A list of domains to specifically include in the search results, if the user asks to search on specific sites set this to the domain of the site';
export const SEARCH_EXCLUDE_DOMAINS_DESC =
  'List of domains to specifically exclude, if the user asks to exclude a domain set this to the domain of the site';
export const SEARCH_COUNTRY_DESC =
  "Boost search results from a specific country. Must be a full country name (e.g., 'United States', 'Japan', 'Germany'). ISO country codes are not supported. Available only if topic is general.";
export const SEARCH_INCLUDE_FAVICON_DESC = 'Whether to include the favicon URL for each result';
export const SEARCH_START_DATE_DESC =
  'Will return all results after the specified start date (format YYYY-MM-DD).';
export const SEARCH_END_DATE_DESC =
  'Will return all results before the specified end date (format YYYY-MM-DD).';
export const SEARCH_EXACT_MATCH_DESC =
  'Only return results containing the exact phrase(s) in quotes in your query';

/* extract params */
export const EXTRACT_URLS_DESC = 'List of URLs to extract content from';
export const EXTRACT_DEPTH_DESC = "Use 'advanced' for LinkedIn, protected sites, or tables/embedded content";
export const EXTRACT_INCLUDE_IMAGES_DESC = 'Include images from pages';
export const EXTRACT_FORMAT_DESC = 'Output format';
export const EXTRACT_INCLUDE_FAVICON_DESC = 'Include favicon URLs';
export const EXTRACT_QUERY_DESC = 'Query to rerank content chunks by relevance';

/* crawl + map shared params */
export const CRAWL_URL_DESC = 'The root URL to begin the crawl';
export const MAP_URL_DESC = 'The root URL to begin the mapping';
export const MAX_DEPTH_DESC =
  'Max depth of the crawl. Defines how far from the base URL the crawler can explore.';
export const MAX_BREADTH_DESC = 'Max number of links to follow per level of the tree (i.e., per page)';
export const LIMIT_DESC = 'Total number of links the crawler will process before stopping';
export const INSTRUCTIONS_DESC =
  'Natural language instructions for the crawler. Specify which types of pages to return.';
export const SELECT_PATHS_DESC =
  'Regex patterns to select only URLs with specific path patterns (e.g., /docs/.*, /api/v1.*)';
export const SELECT_DOMAINS_DESC =
  'Regex patterns to restrict crawling to specific domains or subdomains (e.g., ^docs\\.example\\.com$)';
export const ALLOW_EXTERNAL_DESC = 'Whether to return external links in the final response';
export const CRAWL_EXTRACT_DEPTH_DESC =
  'Advanced extraction retrieves more data, including tables and embedded content, with higher success but may increase latency';
export const CRAWL_FORMAT_DESC =
  'The format of the extracted web page content: markdown or plain text (text may increase latency).';
export const CRAWL_INCLUDE_FAVICON_DESC = 'Whether to include the favicon URL for each result';
