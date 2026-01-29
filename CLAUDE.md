# LLM Graph Builder

## Project Structure

- `apps/web` - Next.js frontend application

## Development Guidelines

### UI Components

- Always use shadcn/ui components instead of creating new ones from scratch
- shadcn components are located in `apps/web/components/ui/`
- To add new shadcn components: `npx shadcn@latest add <component-name>`
- Available components: https://ui.shadcn.com/docs/components

### TypeScript

- Never use `any` type - always use proper explicit TypeScript types
- Never disable ESLint rules (no eslint-disable comments or config modifications)

### Internationalization

- Never forget to add translations when adding user-facing text
