const TECH = [
  'Node.js',
  'TypeScript',
  'Next.js 16',
  'React 19',
  'TailwindCSS 4',
  'Vercel AI SDK',
  'OpenRouter',
  'Supabase',
  'Docker',
  'Zod',
] as const;

export function TechStack() {
  return (
    <section className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Tech Stack</h2>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {TECH.map((name) => (
            <span
              key={name}
              className="rounded-lg border border-border bg-background px-3 py-1.5 font-mono text-sm text-muted-foreground"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
