# API Calls Reference

Exhaustive list of all API calls defined in `packages/web/app/components/messages/services/api.ts`.

## Auth / User

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 1 | `getUserPictureByEmail` | GET | `/auth/{email}/pic` |
| 2 | `getUserPictureByEmailCached` | — | Cached wrapper around `getUserPictureByEmail` |
| 3 | `getFinalUserInfo` | GET | `/projects/{namespace}/users/{id}` |

## Messages / Media

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 4 | `setMediaUploaded` | POST | `/projects/{namespace}/media` |
| 5 | `getFileDescription` | GET | `/projects/{namespace}/media/{id}/description` |

## Business Info

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 6 | `getBusinessInfo` | GET | `/projects/{namespace}/business` |

## Conversation / Messaging

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 7 | `getMessagesFromSender` | GET | `/projects/{namespace}/conversations/{sender}` |
| 8 | `getMessagesFromSenderPaginated` | GET | `/projects/{namespace}/conversations/{sender}/paginated` |
| 9 | `setChatbotActiveState` | POST | `/projects/{namespace}/conversations/{sender}/chatbot` |
| 10 | `createNote` | POST | `/projects/{namespace}/conversations/{userID}/notes` |
| 11 | `getNotes` | GET | `/projects/{namespace}/conversations/{userID}/notes` |
| 12 | `deleteNote` | DELETE | `/projects/{namespace}/conversations/{userID}/notes/{noteID}` |
| 13 | `getActivity` | GET | `/projects/{namespace}/conversations/{userID}/activity` |
| 14 | `updateChatAssignee` | POST | `/projects/{namespace}/conversations/{userID}/assignee` |
| 15 | `updateChatStatus` | POST | `/projects/{namespace}/conversations/{userID}/status` |

## Send Messages

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 16 | `sendMessage` | POST | `/messages/message` |
| 17 | `fixInquiry` | POST | `/messages/inquiry` |
| 18 | `sendTestMessage` | POST | `/messages/test` |
| 19 | `deleteConversation` | DELETE | `/messages/{namespace}/{from}` |
| 20 | `sendMediaTestMessage` | POST | `/messages/test` |
| 21 | `sendMediaMessage` | POST | `/messages/message` |

## Last Messages / Inbox

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 22 | `getLastMessages` | GET | `/projects/{namespace}/last-messages` |
| 23 | `getLastMessagesPaginated` | GET | `/projects/{namespace}/last-messages/paginated` |
| 24 | `getLastMessagesDelta` | GET | `/projects/{namespace}/last-messages/delta` |
| 25 | `getDeletedChats` | GET | `/projects/{namespace}/last-messages/deleted` |
| 26 | `readConversation` | POST | `/projects/{namespace}/conversations/{phone}/read` |

## Orders

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 27 | `createOrder` | POST | `/projects/{namespace}/orders` |
| 28 | `getUserOrders` | GET | `/projects/{namespace}/conversations/{userID}/orders` |
| 29 | `getOrderReceipt` | GET | `/projects/{namespace}/orders/{orderId}/receipt` |

## Storefront

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 30 | `getStoreData` | GET | `/store/{key}` |

## Project Settings

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 31 | `getProjectInnerSettings` | GET | `/projects/{namespace}/settings` |
| 32 | `getProjectInnerSettingsCached` | — | Cached wrapper around `getProjectInnerSettings` |
| 33 | `getProjectCollaborators` | GET | `/projects/{namespace}/collaborators` |

## Payments

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 34 | `createPaymentLink` | POST | `/projects/{namespace}/conversations/{userID}/payment-link` |

## AI Text Helpers

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 35 | `makeFriendly` | POST | `/projects/{namespace}/ai/friendly` |
| 36 | `makeFormal` | POST | `/projects/{namespace}/ai/formal` |
| 37 | `fixGrammar` | POST | `/projects/{namespace}/ai/grammar` |
| 38 | `answerQuestion` | POST | `/projects/{namespace}/ai/answer` |
