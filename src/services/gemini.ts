import { buildFeedbackContext } from "../storage";
import {
  AutomationBrief,
  FeedbackExample,
  ProductBrief,
  ScriptPostPackage,
  StrategyOutput,
  VideoScript,
} from "../types";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

type GenerateStrategyParams = {
  apiKey: string;
  product: ProductBrief;
  feedbackExamples: FeedbackExample[];
};

type GenerateAutomationParams = {
  apiKey: string;
  input: AutomationBrief;
  feedbackExamples: FeedbackExample[];
};

function extractText(payload: unknown): string {
  const data = payload as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };

  if (data.error?.message) {
    throw new Error(data.error.message);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked this request: ${data.promptFeedback.blockReason}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}

function tryParseJSON(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(raw.slice(first, last + 1)) as Record<string, unknown>;
    }
    throw new Error("Model response was not valid JSON.");
  }
}

function asStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function asNestedStringArray(input: unknown): string[][] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((group) => asStringArray(group))
    .filter((group) => group.length > 0);
}

function normalizeVideoScripts(input: unknown): VideoScript[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item, index) => {
      const typed = item as Partial<VideoScript> | undefined;
      const title = typeof typed?.title === "string" ? typed.title : `Script ${index + 1}`;
      const script = typeof typed?.script === "string" ? typed.script : "";
      const durationSec =
        typeof typed?.durationSec === "number" && Number.isFinite(typed.durationSec)
          ? typed.durationSec
          : 35;

      if (!script.trim()) {
        return null;
      }

      return {
        title: title.trim(),
        script: script.trim(),
        durationSec,
      };
    })
    .filter((item): item is VideoScript => Boolean(item));
}

function normalizeScriptPostPackages(
  input: unknown,
  videoScripts: VideoScript[],
  captions: string[],
  hashtagSets: string[][],
): ScriptPostPackage[] {
  if (!Array.isArray(input)) {
    return videoScripts.map((script, index) => ({
      scriptTitle: script.title,
      postTitle: script.title,
      postDescription:
        captions[index] ??
        captions[0] ??
        `Try this ${script.title.toLowerCase()} angle for your TikTok post.`,
      hashtags: hashtagSets[index] ?? hashtagSets[0] ?? [],
    }));
  }

  const parsed = input
    .map((item, index) => {
      const typed = item as Partial<ScriptPostPackage> | undefined;
      const sourceScript = videoScripts[index];
      const scriptTitle =
        typeof typed?.scriptTitle === "string" && typed.scriptTitle.trim()
          ? typed.scriptTitle.trim()
          : sourceScript?.title ?? `Script ${index + 1}`;
      const postTitle =
        typeof typed?.postTitle === "string" && typed.postTitle.trim()
          ? typed.postTitle.trim()
          : scriptTitle;
      const postDescription =
        typeof typed?.postDescription === "string" && typed.postDescription.trim()
          ? typed.postDescription.trim()
          : captions[index] ??
            captions[0] ??
            `For ${scriptTitle}: show quick demo, proof, and CTA in Taglish.`;
      const hashtags = asStringArray((typed as { hashtags?: unknown })?.hashtags);

      return {
        scriptTitle,
        postTitle,
        postDescription,
        hashtags: hashtags.length ? hashtags : hashtagSets[index] ?? hashtagSets[0] ?? [],
      };
    })
    .filter((item) => item.postTitle.trim().length > 0);

  if (!parsed.length) {
    return videoScripts.map((script, index) => ({
      scriptTitle: script.title,
      postTitle: script.title,
      postDescription:
        captions[index] ??
        captions[0] ??
        `Try this ${script.title.toLowerCase()} angle for your TikTok post.`,
      hashtags: hashtagSets[index] ?? hashtagSets[0] ?? [],
    }));
  }

  return parsed;
}

function normalizeOutput(raw: Record<string, unknown>): StrategyOutput {
  const positioningRaw = (raw.positioning ?? {}) as Record<string, unknown>;
  const captions = asStringArray(raw.captions);
  const hashtagSets = asNestedStringArray(raw.hashtagSets);
  const videoScripts = normalizeVideoScripts(raw.videoScripts);

  return {
    strategySummary:
      typeof raw.strategySummary === "string" ? raw.strategySummary : "No summary generated.",
    positioning: {
      audience:
        typeof positioningRaw.audience === "string"
          ? positioningRaw.audience
          : "Not provided.",
      painPoint:
        typeof positioningRaw.painPoint === "string"
          ? positioningRaw.painPoint
          : "Not provided.",
      offerAngle:
        typeof positioningRaw.offerAngle === "string"
          ? positioningRaw.offerAngle
          : "Not provided.",
    },
    assumptions: asStringArray(raw.assumptions),
    hooks: asStringArray(raw.hooks),
    videoScripts,
    scriptPostPackages: normalizeScriptPostPackages(
      raw.scriptPostPackages,
      videoScripts,
      captions,
      hashtagSets,
    ),
    ctaOptions: asStringArray(raw.ctaOptions),
    captions,
    hashtagSets,
    postingPlan14Days: asStringArray(raw.postingPlan14Days),
    livePlan: asStringArray(raw.livePlan),
    abTests: asStringArray(raw.abTests),
    kpiFocus: asStringArray(raw.kpiFocus),
    nextActions24h: asStringArray(raw.nextActions24h),
  };
}

const SHARED_OUTPUT_SHAPE = `
{
  "strategySummary": "string",
  "positioning": {
    "audience": "string",
    "painPoint": "string",
    "offerAngle": "string"
  },
  "assumptions": ["string", "string"],
  "hooks": ["string", "string", "string", "string", "string", "string"],
  "videoScripts": [
    {"title":"Script 1","durationSec":35,"script":"string"},
    {"title":"Script 2","durationSec":35,"script":"string"},
    {"title":"Script 3","durationSec":35,"script":"string"}
  ],
  "scriptPostPackages": [
    {
      "scriptTitle":"Script 1",
      "postTitle":"string",
      "postDescription":"string",
      "hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]
    },
    {
      "scriptTitle":"Script 2",
      "postTitle":"string",
      "postDescription":"string",
      "hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]
    },
    {
      "scriptTitle":"Script 3",
      "postTitle":"string",
      "postDescription":"string",
      "hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"]
    }
  ],
  "ctaOptions": ["string", "string", "string", "string"],
  "captions": ["string", "string", "string"],
  "hashtagSets": [
    ["#tag1","#tag2","#tag3","#tag4","#tag5"],
    ["#tag1","#tag2","#tag3","#tag4","#tag5"],
    ["#tag1","#tag2","#tag3","#tag4","#tag5"]
  ],
  "postingPlan14Days": ["Day 1 - ...", "Day 2 - ..."],
  "livePlan": ["string", "string", "string", "string"],
  "abTests": ["string", "string", "string", "string"],
  "kpiFocus": ["string", "string", "string", "string"],
  "nextActions24h": ["string", "string", "string", "string"]
}
`.trim();

function buildGuidedPrompt(product: ProductBrief, feedbackExamples: FeedbackExample[]): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);

  return `
You are a senior TikTok Shop affiliate strategist focused on Philippines market.

Goal:
- Create a highly practical Taglish strategy that increases viral reach and conversion/sales.
- Keep output realistic for a solo creator.

Product input:
- Product name: ${product.productName}
- Niche: ${product.niche}
- Description: ${product.productDescription}
- Features: ${product.features}
- Price: ${product.price}
- Target audience: ${product.targetAudience}
- Goal: ${product.goal}
- Offer details: ${product.offerDetails}
- Common objections: ${product.objections}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Keep recommendations compliant and non-deceptive.
- For "assumptions", only include assumptions if needed, else return [].
- For "scriptPostPackages", generate one package per script.
- postTitle should be scroll-stopping and concise.
- postDescription should be posting-ready with clear CTA.
- hashtags should be relevant and non-spammy.

Return JSON with this exact shape:
${SHARED_OUTPUT_SHAPE}
`.trim();
}

function buildAutomationPrompt(
  input: AutomationBrief,
  feedbackExamples: FeedbackExample[],
): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);

  return `
You are an automation strategist for TikTok Shop affiliates in the Philippines.

Task:
- The user gives minimal product information.
- You infer the missing marketing strategy details safely and clearly.
- Build conversion-focused but ethical Taglish content.

Minimal product input:
- Product name: ${input.productName}
- Product info: ${input.productInfo}
- Product details and specs: ${input.productDetails}
- Price: ${input.price}
- Brand tone preference: ${input.brandTone}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Keep recommendations compliant and non-deceptive.
- Fill "assumptions" with the inferred audience/pain/offer assumptions.
- Focus on script-ready output, no long theory.
- For "scriptPostPackages", generate one package per script.
- postTitle should be scroll-stopping and concise.
- postDescription should be posting-ready with clear CTA.
- hashtags should be relevant and non-spammy.

Return JSON with this exact shape:
${SHARED_OUTPUT_SHAPE}
`.trim();
}

async function executePrompt(apiKey: string, prompt: string): Promise<StrategyOutput> {
  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string } }).error?.message ??
      `Gemini API request failed with status ${response.status}.`;
    throw new Error(message);
  }

  const rawText = extractText(payload);
  const parsed = tryParseJSON(rawText);
  return normalizeOutput(parsed);
}

export async function generateAffiliateStrategy({
  apiKey,
  product,
  feedbackExamples,
}: GenerateStrategyParams): Promise<StrategyOutput> {
  if (!apiKey.trim()) {
    throw new Error("Missing Gemini API key.");
  }

  const prompt = buildGuidedPrompt(product, feedbackExamples);
  return executePrompt(apiKey, prompt);
}

export async function generateAutomationStrategy({
  apiKey,
  input,
  feedbackExamples,
}: GenerateAutomationParams): Promise<StrategyOutput> {
  if (!apiKey.trim()) {
    throw new Error("Missing Gemini API key.");
  }

  const prompt = buildAutomationPrompt(input, feedbackExamples);
  return executePrompt(apiKey, prompt);
}
