// routes/ai.js — v2.0
// Secure Gemini API proxy using unified Gemini service.
// The API key never leaves the server.
//
// All endpoints: POST, JSON body.
//
//  POST /api/ai/chat        { message, city, plan }
//  POST /api/ai/vibe        { vibe, city, locations[] }
//  POST /api/ai/lens        { imageBase64, city }
//  POST /api/ai/prep        { city, stops[] }
//  POST /api/ai/insta       { city, stops[] }
//  POST /api/ai/souvenir    { city }
//  POST /api/ai/budget      { city, limit, spent, expenses[] }
//  POST /api/ai/alternative { city, currentStop }
//  + caption, translate, triprating, replanner, foodrecommend, voicechat
//  + festival, hiddenGem, arOverlay, hartaalAlert, foodSafety
//  + crowdPredict, fareNegotiator, tripTribe

const express = require('express');
const router  = express.Router();
const { callGeminiText, callGeminiVision } = require('../services/gemini');

// ── Generic wrapper to handle errors uniformly ───────────────────────────────

function handler(fn) {
  return async (req, res) => {
    try {
      const result = await fn(req.body);
      res.json({ text: result });
    } catch (err) {
      console.error(`[ai:${req.path}]`, err.message);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  };
}

// ── /api/ai/chat ─────────────────────────────────────────────────────────────
// General travel Q&A chatbot

router.post('/chat', handler(({ message, city, plan }) => {
  const planStr = Array.isArray(plan) && plan.length
    ? plan.join(', ')
    : 'none';

  return callGeminiText(`You are a friendly India travel assistant.
Tourist in ${city || 'India'} asked: "${message}"
Current itinerary stops: ${planStr}.
Answer in max 3 short lines. Use emojis. Be specific and helpful.`, { cache: true });
}));

// ── /api/ai/vibe ─────────────────────────────────────────────────────────────
// Rank locations by vibe/mood match

router.post('/vibe', handler(({ vibe, city, locations }) => {
  const locList = (locations || []).join(', ');
  return callGeminiText(`I am visiting ${city}. My mood/vibe is: "${vibe}".
Out of these places: [${locList}], pick the best ones that match the vibe.
Return ONLY their exact names separated by commas. No explanation.`, { cache: true });
}));

// ── /api/ai/lens ─────────────────────────────────────────────────────────────
// Identify a landmark from a base64 photo

router.post('/lens', handler(({ imageBase64, imageType, city }) => {
  return callGeminiVision(imageBase64, imageType,
    `What landmark or tourist spot is shown in this photo, possibly in ${city || 'India'}?
Answer in 2 sentences. Include the name, location, and one interesting fact.`);
}));

// ── /api/ai/prep ─────────────────────────────────────────────────────────────
// Packing / preparation tips

router.post('/prep', handler(({ city, stops }) => {
  const stopStr = (stops || []).slice(0, 3).join(', ') || 'various attractions';
  return callGeminiText(`Give packing and preparation tips for visiting ${city}, India.
Planned stops include: ${stopStr}.
Provide exactly 4 short bullet points. Use emojis. Be practical.`, { cache: true });
}));

// ── /api/ai/insta ────────────────────────────────────────────────────────────
// Best Instagram / photo spots

router.post('/insta', handler(({ city, stops }) => {
  const stopStr = (stops || []).slice(0, 2).join(' and ') || city;
  return callGeminiText(`What are the 3 best photo spots or angles at ${stopStr} in ${city}?
Include the best time of day, composition tips. Use emojis. Keep each tip brief.`, { cache: true });
}));

// ── /api/ai/souvenir ─────────────────────────────────────────────────────────
// What to buy / souvenirs

router.post('/souvenir', handler(({ city }) => {
  return callGeminiText(`What are the top 3 authentic souvenirs to buy in ${city}, India?
Include fair price ranges and where exactly to buy them. Bullet list with emojis.`, { cache: true });
}));

// ── /api/ai/budget ───────────────────────────────────────────────────────────
// Analyse expenses and give budget tips

router.post('/budget', handler(({ city, limit, spent, expenses }) => {
  const expStr = (expenses || []).map(e => `${e.n}(₹${e.c})`).join(', ');
  return callGeminiText(`Tourist in ${city}. Total budget ₹${limit}, spent ₹${spent} on: ${expStr}.
Give 3 concise budget tips. Flag anything that seems overpriced vs local rates.
Short bullet list with emojis.`);
}));

// ── /api/ai/alternative ──────────────────────────────────────────────────────
// Suggest a hidden-gem alternative to the current stop

router.post('/alternative', handler(({ city, currentStop }) => {
  return callGeminiText(`A tourist in ${city} wants to skip ${currentStop}.
Suggest ONE hidden gem or lesser-known alternative nearby. Max 2 sentences. Use emojis.`, { cache: true });
}));

// ── /api/ai/caption ──────────────────────────────────────────────────────────
// Generate Instagram caption for a trip photo

router.post('/caption', handler(({ imageBase64, imageType, city, stopName }) => {
  return callGeminiVision(imageBase64, imageType,
    `Generate 3 creative Instagram captions for this travel photo taken at ${stopName || 'a tourist spot'} in ${city || 'India'}.
Each caption should:
- Be 1-2 lines max
- Include relevant emojis
- Include 5-8 hashtags
- Have a different vibe: (1) poetic/emotional, (2) fun/witty, (3) informative/travel-guide style
Format as:
1. [caption + hashtags]
2. [caption + hashtags]
3. [caption + hashtags]`);
}));

// ── /api/ai/translate ────────────────────────────────────────────────────────
// Translate text/signs from a photo

router.post('/translate', handler(({ imageBase64, imageType, city }) => {
  return callGeminiVision(imageBase64, imageType,
    `Look at this image taken in ${city || 'India'}.
1. Identify and extract ALL text visible in the image (signs, menus, boards, labels)
2. Detect the language of each text
3. Translate everything to English
4. If it's a menu, suggest which items are most popular or recommended

Format your response clearly with:
📝 ORIGINAL TEXT: [what you see]
🌐 LANGUAGE: [detected language]
✅ TRANSLATION: [English translation]
💡 TIP: [any helpful context about what this means for a tourist]`);
}));

// ── /api/ai/triprating ───────────────────────────────────────────────────────
// Rate completed trip and give improvement tips

router.post('/triprating', handler(({ city, stops, duration, expenses, stamps }) => {
  const stopList   = (stops   || []).join(', ') || 'various spots';
  const expTotal   = (expenses|| []).reduce((s, e) => s + (e.c || 0), 0);
  const stampCount = (stamps  || []).length;

  return callGeminiText(`A tourist just completed a trip to ${city}, India.
Trip details:
- Places visited: ${stopList}
- Duration: ${duration || 'one day'}
- Total spent: ₹${expTotal}
- Passport stamps collected: ${stampCount}

Please provide:
⭐ TRIP RATING: Give an overall rating out of 10 with a fun title (e.g. "8.5/10 — The Coastal Explorer!")
📊 BREAKDOWN: Rate each aspect: Sightseeing, Food, Value for Money, Adventure (each out of 5 stars)
🏆 HIGHLIGHTS: Top 2 best moments based on places visited
💡 NEXT TIME: 3 specific tips to make the next trip to ${city} even better
🗺️ MISSED: 2 must-see spots they should visit next time

Keep it fun, encouraging, and use emojis throughout!`);
}));

// ── /api/ai/replanner ────────────────────────────────────────────────────────
// Smart day replanner when running late

router.post('/replanner', handler(({ city, completedStops, remainingStops, minutesLate, currentTime }) => {
  const done = (completedStops || []).join(', ') || 'none yet';
  const rem  = (remainingStops || []).map(s => `${s.name}(${s.vt}min)`).join(', ') || 'none';

  return callGeminiText(`A tourist in ${city} is running ${minutesLate || 30} minutes late. Current time: ${currentTime || 'unknown'}.
Completed stops: ${done}
Remaining stops with visit times: ${rem}

Please create a smart reschedule:
⏰ SITUATION: Brief summary of the delay impact
✂️ CUT: Which stops to skip or shorten (with reason)
📍 KEEP: Which stops are must-do and why
🔄 NEW ORDER: Suggest the optimal visiting order for remaining stops
💨 TIME SAVERS: 2-3 quick tips to make up time (faster transport, skip queues, etc.)

Be practical and specific. Use emojis. Keep each point brief.`);
}));

// ── /api/ai/foodrecommend ────────────────────────────────────────────────────
// AI food recommendations for a specific stop/location

router.post('/foodrecommend', handler(({ city, stopName, cat, timeOfDay }) => {
  const time = timeOfDay || 'afternoon';

  return callGeminiText(`A tourist is visiting ${stopName} in ${city}, India at ${time}.
Give them a mouth-watering food guide:

🍽️ MUST TRY: Top 3 local dishes/foods specific to this area of ${city}
🏪 WHERE TO EAT: 2-3 specific types of eateries nearby (street stalls, restaurants, cafes)
💰 BUDGET: Approximate cost per person
⚠️ PRO TIPS: 2 tips (e.g. what to avoid, best time to eat, how to order like a local)
🌶️ SPICE WARNING: Rate the local food spice level (Mild/Medium/Spicy/Very Spicy)

Keep it fun and use emojis! Make them hungry!`, { cache: true });
}));

// ── /api/ai/voicechat ────────────────────────────────────────────────────────
// Voice-optimised short response for voice assistant

router.post('/voicechat', handler(({ message, city, plan, context }) => {
  const planStr = Array.isArray(plan) && plan.length ? plan.join(', ') : 'none';

  return callGeminiText(`You are a friendly voice assistant for India travel app.
Tourist in ${city || 'India'} asked: "${message}"
Current stops: ${planStr}
${context ? `Context: ${context}` : ''}

IMPORTANT: Give a SHORT, conversational response (2-3 sentences max).
- Speak naturally as if talking, not writing
- No bullet points, no markdown, no asterisks
- Use simple words that sound good when spoken aloud
- Be warm, helpful and specific to ${city || 'India'}`);
}));

// ── /api/ai/festival ─────────────────────────────────────────────────────────
// Festival & Event Radar
router.post('/festival', handler(({ city, month, date }) => {
  const today = date || new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
  const m = month || new Date().toLocaleString('en-IN', { month:'long' });
  return callGeminiText(`You are an expert on Indian festivals, local events, and cultural happenings.
Today is ${today}. The tourist is in ${city}, India.

List ALL festivals, events, melas, temple celebrations, local markets, or cultural events that are:
1. Happening TODAY or this week in/near ${city}
2. Seasonal events typical for ${m} in this region
3. Weekly recurring local events (like weekly markets, haats)

For each event provide:
🎪 EVENT NAME
📅 When: (today/this week/every [day])
📍 Location: (specific area in ${city})
🎯 What to expect: (2 sentences)
💰 Entry: (free/paid with price)
⏰ Best time to visit:
🚗 How to reach: (from city center)

Also mention any upcoming events in next 3 days.
If no specific events known, mention the most likely seasonal/weekly events for ${m} in ${city}.
Use emojis. Be specific and helpful.`, { cache: true, cacheTtlMs: 30 * 60 * 1000 });
}));

// ── /api/ai/hiddenGem ────────────────────────────────────────────────────────
// Hidden Gem Detector
router.post('/hiddenGem', handler(({ city, prefs }) => {
  const prefStr = (prefs || []).join(', ') || 'any';
  return callGeminiText(`You are a local resident of ${city}, India who knows every secret spot.
Find 5 HIDDEN GEMS that locals love but tourists almost never visit. These should NOT be on typical tourist lists.

Preferences: ${prefStr}

For each hidden gem:
💎 NAME: (specific place name)
📍 WHERE: (exact locality/area)
🤫 WHY LOCALS LOVE IT: (what makes it special)
⏰ BEST TIME: (specific time of day/week)
🚗 HOW TO REACH: (auto/bus/walk directions from city center)
💰 COST: (entry fee if any, typical spend)
📸 PHOTO TIP: (best angle/spot for photos)
⚠️ LOCAL TIP: (insider advice, what to avoid, what to order)

These should be genuinely off-the-beaten-path — local chai shops, hidden viewpoints, secret beaches, underground art spaces, local dhabas that only residents know, etc.
NOT Tripadvisor top 10. Real hidden gems only.`, { cache: true });
}));

// ── /api/ai/arOverlay ────────────────────────────────────────────────────────
// AR Overlay — identify building, show history, price, photo tips
router.post('/arOverlay', handler(({ imageBase64, imageType, city }) => {
  return callGeminiVision(imageBase64, imageType,
    `You are an expert Indian historian and travel guide analyzing a photo taken in ${city || 'India'}.

Analyze this image and provide an AUGMENTED REALITY style overlay with:

🏛️ IDENTIFICATION: What is this place/building/monument?
📜 HISTORY: 3-4 fascinating historical facts (dates, stories, legends)
🕰️ AGE: How old is this structure?
👑 WHO BUILT IT: Builder, dynasty, or founder
🎭 SIGNIFICANCE: Why is it important culturally/historically?
📸 BEST PHOTO SPOTS:
  - Best angle to stand
  - Best time of day for lighting
  - Instagram-worthy details to capture
🎫 PRACTICAL INFO:
  - Entry fee (Indian/Foreign tourist)
  - Opening hours
  - Time needed to explore
  - What to wear (dress code if any)
⚡ HIDDEN DETAIL: One secret/lesser-known fact most tourists miss
🗺️ NEARBY: 2 places to visit within walking distance

Format like an AR overlay card. Use emojis. Be specific and accurate.`);
}));

// ── /api/ai/hartaalAlert ─────────────────────────────────────────────────────
// Power Outage & Hartaal (Strike) Alert
router.post('/hartaalAlert', handler(({ city, date }) => {
  const today = date || new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const month = new Date(date || Date.now()).toLocaleString('en-IN', { month:'long' });
  return callGeminiText(`You are a local news monitor for ${city}, India. Today is ${today}.

Provide a SAFETY & DISRUPTION REPORT for tourists visiting ${city}:

⚡ POWER SITUATION:
- Typical load-shedding schedule for ${city} (hours per day, common timings)
- Areas most affected
- How to prepare (carry powerbank, check hotel generator)

🚫 STRIKE/BANDH RISK:
- Any known recurring bandh days or politically sensitive dates around ${today}
- Which unions/groups commonly call strikes in ${city}
- Impact on transport (autos, buses, shops)

🌧️ SEASONAL DISRUPTIONS:
- Current weather risks (floods, extreme heat, etc.) for this time of year
- Road/transport issues common in ${month || 'this season'}

🏪 SHOP TIMING ALERTS:
- Weekly closing days for shops in ${city} (many cities have Mon/Tue closings)
- Festival-related shop closures typical for this time

✅ TOURIST SAFETY TIPS:
- 3 specific tips to handle disruptions in ${city}
- Emergency numbers specific to ${city} (local police station, hospital)

Be honest and practical. Use emojis. If specific current data unavailable, give historically accurate patterns for ${city}.`, { cache: true, cacheTtlMs: 60 * 60 * 1000 });
}));

// ── /api/ai/foodSafety ───────────────────────────────────────────────────────
// Street Food Safety Scanner
router.post('/foodSafety', handler(({ imageBase64, imageType, city }) => {
  return callGeminiVision(imageBase64, imageType,
    `You are a food safety expert and street food specialist for India.
Analyze this photo of a food stall/dish/street food in ${city || 'India'}.

Provide a FOOD SAFETY REPORT:

🍽️ FOOD IDENTIFIED: What dish/food is this?
⭐ HYGIENE RATING: X/10 (based on visible cleanliness, cooking method, storage)

🔍 HYGIENE ANALYSIS:
✅ Safe signs visible: (list what looks good)
⚠️ Concern signs: (list any hygiene concerns)

🌶️ DISH DETAILS:
- Main ingredients (what's in it)
- Spice level: Mild/Medium/Spicy/Very Spicy/Extreme
- Vegetarian/Non-vegetarian
- Common allergens

💰 FAIR PRICE: What this should cost in ${city || 'India'} (don't get overcharged!)

✅ SAFE TO EAT IF:
- Best time to buy (freshly made vs sitting out)
- What to check before ordering

⚠️ AVOID IF:
- Warning signs to watch for
- Who should be careful (sensitive stomach, allergies)

🏆 VERDICT: Eat it / Approach with caution / Skip it
👅 TASTE PREDICTION: What it will taste like

Be honest but encouraging. Street food is usually safe! Use emojis.`);
}));

// ── /api/ai/crowdPredict ─────────────────────────────────────────────────────
// AI Crowd Predictor
router.post('/crowdPredict', handler(({ city, stopName, cat, dayOfWeek, currentHour }) => {
  const day  = dayOfWeek  || new Date().toLocaleDateString('en-IN', { weekday:'long' });
  const hour = currentHour || new Date().getHours();
  return callGeminiText(`You are a crowd analytics expert for Indian tourist destinations.
Analyze crowd patterns for: ${stopName} in ${city}, India
Category: ${cat || 'tourist attraction'}
Current: ${day}, ${hour}:00

Provide a CROWD PREDICTION REPORT:

🕐 RIGHT NOW (${hour}:00 on ${day}):
Crowd Level: [Empty/Light/Moderate/Busy/Very Crowded/Avoid]
Wait Time: (estimated queue/wait time)
Parking: (easy/difficult/impossible)

📊 TODAY'S HOURLY FORECAST:
Show crowd levels for key hours today as a simple chart:
6am | 9am | 12pm | 3pm | 6pm | 9pm
[use emojis: 🟢 empty, 🟡 moderate, 🔴 crowded]

📅 BEST DAYS TO VISIT:
🥇 Best day: (specific day + why)
😐 Average day:
❌ Worst day: (avoid this day)

🎯 GOLDEN HOURS (least crowded):
- Exact time to arrive for minimum crowds
- How many minutes/hours to save vs peak time

💡 CROWD BEATING TIPS:
3 specific tips to avoid crowds at ${stopName}
(e.g., enter from which gate, book which ticket type, which day to avoid)

🚫 AVOID THESE TIMES:
Specific dates/times that are always overcrowded (holidays, weekends, festivals)

Use emojis. Be specific to ${city} culture and tourism patterns.`, { cache: true });
}));

// ── /api/ai/fareNegotiator ───────────────────────────────────────────────────
// Auto Fare Negotiator
router.post('/fareNegotiator', handler(({ city, fromPlace, toPlace, distanceKm, vehicleType }) => {
  const dist  = distanceKm  || '?';
  const vehicle = vehicleType || 'auto rickshaw';
  return callGeminiText(`You are a local resident of ${city} who knows every transport hack.
A tourist needs to go from ${fromPlace || 'current location'} to ${toPlace || 'destination'} by ${vehicle}.
Distance: ~${dist} km

Provide the ULTIMATE FARE NEGOTIATION GUIDE:

💰 FAIR PRICE BREAKDOWN:
- Meter fare (if meter used): ₹___
- Typical negotiated fare: ₹___ to ₹___
- Maximum you should pay: ₹___
- Tourist trap price (what they'll first quote): ₹___

🗣️ NEGOTIATION SCRIPT (in Hindi/local language + English):
Opening line: "___" (say this first)
Counter offer: "___" (when they quote too high)
Final offer: "___" (take it or leave it)
Walk away line: "___" (if they refuse)

📱 APP ALTERNATIVE:
- Ola estimated fare: ₹___
- Uber estimated fare: ₹___
- Rapido (if bike taxi): ₹___
Recommendation: App vs negotiated auto (which is better here?)

⚠️ TOURIST TRAPS TO AVOID:
3 common scams for this route and how to avoid them

✅ HOW TO FIND HONEST DRIVERS:
Specific tips for finding trustworthy autos/taxis in ${city}

🕐 TIME & TRAFFIC:
- Journey time without traffic: ___ minutes
- Peak hour time: ___ minutes  
- Best time to travel this route

🚌 CHEAPER ALTERNATIVE:
Is there a bus/metro/share auto option? Cost and details.

Be very specific with prices for ${city}. Use ₹ symbol. Use emojis.`, { cache: true });
}));

// ── /api/ai/tripTribe ────────────────────────────────────────────────────────
// Trip Tribe matchmaking profile generator
router.post('/tripTribe', handler(({ city, userName, interests, travelStyle, dates }) => {
  return callGeminiText(`Generate a fun Trip Tribe traveller profile for someone visiting ${city}.

Name: ${userName || 'Traveller'}
Interests: ${(interests || []).join(', ') || 'sightseeing, food, culture'}
Travel Style: ${travelStyle || 'budget backpacker'}
Dates: ${dates || 'this weekend'}

Create:
1. A fun traveller bio (2 sentences, first person, with emoji)
2. Their travel personality type (e.g. "The Foodie Explorer 🍛", "The History Buff 📜")
3. Top 3 things they want to do in ${city}
4. What kind of travel buddy they're looking for
5. Their travel motto (one catchy line)

Keep it fun, friendly and accurate to ${city}. Use emojis throughout.`, { cache: true });
}));

module.exports = router;