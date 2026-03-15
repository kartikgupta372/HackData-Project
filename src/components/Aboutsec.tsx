'use client';

import { SparklesCore } from "@/components/ui/sparkles-core";
import { SplineScene } from "@/components/ui/splite";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { CardSpotlight } from "@/components/ui/cardfeature";
import { MarqueeAnimation } from "@/components/ui/Textcrousel";

export function AboutUsSection() {
  return (
    <section id="about" className="w-full bg-black relative overflow-hidden" data-theme="dark">
      {/* Sparkles "About Us" heading */}
      
      <div className="py-20 mt-7 space-y-0 relative">
        {/* Top Strip - Orange */}
        <div className="bg-[#f73100ff] py-5 relative z-10 overflow-hidden border-b border-zinc-800 mb-3">
          <MarqueeAnimation baseVelocity={-1} className="text-white text-4xl font-bold tracking-tighter">
            AURA DESIGN AI • FUTURE OF DESIGN • AI POWERED CREATIVITY • 
          </MarqueeAnimation>
        </div>
        
        {/* Bottom Strip - Charcoal/Dark */}
        <div className="bg-white py-5 relative z-10 overflow-hidden border-b border-zinc-800">
          <MarqueeAnimation baseVelocity={1} className="text-black text-4xl font-bold tracking-tight">
            INNOVATION • PERFORMANCE • AESTHETICS • BEYOND IMAGINATION •
          </MarqueeAnimation>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center pt-25 pb-10 px-4">
        <h2 className="text-3xl md:text-4xl lg:text-7xl font-bold text-center text-white relative z-20">
          About Us
        </h2>
        <div className="w-[40rem] h-20 relative">
          {/* Gradients */}
          <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-[#f04107ff] to-transparent h-[2px] w-3/4 blur-sm" />
          <div className="absolute inset-x-20 top-0 bg-gradient-to-r from-transparent via-[#f04107ff] to-transparent h-px w-3/4" />
          <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-orange-500 to-transparent h-[5px] w-1/4 blur-sm" />
          <div className="absolute inset-x-60 top-0 bg-gradient-to-r from-transparent via-orange-500 to-transparent h-px w-1/4" />

          <SparklesCore
            background="transparent"
            minSize={0.4}
            maxSize={1}
            particleDensity={200} // Further reduced particle density
            className="w-full h-full"
            particleColor="#fff8f6ff"
          />

          {/* Radial fade mask */}
          <div className="absolute inset-0 w-full h-full bg-black [mask-image:radial-gradient(350px_200px_at_top,transparent_20%,white)]"></div>
        </div>
      </div>


      {/* Layout Container */}
      <div className="max-w-[90rem] mx-auto px-4 md:px-8 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
          
          {/* Left Column - 2 Cards */}
          <div className="flex flex-col gap-6 lg:col-span-1 order-2 lg:order-1">
            <CardSpotlight className="h-64 flex flex-col justify-center">
              <h3 className="text-xl font-bold text-white mb-2">Our Mission</h3>
              <p className="text-white text-sm">
                Empowering creators with AI-driven design tools that bridge the gap between imagination and reality.
              </p>
            </CardSpotlight>
            <CardSpotlight className="h-64 flex flex-col justify-center">
              <h3 className="text-xl font-bold text-white mb-2">Innovation</h3>
              <p className="text-white text-sm">
                Continuously pushing boundaries with cutting-edge 3D modeling and generative layout algorithms.
              </p>
            </CardSpotlight>
          </div>

          {/* Middle Column - Robot (Wider) */}
          <div className="lg:col-span-2 order-1 lg:order-2">
            <Card className="w-full h-[600px] bg-black/[0.96] relative overflow-hidden border-zinc-800">
              {/* <Spotlight
                className="-top-10 left-0 md:left-60 md:-top-20"
                fill="#f56421ff"
              /> */}
              <div className="w-full h-full">
                <SplineScene
                  scene="https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode"
                  className="w-full h-full"
                />
              </div>
            </Card>
          </div>

          {/* Right Column - 2 Cards */}
          <div className="flex flex-col gap-6 lg:col-span-1 order-3">
            <CardSpotlight className="h-64 flex flex-col justify-center">
              <h3 className="text-xl font-bold text-white mb-2">Performance</h3>
              <p className="text-white text-sm">
                Lightning-fast rendering and optimized workflows that keep your creative process fluid and uninterrupted.
              </p>
            </CardSpotlight>
            <CardSpotlight className="h-64 flex flex-col justify-center">
              <h3 className="text-xl font-bold text-white mb-2">Design First</h3>
              <p className="text-white text-sm">
                Aesthetics meet functionality. We believe beauty is essential to the user experience of every digital product.
              </p>
            </CardSpotlight>
          </div>

        </div>
      </div>
    </section>
  );
}
