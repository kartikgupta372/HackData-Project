import { useEffect, useState } from 'react';
import logo from './assets/icons/Aura_Design_AI__3_-removebg-preview.png';
import logoLight from './assets/icons/Aura Logo.png';

const Navbar = () => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const sections = document.querySelectorAll('[data-theme="dark"]');
      const navbarHeight = 80;
      let shouldBeDark = false;

      sections.forEach((section) => {
        const rect = section.getBoundingClientRect();
        // If the top of the section is above the bottom of the navbar
        // AND the bottom of the section is still below the top of the navbar
        if (rect.top <= navbarHeight && rect.bottom >= 0) {
          shouldBeDark = true;
        }
      });

      setIsDark(shouldBeDark);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Initial check
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

        {/* Center: Links */}
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

        {/* Right: Button */}
        <div>
          <div className="flex gap-2 items-center">
            <a
              href="#"
              className={`px-5 py-2 text-sm font-semibold transition-colors duration-500 ${
                isDark
                  ? 'text-white hover:text-zinc-300'
                  : 'text-black hover:text-zinc-500'
              }`}
            >
              Contact
            </a>
            <button className="px-5 py-2 text-sm font-semibold text-white bg-[#f04107ff] rounded-lg hover:bg-white border-2 border-[#f04107ff] hover:text-[#f04107ff] transition-all">
              Sign In
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
