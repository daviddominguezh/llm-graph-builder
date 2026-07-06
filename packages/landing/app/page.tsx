import { CaseStudies } from './components/CaseStudies';
import { DevelopersBand } from './components/DevelopersBand';
import { Footer } from './components/Footer';
import { GlobalScale } from './components/GlobalScale';
import { Happenings } from './components/Happenings';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { SolutionsBento } from './components/SolutionsBento';
import { StoryScroll } from './components/StoryScroll';

export default function Home() {
  return (
    <div className="relative">
      {/* Full-page layout guides. Painted before main so the hero wave
          (positioned, later in DOM) passes over them. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[1280px] -translate-x-1/2 border-x border-dashed border-neutral-800 lg:block"
      />
      {/* Section sequence mirrors the reference 1:1: hero → solutions bento →
          global backbone → businesses of all sizes → developers → happenings.
          Our product sections (Problem/Features/Comparison/Audience/FinalCta)
          are parked out of the flow — re-add a line here to restore any. */}
      <main id="main">
        <Hero />
        <SolutionsBento />
        <GlobalScale />
        <StoryScroll />
        <CaseStudies />
        <DevelopersBand />
        <Happenings />
      </main>
      <Footer />
      {/* After main so it paints above the hero without a z-index — a
          stacking context would isolate the nav's blend-mode knockout text
          from the wave canvas behind it. */}
      <Navbar />
    </div>
  );
}
