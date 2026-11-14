import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import Hero from '../landing-components/Hero';
import Integrations from '../landing-components/integrations';
import { AboutSection } from '../landing-components/Abouttxt';
import { FeaturesSection } from '../landing-components/Featuresec';
import { AboutUsSection } from '../landing-components/Aboutsec';
import { ReviewCrousel } from '../landing-components/ui/ReviewCrousel';
import { FAQSection } from '../landing-components/FAQ';
import LandingFooter from '../landing-components/Footer';
import { Preloader } from '../landing-components/ui/Preloader';
import logo from '../assets/icons/Aura_Design_AI__3_-removebg-preview.png';
import logoLight from '../assets/icons/Aura Logo.png';

const LandingNavbar = ({ onLoginClick, onSignUpClick }) => {
  const [isDark, setIsDark] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const nav = useNavigate();

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll('[data-theme="dark"]');
      const navbarHeight = 80;
      let shouldBeDark = false;
      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        if (rect.top <= navbarHeight && rect.bottom >= 0) {
          shouldBeDark = true;
        }
      });
      setIsDark(shouldBeDark);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 w-full z-50 backdrop-blur-md border-b px-6 py-2 transition-colors duration-500 ${
        isDark
          ? 'bg-black/30 border-white/10'
          : 'bg-transparent border-white/5'
      }`}
    >
      <div className="max-w-7xl mx-auto flex justify-between items-center relative h-16">
        <div className="py-2 flex-shrink-0">
          <a href="/" className="flex items-center">
            <img
              src={isDark ? logoLight : logo}
              alt="Aura Logo"
              className="h-28 w-auto object-contain transition-all duration-500"
            />
          </a>
        </div>

        <div
          className={`hidden md:flex absolute left-1/2 -translate-x-1/2 gap-10 text-sm font-medium transition-colors duration-500 ${
            isDark ? 'text-white' : 'text-black'
          }`}
        >
          <a href="#features" className={`transition-colors ${isDark ? 'hover:text-zinc-300' : 'hover:text-zinc-500'}`}>
            Features
          </a>
          <a href="#about" className={`transition-colors ${isDark ? 'hover:text-zinc-300' : 'hover:text-zinc-500'}`}>
            About
          </a>
          <a href="#case-studies" className={`transition-colors ${isDark ? 'hover:text-zinc-300' : 'hover:text-zinc-500'}`}>
            Case Studies
          </a>
          <a href="#faqs" className={`transition-colors ${isDark ? 'hover:text-zinc-300' : 'hover:text-zinc-500'}`}>
            FAQS
          </a>
        </div>

        <div>
          <div className="flex gap-2 items-center">
            {isAuthenticated ? (
              <button
                onClick={() => nav('/app')}
                className="px-5 py-2 text-sm font-semibold text-white bg-[#f04107ff] rounded-lg hover:bg-white border-2 border-[#f04107ff] hover:text-[#f04107ff] transition-all"
              >
                Open Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={onLoginClick}
                  className={`px-5 py-2 text-sm font-semibold transition-colors duration-500 ${
                    isDark
                      ? 'text-white hover:text-zinc-300'
                      : 'text-black hover:text-zinc-500'
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={onSignUpClick}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#f04107ff] rounded-lg hover:bg-white border-2 border-[#f04107ff] hover:text-[#f04107ff] transition-all"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default function LandingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const { isAuthenticated } = useAuthStore();
  const nav = useNavigate();

  useEffect(() => {
    // Always set a fallback timeout to ensure loading clears
    const timer = setTimeout(() => setIsLoading(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    // Don't auto-redirect from landing; user may want to browse
  }, []);

  // Signed-in visitors go straight to the app; everyone else to email sign-in or sign-up.
  const goLogin = () => nav(isAuthenticated ? '/app' : '/login');
  const goSignUp = () => nav(isAuthenticated ? '/app' : '/register');

  return (
    <>
      <AnimatePresence>
        {isLoading && <Preloader key="loader" />}
      </AnimatePresence>

      <div className={isLoading ? "invisible overflow-hidden h-screen" : "visible"}>
        <LandingNavbar
          onLoginClick={goLogin}
          onSignUpClick={goSignUp}
        />
        <main>
          <Hero onTryNowClick={goSignUp} />
          <Integrations />
          <AboutSection />
          <FeaturesSection />
          <AboutUsSection />
          <ReviewCrousel />
          <FAQSection />
          <LandingFooter />
        </main>
      </div>

    </>
  );
}
