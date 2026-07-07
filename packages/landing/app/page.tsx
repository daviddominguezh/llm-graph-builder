import { CaseStudies } from './components/CaseStudies';
import { DevelopersBand } from './components/DevelopersBand';
import { Footer } from './components/Footer';
import { GlobalScale } from './components/GlobalScale';
import { Happenings } from './components/Happenings';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { Opening } from './components/Opening';
import { SolutionsBento } from './components/SolutionsBento';
import { StoryScroll } from './components/StoryScroll';

export default function Home() {
  return (
    <div className="relative">      
      {/* Section sequence follows the copy catalog (messages/en.json) exactly —
          every key renders in file order (see messages/KEY_USAGE.md):
          hero → whatIsOpenflow + foundation (bento) → controlRoom (story) →
          revenue (scale points) → studio (deck) → toolbox (happenings) →
          knowledge + engine + waysToUse (developers band). */}
      <main id="main">
        <Opening />
        <Hero />
        {/* Everything below the hero sits in its own positioned layer (z-2) so
            it paints ABOVE the hero's fixed wave canvas (z-1) — otherwise the
            viewport-pinned wave would bleed over these sections. */}
        <div className="relative z-[2]">
          <SolutionsBento />
          <StoryScroll />
          <GlobalScale />
          <CaseStudies />
          <Happenings />
          <DevelopersBand />
        </div>
      </main>
      <div className="relative z-[2]">
        <Footer />
      </div>
      {/* After main so it paints above the hero without a z-index — a
          stacking context would isolate the nav's blend-mode knockout text
          from the wave canvas behind it. */}
      <Navbar />
    </div>
  );
}
