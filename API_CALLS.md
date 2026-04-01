# API Calls Reference

Exhaustive list of all API calls defined in `packages/web/app/components/messages/services/api.ts`.

## Auth / User

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 1 | `getLoginUrl` | — | `/auth/google` |
| 2 | `getUserInfo` | GET | `/auth/user/{uid}/info` |
| 3 | `setUserInfo` | POST | `/auth/user/{uid}/info` |
| 4 | `updateUserPicture` | POST | `/auth/user/{uid}/picture` |
| 5 | `updateUserPictureByEmail` | POST | `/auth/{email}/pic` |
| 6 | `getUserPictureByEmail` | GET | `/auth/{email}/pic` |
| 7 | `getFinalUserInfo` | GET | `/projects/{namespace}/users/{id}` |
| 8 | `getUserPictureByEmailCached` | — | Cached wrapper around `getUserPictureByEmail` |
| 9 | `checkPhoneInDB` | GET | `/auth/phone/{phone}` |

## Projects

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 10 | `fetchProjects` | GET | `/projects/{email}` |
| 11 | `createProject` | POST | `/projects/{email}` |
| 12 | `synchBatch` | POST | `/projects/{namespace}/drive/sync` |

## Records / RAG

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 13 | `fetchRecords` | GET | `/projects/{namespace}/records` |
| 14 | `fetchRecordDetails` | GET | `/projects/{namespace}/records/{fileId}` |
| 15 | `searchRecords` | GET | `/projects/{namespace}/records/search` |
| 16 | `fetchFilesStatus` | GET | `/projects/{namespace}/records/status` |

## Messages / Media

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 17 | `sendMessages` | POST | `/projects/{namespace}/messages` |
| 18 | `setMediaUploaded` | POST | `/projects/{namespace}/media` |
| 19 | `getMediaUploaded` | GET | `/projects/{namespace}/media` |
| 20 | `updateMediaFolder` | PUT | `/projects/{namespace}/media/{id}` |
| 21 | `getFileDescription` | GET | `/projects/{namespace}/media/{id}/description` |

## Business Info

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 22 | `getBusinessInfo` | GET | `/projects/{namespace}/business` |
| 23 | `getBusinessInfoCached` | — | Cached wrapper around `getBusinessInfo` |
| 24 | `getCalendarDataByYear` | GET | `/projects/{namespace}/calendar/{year}` |
| 25 | `setBusinessInfo` | POST | `/projects/{namespace}/business` |

## Conversation / Messaging

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 26 | `getMessagesFromSender` | GET | `/projects/{namespace}/conversations/{sender}` |
| 27 | `getMessagesFromSenderPaginated` | GET | `/projects/{namespace}/conversations/{sender}/paginated` |
| 28 | `setChatbotActiveState` | POST | `/projects/{namespace}/conversations/{sender}/chatbot` |
| 29 | `createNote` | POST | `/projects/{namespace}/conversations/{userID}/notes` |
| 30 | `getNotes` | GET | `/projects/{namespace}/conversations/{userID}/notes` |
| 31 | `deleteNote` | DELETE | `/projects/{namespace}/conversations/{userID}/notes/{noteID}` |
| 32 | `getActivity` | GET | `/projects/{namespace}/conversations/{userID}/activity` |
| 33 | `updateChatAssignee` | POST | `/projects/{namespace}/conversations/{userID}/assignee` |
| 34 | `updateChatStatus` | POST | `/projects/{namespace}/conversations/{userID}/status` |

## Tags

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 35 | `getTags` | GET | `/projects/{namespace}/tags` |
| 36 | `createTag` | POST | `/projects/{namespace}/tags` |
| 37 | `deleteTag` | DELETE | `/projects/{namespace}/tags/{tagID}` |
| 38 | `setChatTags` | POST | `/projects/{namespace}/conversations/{userID}/tags` |

## Quick Replies

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 39 | `getQuickReplies` | GET | `/projects/{namespace}/quick-replies` |
| 40 | `createQuickReply` | POST | `/projects/{namespace}/quick-replies` |
| 41 | `deleteQuickReply` | DELETE | `/projects/{namespace}/quick-replies/{id}` |

## Send Messages

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 42 | `sendMessage` | POST | `/projects/{namespace}/send` |
| 43 | `fixInquiry` | POST | `/projects/{namespace}/fix-inquiry` |
| 44 | `sendTestMessage` | POST | `/projects/{namespace}/send-test` |
| 45 | `deleteConversation` | DELETE | `/projects/{namespace}/conversations/{from}` |
| 46 | `sendMediaTestMessage` | POST | `/projects/{namespace}/send-test-media` |
| 47 | `sendMediaMessage` | POST | `/projects/{namespace}/send-media` |

## Last Messages / Inbox

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 48 | `getLastMessages` | GET | `/projects/{namespace}/last-messages` |
| 49 | `getLastMessagesPaginated` | GET | `/projects/{namespace}/last-messages/paginated` |
| 50 | `getLastMessagesDelta` | GET | `/projects/{namespace}/last-messages/delta` |
| 51 | `getDeletedChats` | GET | `/projects/{namespace}/last-messages/deleted` |
| 52 | `readConversation` | POST | `/projects/{namespace}/conversations/{phone}/read` |

## Orders

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 53 | `addTrackingInfoToOrder` | POST | `/projects/{namespace}/orders/{orderId}/tracking` |
| 54 | `updateOrderStatus` | POST | `/projects/{namespace}/orders/{orderId}/status` |
| 55 | `createOrder` | POST | `/projects/{namespace}/orders` |
| 56 | `getOrders` | GET | `/projects/{namespace}/orders` |
| 57 | `getCRM` | GET | `/projects/{namespace}/crm` |
| 58 | `getUserOrders` | GET | `/projects/{namespace}/conversations/{userID}/orders` |
| 59 | `getOrderReceipt` | GET | `/projects/{namespace}/orders/{orderId}/receipt` |

## Integrations

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 60 | `getPaymentIntegrationStatus` | GET | `/projects/{namespace}/integrations/payment` |
| 61 | `getMercadoPagoRedirectURL` | GET | `/projects/{namespace}/integrations/payment/redirect` |
| 62 | `getWhatsAppIntegrationStatus` | GET | `/projects/{namespace}/integrations/whatsapp` |
| 63 | `getWhatsAppRedirectURL` | GET | `/projects/{namespace}/integrations/whatsapp/redirect` |
| 64 | `getProjectIntegrations` | GET | `/projects/{namespace}/integrations` |
| 65 | `connectWhatsAppIntegration` | POST | `/projects/{namespace}/integrations/whatsapp` |
| 66 | `getShopifyOAuthUrl` | GET | `/projects/{namespace}/integrations/shopify/oauth` |
| 67 | `scrapeShopifyProducts` | POST | `/scrape/shopify` |
| 68 | `importShopifyProducts` | POST | `/projects/{namespace}/integrations/shopify/import-products` |
| 69 | `importShopifyOrders` | POST | `/projects/{namespace}/integrations/shopify/import-orders` |
| 70 | `scrapeWebsite` | POST | `/scrape/website` |

## Payments / Checkout

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 71 | `validatePayment` | POST | `/payments/{key}/validate` |
| 72 | `getCheckout` | GET | `/payments/{key}/checkout` |
| 73 | `getPaymentDetail` | GET | `/payments/{key}/detail` |
| 74 | `pay` | POST | `/payments/{key}/pay` |

## Push Notifications

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 75 | `subscribeToPushNotifications` | POST | `/projects/{namespace}/push/subscribe` |
| 76 | `unsubscribeFromPushNotifications` | POST | `/projects/{namespace}/push/unsubscribe` |

## Storefront / E-Commerce

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 77 | `getStoreData` | GET | `/store/{key}` |
| 78 | `getProductsList` | GET | `/store/{key}/products` |
| 79 | `getProductById` | GET | `/store/{key}/products/{productId}` |
| 80 | `getEcommerceBusinessInfo` | GET | `/store/{key}/business` |
| 81 | `getOrderPersonalization` | GET | `/store/{key}/personalization` |
| 82 | `setOrderPersonalization` | POST | `/store/{key}/personalization` |

## Metrics

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 83 | `getMetrics` | GET | `/projects/{namespace}/metrics` |

## Project Settings

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 84 | `getProjectInnerSettings` | GET | `/projects/{namespace}/settings` |
| 85 | `getProjectInnerSettingsCached` | — | Cached wrapper around `getProjectInnerSettings` |
| 86 | `getProjectCollaborators` | GET | `/projects/{namespace}/collaborators` |
| 87 | `setProjectInnerSettings` | POST | `/projects/{namespace}/settings` |
| 88 | `getScheduleTemplates` | GET | `/projects/{namespace}/schedule-templates` |
| 89 | `saveScheduleTemplate` | POST | `/projects/{namespace}/schedule-templates` |
| 90 | `deleteScheduleTemplate` | DELETE | `/projects/{namespace}/schedule-templates/{id}` |

## Billing

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 91 | `createBillingAddress` | POST | `/billing/{email}/addresses` |
| 92 | `getBillingAddresses` | GET | `/billing/{email}/addresses` |
| 93 | `deleteBillingAddress` | DELETE | `/billing/{email}/addresses/{id}` |
| 94 | `getPaymentCards` | GET | `/billing/{email}/cards` |
| 95 | `createPaymentMethod` | POST | `/billing/{email}/cards` |
| 96 | `deletePaymentCard` | DELETE | `/billing/{email}/cards/{id}` |
| 97 | `payWithCard` | POST | `/billing/{email}/pay` |
| 98 | `getPayments` | GET | `/billing/{email}/payments` |
| 99 | `getBillingFees` | GET | `/projects/{namespace}/billing/fees` |
| 100 | `calculateBillingFees` | POST | `/projects/{namespace}/billing/calculate` |
| 101 | `getPurchasedCredits` | GET | `/projects/{namespace}/billing/credits` |

## Shopping Cart

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 102 | `getShoppingCart` | GET | `/projects/{namespace}/conversations/{userID}/cart` |
| 103 | `addToShoppingCart` | POST | `/projects/{namespace}/conversations/{userID}/cart` |
| 104 | `removeFromShoppingCart` | DELETE | `/projects/{namespace}/conversations/{userID}/cart/{itemId}` |
| 105 | `createPaymentLink` | POST | `/projects/{namespace}/conversations/{userID}/payment-link` |

## AI Text Helpers

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 106 | `makeFriendly` | POST | `/projects/{namespace}/ai/friendly` |
| 107 | `makeFormal` | POST | `/projects/{namespace}/ai/formal` |
| 108 | `fixGrammar` | POST | `/projects/{namespace}/ai/grammar` |
| 109 | `answerQuestion` | POST | `/projects/{namespace}/ai/answer` |

## Payment Verification

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 110 | `verifyPayment` | POST | `/payments/verify` |

## Store Cart (Public)

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 111 | `getStoreCart` | GET | `/store/{key}/cart/{sessionId}` |
| 112 | `addStoreCartItem` | POST | `/store/{key}/cart/{sessionId}` |
| 113 | `updateStoreCartItem` | PUT | `/store/{key}/cart/{sessionId}/{itemId}` |
| 114 | `removeStoreCartItem` | DELETE | `/store/{key}/cart/{sessionId}/{itemId}` |

## Store Session

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 115 | `saveStoreSession` | POST | `/store/{key}/session` |
| 116 | `getStoreSession` | GET | `/store/{key}/session/{sessionId}` |
| 117 | `getStoreContactInfo` | GET | `/store/{key}/contact` |

## Batch Progress

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 118 | `getBatchProgress` | GET | `/projects/{namespace}/batch/{batchWorkloadID}` |

## Audit

| # | Function | Method | Endpoint |
|---|----------|--------|----------|
| 119 | `initiateChatAudit` | POST | `/projects/{namespace}/audit` |
| 120 | `getChatAuditReport` | GET | `/projects/{namespace}/audit/{auditId}` |
