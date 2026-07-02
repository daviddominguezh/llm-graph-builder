import { CaseStudies } from './components/CaseStudies';
import { DevelopersBand } from './components/DevelopersBand';
import { Footer } from './components/Footer';
import { GlobalScale } from './components/GlobalScale';
import { Happenings } from './components/Happenings';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { SolutionsBento } from './components/SolutionsBento';

export default function Home() {
  return (
    <div className="relative">
      {/* Section sequence mirrors the reference 1:1: hero → solutions bento →
          global backbone → businesses of all sizes → developers → happenings.
          Our product sections (Problem/Features/Comparison/Audience/FinalCta)
          are parked out of the flow — re-add a line here to restore any. */}
      <main id="main">
        <Hero />
        <SolutionsBento />
        <GlobalScale />
        <CaseStudies />
        <DevelopersBand />
        <Happenings />
      </main>
      <Footer />
      {/* After main so it paints above the hero without a z-index — a
          stacking context would isolate the nav's blend-mode knockout text
          from the wave canvas behind it. */}
      <Navbar />
      {/* Layout guides running the full height of the page, like the
          reference's persistent column hairlines. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1240px] -translate-x-1/2 border-x border-[#061b31]/6 lg:block"
      />
    </div>
  );
}
