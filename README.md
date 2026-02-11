# Affiliate Script AI Coach (Mobile)

Mobile app (Expo React Native) for TikTok affiliates:
- Two workflow options:
  - `Option 1: Guided Strategy Studio` (detailed inputs, high control)
  - `Option 2: AutoPilot Automation` (minimal input, AI infers strategy)
- Generate Taglish hooks, scripts, CTA, captions, and 14-day plan using Gemini.
- Generate per-script posting kits: `post title + post description + hashtags` for each script.
- Save product profiles locally.
- Save feedback locally and reuse it as alignment context for future outputs.

## 1) Setup

1. Install dependencies:
```bash
npm install
```

2. Add environment key:
```bash
copy .env.example .env
```

3. Edit `.env`:
```bash
EXPO_PUBLIC_GEMINI_API_KEY=YOUR_REAL_KEY
```

4. Start app:
```bash
npm run start
```

Use Expo Go on mobile or emulator.

## 2) App Interface

The actual app interface is rendered from:
- `App.tsx`

Inside the app, look for the workflow switch:
- `Option 1: Guided`
- `Option 2: AutoPilot`

## 3) Workflow options

### Option 1: Guided Strategy Studio
- For affiliates who want to control audience, pain points, and offer details.
- Best for precise strategy testing and A/B iterations.

### Option 2: AutoPilot Automation
- For affiliates who want speed with minimal inputs.
- You provide product name + product info/details, and AI infers:
  - audience
  - content angle
  - hooks
  - scripts
  - posting plan

## 4) Important note on "training Gemini"

This app implements practical response alignment through:
- stored feedback memory
- prompt conditioning with your own examples

Direct model tuning for Gemini is not done from this app using a plain API key.  
For true fine-tuning/tuned-model workflows, use Google Cloud Vertex AI tuned model flow.

## 5) Security

- Do not hardcode API keys in source files.
- Keep `.env` private.
- If your key was shared publicly, rotate it immediately in Google AI Studio/Cloud.

## 6) Vercel deployment

This project is configured for static Expo web export on Vercel:
- `buildCommand`: `npm run build:web`
- `outputDirectory`: `dist`

If Vercel still shows a downloaded/unknown file:
1. In Vercel Project Settings, set **Framework Preset** to `Other`.
2. Ensure **Root Directory** is this app folder (where `package.json` exists).
3. Redeploy after pulling latest commit.
