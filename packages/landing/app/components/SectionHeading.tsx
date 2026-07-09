type SectionHeadingProps = {
  lead: string;
  rest: string;
  dark?: boolean;
};

// Two-tone inline section heading: emphasized lead sentence, slate rest.
export function SectionHeading({ lead, rest, dark = false }: SectionHeadingProps) {
  return (
    <h2 className="max-w-[840px] text-xl lg:text-2xl leading-[1.4] tracking-[-0.01em]">
      <em className={`font-normal not-italic ${dark ? 'text-white' : 'text-[#061b31]'}`}>{lead}</em>{' '}
      <span className={dark ? 'text-white/40' : 'text-[#5b7290]'}>{rest}</span>
    </h2>
  );
}
