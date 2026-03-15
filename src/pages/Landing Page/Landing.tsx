import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Navbar from '../../Navbar';
import Hero from '../../components/Hero';
import Integrations from '../../components/integrations';
import { AboutSection } from '../../components/Abouttxt';
import { FeaturesSection } from '../../components/Featuresec';
import { AboutUsSection } from '../../components/Aboutsec';
import { ReviewCrousel } from '../../components/ui/ReviewCrousel';
import { FAQSection } from '../../components/FAQ';
import Footer from '../../components/Footer';
import { Preloader } from '../../components/ui/Preloader';

const LandingPage = () => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if document is already loaded
    if (document.readyState === 'complete') {
      setTimeout(() => setIsLoading(false), 2000); // 2s minimum for cinematic feel
    } else {
      window.addEventListener('load', () => {
        setTimeout(() => setIsLoading(false), 2000);
      });
    }
  }, []);

  return (
    <>
      <AnimatePresence>
        {isLoading && <Preloader key="loader" />}
      </AnimatePresence>

      <div className={isLoading ? "invisible overflow-hidden h-screen" : "visible"}>
        <Navbar />
        <main>
          <Hero />
          <Integrations />
          <AboutSection />
          <FeaturesSection />
          <AboutUsSection />
          <ReviewCrousel />
          <FAQSection />
          <Footer />
        </main>
      </div>
    </>
  );
};

export default LandingPage;
