require('dotenv').config();
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

const llm = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash',
  apiKey: process.env.GEMINI_API_KEY,
  temperature: 0.3,
  maxOutputTokens: 2048
});

(async () => {
  try {
    const r = await llm.invoke([
      new SystemMessage('You are a UI/UX consultant. Return ONLY a valid JSON array. No markdown, no explanation, no backticks.'),
      new HumanMessage('Generate 2 design change cards for a saas website (e.g. example.com). Each card inspired by Linear or Stripe. Return ONLY the JSON array with this shape: [{"title":"short title","description":"2 sentences","change_type":"cta","element_target":"hero button","before_snippet":"current state","after_snippet":"improved state","inspired_by":"Linear","inspired_url":"https://linear.app","design_law":"fitts","impact_level":"high","page_key":"homepage"}]')
    ]);
    console.log('=== RAW RESPONSE (first 800 chars) ===');
    console.log(r.content.substring(0, 800));
    console.log('=== LENGTH:', r.content.length);
    
    // Try parse
    const clean = r.content
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    const parsed = JSON.parse(clean);
    console.log('=== PARSED OK, cards:', parsed.length);
    console.log('First card title:', parsed[0]?.title);
  } catch(e) {
    console.error('=== FAILED:', e.message);
  }
})();
