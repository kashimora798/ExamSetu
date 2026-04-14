import Hero from '../../components/marketing/Hero';
import ProblemSolution from '../../components/marketing/ProblemSolution';
import Features from '../../components/marketing/Features';
import HowItWorks from '../../components/marketing/HowItWorks';
import PricingPreview from '../../components/marketing/PricingPreview';
import SocialProof from '../../components/marketing/SocialProof';

export default function HomePage() {
  return (
    <>
      <Hero />
      <ProblemSolution />
      <Features />
      <HowItWorks />
      <PricingPreview />
      <SocialProof />
    </>
  );
}
