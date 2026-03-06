# LLM Graph Builder - Web App

## UI Components

- Always use shadcn/ui components instead of creating new ones from scratch
- shadcn components are located in `components/ui/`
- To add new shadcn components: `npx shadcn@latest add <component-name>`
- Available components: https://ui.shadcn.com/docs/components
- Note: This app uses shadcn with @base-ui/react (not @radix-ui)

### Installed shadcn Components

- Alert Dialog (`components/ui/alert-dialog.tsx`)
- Badge (`components/ui/badge.tsx`)
- Button (`components/ui/button.tsx`)
- Card (`components/ui/card.tsx`)
- Checkbox (`components/ui/checkbox.tsx`)
- Combobox (`components/ui/combobox.tsx`)
- Dropdown Menu (`components/ui/dropdown-menu.tsx`)
- Field (`components/ui/field.tsx`)
- Input (`components/ui/input.tsx`)
- Input Group (`components/ui/input-group.tsx`)
- Label (`components/ui/label.tsx`)
- Select (`components/ui/select.tsx`)
- Separator (`components/ui/separator.tsx`)
- Textarea (`components/ui/textarea.tsx`)

## TypeScript

- Never use `any` type - always use proper explicit TypeScript types
- Never disable ESLint rules (no eslint-disable comments or config modifications)

## Internationalization

- Never forget to add translations when adding user-facing text

## Graph Schema

- Zod schemas are defined in `app/schemas/graph.schema.ts`
- Node types: `agent`, `agent_decision`
- All preconditions in an edge must have the same type

### Good practices

- **Important**: Never use "!important" in CSS, and do not use it in tailwind.
