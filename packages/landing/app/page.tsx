import { Audience } from './components/Audience';
import { Comparison } from './components/Comparison';
import { Features } from './components/Features';
import { FinalCta } from './components/FinalCta';
import { Footer } from './components/Footer';
import { Hero } from './components/Hero';
import { Navbar } from './components/Navbar';
import { Problem } from './components/Problem';
import { TechStack } from './components/TechStack';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Problem />
        <Features />
        <Comparison />
        <Audience />
        <TechStack />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
