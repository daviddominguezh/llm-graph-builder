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
        <SolutionsBento />
        <StoryScroll />
        <GlobalScale />
        <CaseStudies />
        <Happenings />
        <DevelopersBand />
      </main>
      <Footer />
      {/* After main so it paints above the hero without a z-index — a
          stacking context would isolate the nav's blend-mode knockout text
          from the wave canvas behind it. */}
      <Navbar />
    </div>
  );
}
