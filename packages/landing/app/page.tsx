import { CaseStudies } from './components/CaseStudies';
import { DevelopersBand } from './components/DevelopersBand';
import { Footer } from './components/Footer';
import { GlobalScale } from './components/GlobalScale';
import { Happenings } from './components/Happenings';
import { Hero } from './components/Hero';
import { IntroScene } from './components/IntroScene';
import { Navbar } from './components/Navbar';
import { Opening } from './components/Opening';
import { SolutionsBento } from './components/SolutionsBento';
import { StoryScroll } from './components/StoryScroll';

export default function Home() {
  return (
    <div className="relative">
      <main id="main">
        {/* Pinned intro (see IntroScene): GSAP scrubs the choreography —
            opening → wave → title → subtitle → wave rotates → description →
            CTAs + logo bar — then releases into the section sequence below,
            which follows the copy catalog (messages/en.json) in file order. */}
        <IntroScene>
          <Hero />
          <Opening />
        </IntroScene>
        <SolutionsBento />
        <CaseStudies />
        <StoryScroll />
        <DevelopersBand />
        <Happenings />
        <GlobalScale />
      </main>
      <Footer />
      {/* After main so it paints above the hero without a z-index — a
          stacking context would isolate the nav's blend-mode knockout text
          from the wave canvas behind it. */}
      <Navbar />
      {/* Load curtain: the whole first frame (opening + navbar) emerges from
          black on page load. Pure CSS (see .intro-curtain) so it runs at first
          paint regardless of hydration; above everything, click-through, and
          absent under reduced motion (base opacity-0 + animation disabled). */}
      <div
        aria-hidden="true"
        className="intro-curtain pointer-events-none fixed inset-0 z-[90] bg-[#070707] opacity-0"
      />
    </div>
  );
}
