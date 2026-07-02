import { Audience } from './components/Audience';
import { Comparison } from './components/Comparison';
import { Features } from './components/Features';
import { FinalCta } from './components/FinalCta';
import { FoldedSilkBand } from './components/FoldedSilkBand';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { Problem } from './components/Problem';
import { WaveBand } from './components/WaveBand';

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Problem />
        <Features />
        <Comparison />
        <Audience />
        <WaveBand />
        <FoldedSilkBand />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
