import Image from 'next/image';

import { SectionHeading } from './SectionHeading';

const SCALE_POINTS = [
  { value: '135+', label: 'countries with active agent deployments' },
  { value: '99.999%', label: 'historical uptime for OpenFlow services' },
  { value: '47', label: 'languages your agents speak out of the box' },
] as const;

// CSS globe: layered radial gradients with orbit arcs.
function Globe() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[448px]" aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#f6e3ff_0%,#c9b4f7_35%,#533afd_80%,#2a1a8f_100%)] opacity-90" />
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_65%_70%,transparent_55%,rgba(255,255,255,0.25)_75%,transparent_90%)]" />
      <div className="absolute inset-[8%] rounded-full border border-white/25" />
      <div className="absolute inset-x-[-6%] top-1/2 h-[36%] -translate-y-1/2 rounded-[50%] border border-white/30" />
      <div className="absolute inset-x-[6%] top-1/2 h-[18%] -translate-y-1/2 rounded-[50%] border border-white/20" />
    </div>
  );
}

export function GlobalScale() {
  return (
    <section className="stats-section__globe-host bg-white px-10 py-40">
      <div className="mx-auto grid max-w-[1232px] items-center gap-14 lg:grid-cols-2">
        <div>
          <SectionHeading
            lead="The backbone of global agent commerce."
            rest="OpenFlow tenants run everywhere your customers are — one deployment, isolated instances across every region and channel."
          />
          <dl className="mt-12 space-y-8">
            {SCALE_POINTS.map((point) => (
              <div key={point.label} className="border-l-2 border-[#533afd]/30 pl-5">
                <dt className="text-2xl font-light tracking-tight text-[#061b31]">{point.value}</dt>
                <dd className="mt-1 text-sm text-[#425466]">{point.label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <Globe />
          {/* Data arcs under the globe, on the reference's slot. */}
          <Image
            src="/reference/DatavizStatic3x.png"
            alt=""
            width={768}
            height={300}
            className="mt-6 h-auto w-full opacity-70"
          />
        </div>
      </div>
    </section>
  );
}
