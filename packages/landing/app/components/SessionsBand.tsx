import Image from 'next/image';

// Full-bleed image banner ported 1:1 from the reference's sessions-section /
// sessions-on-demand (markup: index-e79b38e2d0f8978c.js; CSS: ae8ac88f...css).
// Layout and CSS are the reference's; the copy and image here are OpenFlow
// placeholders meant to be swapped. Source CSS quoted per rule below.
export function SessionsBand() {
  return (
    // .sessions-section { --section-container-pbs/pbe-dt: core-1000 (~80px) }
    <section className="sessions-section px-10 py-20">
      <div className="mx-auto max-w-[1232px]">
        {/* .sessions-on-demand__wrapper { display:grid }, sized to a 2.7:1 aspect ratio */}
        <div className="sessions-on-demand__wrapper relative grid aspect-[27/10] overflow-hidden rounded-xl">
          {/* .sessions-on-demand-background { grid-area:1/1 }
              .sessions-on-demand-background-image { border-radius:md; height:592px; object-fit:cover; object-position:50% 25% } */}
          <Image
            src="/reference/ConnectBentoBackground2.webp"
            alt=""
            fill
            sizes="1232px"
            className="sessions-on-demand-background-image object-cover [object-position:50%_25%]"
          />

          {/* .sessions-on-demand-content { grid-area:1/1; display:flex; flex-direction:column; overflow:hidden }
              .sessions-on-demand-content-description { margin:32px 24px } → 24px inline / 32px block padding */}
          <div className="sessions-on-demand-content relative flex flex-col justify-between overflow-hidden px-6 py-8">
            {/* .sessions-on-demand-content-logo { align-self:start; height:26px } */}
            <div className="sessions-on-demand-content-logo self-start text-lg font-semibold tracking-tight text-white">
              OpenFlow
            </div>

            {/* .sessions-on-demand-content-description-text { display:flex; flex-direction:column; row-gap:core-400 (16px) } */}
            <div className="sessions-on-demand-content-description flex flex-col gap-4">
              {/* .sessions-section__header-text { color:neutral-0; max-width:22ch } — measured 48px/300/-0.96px/1.03 */}
              <h2 className="sessions-section__header-text max-w-[659px] text-[48px] leading-[1.03] font-light tracking-[-0.02em] text-white">
                Powering the businesses building AI agents.
              </h2>
              {/* .sessions-section__cta-button { background:neutral-0; color:action(#533afd); border-radius:4px; transition:.3s }
                  :hover { color:brand-975 } — measured 143x48, padding 15.5px 24px 16.5px, 16px/400 */}
              <a
                href="#"
                className="sessions-section__cta-button inline-flex h-12 w-fit items-center rounded-[4px] bg-white px-6 text-base font-normal text-[#533afd] transition-colors duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] hover:text-[#3a1fd0]"
              >
                Get started
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
