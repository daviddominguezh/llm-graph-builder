# Message key usage map (`messages/en.json`)

Audit ledger for the landing copy catalog. **Rules:**

1. Every key may be used in **at most one place** across the site — never repeated.
2. When you wire a key into a component, move it into the *Used* table with its exact location.
3. When you add a key to `en.json`, add it to the *Not yet used* list until it is placed.
4. Keys are tracked at the leaf level (`title` / `description` / `cta` / `intro`) because a
   component may consume only part of an item (e.g. bento cards render no CTA).

All key paths below are relative to the `landing.` root namespace.

## Used

| Key | Component | Section / element |
| --- | --- | --- |
| `hero.title` | `Hero.tsx` | Hero heading — white lead sentence |
| `hero.description` | `Hero.tsx` | Hero heading — gray continuation |
| `hero.cta` | `Hero.tsx` | Hero primary CTA button |
| `whatIsOpenflow.title` | `SolutionsBento.tsx` | Full-width brand bento card — h2 |
| `whatIsOpenflow.description` | `SolutionsBento.tsx` | Full-width brand bento card — paragraph |
| `whatIsOpenflow.cta` | `SolutionsBento.tsx` | Full-width brand bento card — button |
| `families.foundation.title` | `SolutionsBento.tsx` | Section heading — lead |
| `families.foundation.intro` | `SolutionsBento.tsx` | Section heading — rest |
| `families.foundation.items.multiTenancy.title` | `StoryScroll.tsx` | Story card 3 — title |
| `families.foundation.items.multiTenancy.description` | `StoryScroll.tsx` | Story card 3 — description |
| `families.foundation.items.multiTenancy.cta` | `StoryScroll.tsx` | Story card 3 — CTA link |
| `families.foundation.items.multiChannel.title` | `SolutionsBento.tsx` | Channel-chips bento card — title |
| `families.foundation.items.multiChannel.description` | `SolutionsBento.tsx` | Channel-chips bento card — description |
| `families.foundation.items.deployToYourWebsite.title` | `SolutionsBento.tsx` | Code-snippet bento card — title |
| `families.foundation.items.deployToYourWebsite.description` | `SolutionsBento.tsx` | Code-snippet bento card — description |
| `families.foundation.items.expensesControlPerTenant.title` | `SolutionsBento.tsx` | Billing bento card — title |
| `families.foundation.items.expensesControlPerTenant.description` | `SolutionsBento.tsx` | Billing bento card — description |
| `families.studio.items.agentBuilder.title` | `StoryScroll.tsx` | Story card 1 — title |
| `families.studio.items.agentBuilder.description` | `StoryScroll.tsx` | Story card 1 — description |
| `families.studio.items.agentBuilder.cta` | `StoryScroll.tsx` | Story card 1 — CTA link |
| `families.studio.items.agentOrchestration.title` | `CaseStudies.tsx` | Deck card 2 (Studio) — title |
| `families.studio.items.agentOrchestration.description` | `CaseStudies.tsx` | Deck card 2 (Studio) — description |
| `families.studio.items.agentOrchestration.cta` | `CaseStudies.tsx` | Deck card 2 (Studio) — CTA |
| `families.toolbox.title` | `DevelopersBand.tsx` | Connect block h2 — white lead |
| `families.toolbox.intro` | `DevelopersBand.tsx` | Connect block h2 — muted rest |
| `families.toolbox.items.connectAnyMcp.title` | `StoryScroll.tsx` | Story card 2 — title |
| `families.toolbox.items.connectAnyMcp.description` | `StoryScroll.tsx` | Story card 2 — description |
| `families.toolbox.items.connectAnyMcp.cta` | `StoryScroll.tsx` | Story card 2 — CTA link |
| `families.knowledge.items.multimodalRag.title` | `CaseStudies.tsx` | Deck card 3 (Knowledge) — title |
| `families.knowledge.items.multimodalRag.description` | `CaseStudies.tsx` | Deck card 3 (Knowledge) — description |
| `families.knowledge.items.multimodalRag.cta` | `CaseStudies.tsx` | Deck card 3 (Knowledge) — CTA |
| `families.revenue.items.payments.title` | `SolutionsBento.tsx` | Product-cards bento card — title |
| `families.revenue.items.payments.description` | `SolutionsBento.tsx` | Product-cards bento card — description |
| `families.revenue.items.leadScoring.title` | `CaseStudies.tsx` | Deck card 5 (Revenue) — title |
| `families.revenue.items.leadScoring.description` | `CaseStudies.tsx` | Deck card 5 (Revenue) — description |
| `families.revenue.items.leadScoring.cta` | `CaseStudies.tsx` | Deck card 5 (Revenue) — CTA |
| `families.engine.title` | `GlobalScale.tsx` | Section heading — lead |
| `families.engine.intro` | `GlobalScale.tsx` | Section heading — rest |
| `families.engine.items.scheduledExecution.title` | `CaseStudies.tsx` | Deck card 4 (Engine) — title |
| `families.engine.items.scheduledExecution.description` | `CaseStudies.tsx` | Deck card 4 (Engine) — description |
| `families.engine.items.scheduledExecution.cta` | `CaseStudies.tsx` | Deck card 4 (Engine) — CTA |
| `families.controlRoom.items.observability.title` | `CaseStudies.tsx` | Deck card 1 (Control room) — title |
| `families.controlRoom.items.observability.description` | `CaseStudies.tsx` | Deck card 1 (Control room) — description |
| `families.controlRoom.items.observability.cta` | `CaseStudies.tsx` | Deck card 1 (Control room) — CTA |
| `families.controlRoom.items.conversationsDashboard.title` | `SolutionsBento.tsx` | Chat-inbox bento card — title |
| `families.controlRoom.items.conversationsDashboard.description` | `SolutionsBento.tsx` | Chat-inbox bento card — description |
| `families.waysToUse.title` | `DevelopersBand.tsx` | Integration-paths h2 — white lead |
| `families.waysToUse.intro` | `DevelopersBand.tsx` | Integration-paths h2 — muted rest |
| `families.waysToUse.items.payAsYouGoPricing.title` | `SolutionsBento.tsx` | Revenue-sparkline bento card — title |
| `families.waysToUse.items.payAsYouGoPricing.description` | `SolutionsBento.tsx` | Revenue-sparkline bento card — description |

## Not yet used

CTAs of items placed on bento cards (bento cards render no CTA element):

- `families.foundation.items.multiChannel.cta`
- `families.foundation.items.deployToYourWebsite.cta`
- `families.foundation.items.expensesControlPerTenant.cta`
- `families.revenue.items.payments.cta`
- `families.controlRoom.items.conversationsDashboard.cta`
- `families.waysToUse.items.payAsYouGoPricing.cta`

Family headers with no section assigned yet:

- `families.studio.title`, `families.studio.intro`
- `families.knowledge.title`, `families.knowledge.intro`
- `families.revenue.title`, `families.revenue.intro`
- `families.controlRoom.title`, `families.controlRoom.intro`

Items with no placement yet (`title` + `description` + `cta` each):

- `families.studio.items.workflowBuilder`
- `families.studio.items.anyLlmProvider`
- `families.studio.items.agentSkills`
- `families.studio.items.versionControl`
- `families.toolbox.items.outOfTheBoxMcps`
- `families.toolbox.items.webSearch`
- `families.toolbox.items.httpRequests`
- `families.toolbox.items.externalSql`
- `families.toolbox.items.browserAutomation`
- `families.toolbox.items.codeSandboxes`
- `families.knowledge.items.kvStores`
- `families.knowledge.items.userMemory`
- `families.revenue.items.formIntegration`
- `families.revenue.items.bookingSystem`
- `families.engine.items.longRunningAgents`
- `families.engine.items.webhookTriggers`
- `families.controlRoom.items.evals`
- `families.waysToUse.items.noCodeLowCodeApi`
- `families.waysToUse.items.claudeCodeMcp`

## Duplicates

None — and none allowed. If you need the same copy twice, that is a signal to
add a distinct key with intent-specific wording instead.
