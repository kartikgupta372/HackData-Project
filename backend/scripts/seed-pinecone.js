// scripts/seed-pinecone.js
// Seeds Pinecone index + Supabase benchmark_sites table
// Run: node scripts/seed-pinecone.js

require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai');
const { createClient } = require('@supabase/supabase-js');

const INDEX_NAME = process.env.PINECONE_INDEX_BENCHMARKS ?? 'aura-benchmarks';
const DIMENSIONS = 3072; // gemini-embedding-001 via LangChain

const BENCHMARKS = [
  // ECOMMERCE
  { id:'ecomm-apple', site_type:'ecommerce', name:'Apple Store', url:'https://apple.com/store',
    description:"Premium ecommerce with cinematic product photography and minimalist navigation. Every CTA above the fold. Single-column product focus eliminates Hick's Law overload.",
    design_notes:'Extreme whitespace, sticky nav, product-hero layout, F-pattern content, one-click purchase',
    tags:['minimal','premium','product-hero','whitespace','single-cta'], awwwards_score:96 },
  { id:'ecomm-gymshark', site_type:'ecommerce', name:'Gymshark', url:'https://gymshark.com',
    description:'DTC fitness apparel with bold typography, social-proof UGC feeds, and urgency mechanics. Category navigation uses Gestalt similarity for clean grouping.',
    design_notes:'Bold headings, UGC carousel, urgency timers, sticky add-to-cart, mobile-first grid',
    tags:['bold','dark','urgency','ugc','mobile-first'], awwwards_score:88 },
  { id:'ecomm-allbirds', site_type:'ecommerce', name:'Allbirds', url:'https://allbirds.com',
    description:"Sustainable footwear brand using earthy palette, story-led scrolling, and conversational copy. Navigation has 5 items max — classic Hick's Law compliance.",
    design_notes:'Story-scroll, 5-item nav, earthy tones, sustainability narrative, large CTA buttons',
    tags:['earthy','story-led','sustainable','conversational','minimal-nav'], awwwards_score:91 },
  { id:'ecomm-glossier', site_type:'ecommerce', name:'Glossier', url:'https://glossier.com',
    description:'Beauty brand with pastel UI, community-driven content, and high-contrast CTAs. Product pages use social proof directly in the purchasing flow.',
    design_notes:'Pastel palette, community photos, inline social proof, sticky cart, review integration',
    tags:['pastel','community','social-proof','beauty','high-contrast-cta'], awwwards_score:89 },
  { id:'ecomm-nike', site_type:'ecommerce', name:'Nike', url:'https://nike.com',
    description:'Athletic apparel giant with action-first photography, bold typography, and motion-driven product reveals. Category pages use progressive filtering to reduce Hick\'s Law decision overload.',
    design_notes:'Action photography, motion reveals, progressive filtering, bold type, hero-first',
    tags:['bold','action','motion','athletic','hero-first'], awwwards_score:87 },
  // SAAS
  { id:'saas-linear', site_type:'saas', name:'Linear', url:'https://linear.app',
    description:'Project management SaaS with dark, engineering-focused design. Hero uses product screenshot immediately. Navigation is sparse — zero cognitive load on entry.',
    design_notes:'Dark mode, product-in-hero, sparse nav, keyboard shortcut emphasis, engineering brand',
    tags:['dark','developer','product-screenshot','minimal','keyboard-first'], awwwards_score:95 },
  { id:'saas-notion', site_type:'saas', name:'Notion', url:'https://notion.so',
    description:'All-in-one workspace with a clean white canvas metaphor. Navigation uses progressive disclosure — starts simple, reveals power gradually.',
    design_notes:'White canvas, progressive disclosure, emoji use, templates in hero, community-led',
    tags:['clean','white','progressive-disclosure','templates','community'], awwwards_score:92 },
  { id:'saas-vercel', site_type:'saas', name:'Vercel', url:'https://vercel.com',
    description:'Developer platform with terminal aesthetics, dark gradient hero, and instant deploy CTA. Speed is the visual metaphor — everything loads fast and looks fast.',
    design_notes:'Dark gradient, terminal aesthetic, instant deploy CTA, performance metrics in hero',
    tags:['dark','developer','gradient','performance','instant-cta'], awwwards_score:94 },
  { id:'saas-stripe', site_type:'saas', name:'Stripe', url:'https://stripe.com',
    description:'Payments SaaS with signature gradient branding and code-in-hero approach. Proves technical sophistication through design — converts CTOs, not just designers.',
    design_notes:'Purple gradient, code snippets in hero, developer trust signals, clean pricing, layered depth',
    tags:['gradient','code-hero','developer','trust','clean-pricing'], awwwards_score:97 },
  { id:'saas-figma', site_type:'saas', name:'Figma', url:'https://figma.com',
    description:'Design tool with collaborative UI, vibrant colour accents, and community-driven social proof. Free plan CTA is above the fold with enterprise secondary.',
    design_notes:'Vibrant accents, collaborative visual, free-tier CTA primary, file showcase, community gallery',
    tags:['vibrant','collaborative','free-cta','file-showcase','community'], awwwards_score:93 },
  { id:'saas-loom', site_type:'saas', name:'Loom', url:'https://loom.com',
    description:'Video messaging SaaS. Hero is a video — perfect use of the product itself as the selling point. Clean purple branding with floating video previews.',
    design_notes:'Video-in-hero, purple brand, floating previews, async-first messaging, team use-cases',
    tags:['video-hero','purple','async','previews','team-focused'], awwwards_score:87 },
  { id:'saas-superhuman', site_type:'saas', name:'Superhuman', url:'https://superhuman.com',
    description:'Email SaaS built on speed narrative. Dark, focused design with a single waitlist CTA. Testimonials from high-signal influencers replace generic social proof.',
    design_notes:'Speed narrative, dark focus, single CTA, influencer testimonials, keyboard-first product',
    tags:['dark','speed','single-cta','influencer-proof','keyboard'], awwwards_score:91 },
  // PORTFOLIO
  { id:'port-awwwards', site_type:'portfolio', name:'Awwwards SOTD Pattern', url:'https://awwwards.com',
    description:'Award-winning portfolio patterns: full-viewport hero, custom cursor, horizontal scroll, micro-interactions on hover, bespoke typography.',
    design_notes:'Full-viewport hero, custom cursor, horizontal scroll, micro-interactions, bespoke type',
    tags:['award-winning','custom-cursor','micro-interactions','bespoke','full-viewport'], awwwards_score:99 },
  { id:'port-brittany-chiang', site_type:'portfolio', name:'Brittany Chiang Portfolio', url:'https://brittanychiang.com',
    description:'Developer portfolio with fixed sidebar navigation, dark terminal aesthetic, and detailed work history. Anchor-scroll navigation keeps context visible at all times.',
    design_notes:'Fixed sidebar, dark terminal, anchor-scroll nav, detailed work history, sticky section links',
    tags:['dark','sidebar-nav','developer','anchor-scroll','detailed'], awwwards_score:90 },
  { id:'port-semplice', site_type:'portfolio', name:'Semplice (Portfolio Platform)', url:'https://semplice.com',
    description:'Portfolio builder showcasing case-study-first layouts, large image grids, and project meta in the F-pattern reading zone. Password-protected work is positioned as premium.',
    design_notes:'Case-study-first, image grid, F-pattern meta, password protection for premium signal',
    tags:['case-study','image-grid','f-pattern','premium','protected-work'], awwwards_score:88 },
  // RESTAURANT
  { id:'rest-nobu', site_type:'restaurant', name:'Nobu Restaurants', url:'https://noburestaurants.com',
    description:"Luxury restaurant group with full-bleed food photography, dark elegant palette, and reservation CTA always visible. Gestalt Law of Proximity groups location info.",
    design_notes:'Full-bleed food photography, dark elegant, sticky reservation CTA, location proximity grouping',
    tags:['luxury','dark','food-photography','reservation-cta','elegant'], awwwards_score:85 },
  { id:'rest-sweetgreen', site_type:'restaurant', name:'Sweetgreen', url:'https://sweetgreen.com',
    description:'Fast-casual chain with fresh, earthy colours and ingredient-forward photography. Mobile-first order flow with < 3 taps to checkout.',
    design_notes:'Earthy greens, ingredient photography, mobile-order flow, 3-tap checkout, sustainability story',
    tags:['earthy','mobile-first','ingredient-photography','fast-casual','sustainability'], awwwards_score:82 },
  { id:'rest-eleven-madison', site_type:'restaurant', name:'Eleven Madison Park', url:'https://elevenmadisonpark.com',
    description:"Fine dining with extreme minimalism — mostly whitespace, single course image, one reservation button. Every element earns its place. Perfect Fitts's Law target sizes.",
    design_notes:'Extreme minimal, single focal image, one CTA, large button targets, whitespace-as-luxury',
    tags:['minimal','fine-dining','whitespace','single-cta','luxury'], awwwards_score:91 },
  { id:'rest-noma', site_type:'restaurant', name:'Noma Copenhagen', url:'https://noma.dk',
    description:'World top restaurant with photography-led storytelling, seasonal menu reveals, and nature-inspired palette. Navigation is hidden by default — experience over function.',
    design_notes:'Photography storytelling, seasonal reveals, nature palette, hidden nav, experience-first',
    tags:['storytelling','photography','nature','hidden-nav','seasonal'], awwwards_score:93 },
  // BLOG
  { id:'blog-substack', site_type:'blog', name:'Substack Pattern', url:'https://substack.com',
    description:'Newsletter platform with clean reading-first design. High contrast text, generous line-height, single-column layout. Subscribe CTA repeats on scroll.',
    design_notes:'Reading-first, high-contrast text, generous line-height, repeated CTA, single column',
    tags:['reading-first','high-contrast','newsletter','single-column','repeat-cta'], awwwards_score:83 },
  { id:'blog-medium', site_type:'blog', name:'Medium', url:'https://medium.com',
    description:'Content platform with distraction-free reading. Uses F-pattern layout religiously — title, byline, hero image, content. Progressive subscribe prompts.',
    design_notes:'F-pattern layout, distraction-free, progressive subscribe, author byline prominence, serif body',
    tags:['f-pattern','reading','distraction-free','progressive-prompt','serif'], awwwards_score:79 },
  { id:'blog-smashing', site_type:'blog', name:'Smashing Magazine', url:'https://smashingmagazine.com',
    description:'Design publication with excellent information architecture. Article thumbnails use consistent visual weight. Table of contents reduces cognitive load.',
    design_notes:'Consistent thumbnails, table of contents, category filtering, membership CTA, red brand accent',
    tags:['publication','information-architecture','table-of-contents','red-accent','consistent-thumbnails'], awwwards_score:81 },
  { id:'blog-waitbutwhy', site_type:'blog', name:'Wait But Why', url:'https://waitbutwhy.com',
    description:'Long-form personal blog that proves personality > polish. Stick-figure illustrations, conversational tone, and extremely long-form articles keep readers engaged for hours.',
    design_notes:'Personality-first, stick illustrations, long-form, conversational, email subscription loop',
    tags:['personality','illustrations','long-form','conversational','email-loop'], awwwards_score:84 },
  // AGENCY
  { id:'agency-fantasy', site_type:'agency', name:'Fantasy Interactive', url:'https://fantasy.co',
    description:'Digital product studio with bold full-viewport case studies and cinematic scroll. Work speaks first — homepage IS the portfolio.',
    design_notes:'Work-first layout, cinematic scroll, full-viewport cases, team-led, no logo wall',
    tags:['bold','work-first','cinematic','case-studies','no-logo-wall'], awwwards_score:96 },
  { id:'agency-instrument', site_type:'agency', name:'Instrument Agency', url:'https://instrument.com',
    description:'Portland design agency with a strong editorial voice and grid-based case study system. Typography is the brand.',
    design_notes:'Editorial grid, type-as-brand, case study cards, editorial photography, Portland aesthetic',
    tags:['editorial','grid','type-driven','case-study-cards','bold-type'], awwwards_score:93 },
  { id:'agency-ueno', site_type:'agency', name:'Ueno Agency', url:'https://ueno.co',
    description:'Creative agency known for humorous copy and unconventional layouts. Proves personality converts. Breaks grid rules intentionally to demonstrate creativity.',
    design_notes:'Humorous copy, broken grid, personality-driven, quirky illustrations, culture-first hiring',
    tags:['humorous','broken-grid','personality','quirky','culture-first'], awwwards_score:92 },
  { id:'agency-work-co', site_type:'agency', name:'Work & Co', url:'https://work.co',
    description:'Digital product agency focused on utility. No flair for flair\'s sake — every design decision is justified by function. Client results lead the homepage.',
    design_notes:'Result-first, clean utility, client logos, no decorative elements, functional-first',
    tags:['functional','result-first','client-logos','clean','utility'], awwwards_score:89 },
  // OTHER
  { id:'other-linear-method', site_type:'other', name:'The Linear Method', url:'https://linear.app/method',
    description:'Long-form editorial on product development. Clean reading experience with strong hierarchy and pull-quotes. Perfect example of content-first design.',
    design_notes:'Long-form editorial, pull-quotes, clean reading, strong hierarchy, no distractions',
    tags:['editorial','long-form','reading','pull-quotes','content-first'], awwwards_score:90 },
  { id:'other-lusion', site_type:'other', name:'Lusion Studio', url:'https://lusion.co',
    description:'Creative studio with WebGL animations and bespoke interactive experience. Shows technical possibility — used as inspiration for motion and interaction patterns.',
    design_notes:'WebGL, bespoke interactions, motion-first, dark canvas, technical showcase',
    tags:['webgl','motion','interactive','dark','technical'], awwwards_score:98 },
];

// ── Main execution ────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Aura Pinecone + Supabase Benchmark Seeder\n');

  // ── Init Supabase ──────────────────────────────────────────────────────────
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY
  );

  // ── Init Gemini Embeddings ─────────────────────────────────────────────────
  const embedder = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-embedding-001',
  });

  // ── Init Pinecone ──────────────────────────────────────────────────────────
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

  // Create index if it doesn't exist
  const existing = await pc.listIndexes();
  const indexNames = existing.indexes?.map(i => i.name) ?? [];

  if (!indexNames.includes(INDEX_NAME)) {
    console.log(`📦 Creating Pinecone index "${INDEX_NAME}" (${DIMENSIONS}d, cosine)…`);
    await pc.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSIONS,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    // Wait for index to be ready
    console.log('⏳ Waiting for index to initialize…');
    await new Promise(r => setTimeout(r, 15000));
  } else {
    console.log(`✅ Pinecone index "${INDEX_NAME}" already exists`);
  }

  const idx = pc.index(INDEX_NAME);

  // ── Seed Supabase benchmark_sites ─────────────────────────────────────────
  console.log('\n📊 Seeding Supabase benchmark_sites table…');
  let dbCount = 0;
  for (const b of BENCHMARKS) {
    const { error } = await supabase
      .from('benchmark_sites')
      .upsert({
        pinecone_id:  b.id,
        name:         b.name,
        url:          b.url,
        site_type:    b.site_type,
        description:  b.description,
        design_notes: b.design_notes,
        tags:         b.tags,
        awwwards_score: b.awwwards_score,
      }, { onConflict: 'pinecone_id' });

    if (error) {
      console.error(`  ❌ DB upsert failed for ${b.id}:`, error.message);
    } else {
      dbCount++;
      process.stdout.write(`  ✓ ${b.name}\r`);
    }
  }
  console.log(`\n✅ Seeded ${dbCount}/${BENCHMARKS.length} records to Supabase`);

  // ── Embed + upsert to Pinecone ────────────────────────────────────────────
  console.log('\n🧠 Generating embeddings and seeding Pinecone…');
  const vectors = [];

  for (const b of BENCHMARKS) {
    const text = [
      `Site: ${b.name}`,
      `Type: ${b.site_type}`,
      `Description: ${b.description}`,
      `Design notes: ${b.design_notes}`,
      `Tags: ${b.tags.join(', ')}`,
    ].join('. ');

    try {
      const embedding = await embedder.embedQuery(text);
      vectors.push({
        id: b.id,
        values: embedding,
        metadata: {
          name:         b.name,
          url:          b.url,
          site_type:    b.site_type,
          description:  b.description,
          design_notes: b.design_notes,
          tags:         b.tags,
          awwwards_score: b.awwwards_score,
        },
      });
      console.log(`  ✓ Embedded: ${b.name}`);
    } catch (err) {
      console.error(`  ❌ Embedding failed for ${b.name}:`, err.message);
    }
  }

  // Upsert in batches of 100
  console.log(`\n📤 Upserting ${vectors.length} vectors to Pinecone…`);
  const BATCH = 100;
  for (let i = 0; i < vectors.length; i += BATCH) {
    const batch = vectors.slice(i, i + BATCH);
    await idx.upsert(batch);
    console.log(`  ✓ Upserted batch ${Math.floor(i / BATCH) + 1}`);
  }

  // Verify
  await new Promise(r => setTimeout(r, 2000));
  const stats = await idx.describeIndexStats();
  console.log(`\n✅ Pinecone index stats:`, JSON.stringify(stats, null, 2));
  console.log('\n🎉 Seeding complete!');
  console.log(`   Supabase: ${dbCount} benchmark sites`);
  console.log(`   Pinecone: ${vectors.length} vectors (${DIMENSIONS}d)`);
  console.log('\n📝 Next: update vectorSearch.tool.js to use Gemini embeddings (dim=768)');
}

main().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
