# LLM Graph Builder - Web App

## UI Components

- Always use shadcn/ui components instead of creating new ones from scratch
- shadcn components are located in `components/ui/`
- To add new shadcn components: `npx shadcn@latest add <component-name>`
- Available components: https://ui.shadcn.com/docs/components

### Installed shadcn Components

- Button (`components/ui/button.tsx`)
- Checkbox (`components/ui/checkbox.tsx`)
- Input (`components/ui/input.tsx`)
- Textarea (`components/ui/textarea.tsx`)
- Select (`components/ui/select.tsx`)
- Label (`components/ui/label.tsx`)
- Card (`components/ui/card.tsx`)
- Separator (`components/ui/separator.tsx`)

## TypeScript

- Never use `any` type - always use proper explicit TypeScript types
- Never disable ESLint rules (no eslint-disable comments or config modifications)

## Internationalization

- Never forget to add translations when adding user-facing text

## Graph Schema

- Zod schemas are defined in `app/schemas/graph.schema.ts`
- Node types: `agent`, `agent_decision`
- All preconditions in an edge must have the same type
