import { buildFeedbackContext, buildFeedbackDirectives } from "../storage";
import {
  AutomationBrief,
  FeedbackExample,
  LiveFaqItem,
  LiveFollowUpOutput,
  LiveSellingBrief,
  LiveSellingOutput,
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

type GenerateLiveSellingParams = {
  apiKey: string;
  input: LiveSellingBrief;
  feedbackExamples: FeedbackExample[];
};

type GenerateLiveFollowUpParams = {
  apiKey: string;
  input: LiveSellingBrief;
  question: string;
  liveOutput?: LiveSellingOutput | null;
  feedbackExamples: FeedbackExample[];
};

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractForbiddenPriceTokens(priceInput: string): string[] {
  if (!priceInput.trim()) {
    return [];
  }

  const rawTokens = priceInput.match(/\d[\d,.]*/g) ?? [];
  const normalized = rawTokens
    .map((item) => item.replace(/,/g, "").trim())
    .map((item) => item.replace(/\.(?=.*\.)/g, ""))
    .filter(Boolean)
    .filter((item) => /\d/.test(item))
    .filter((item) => {
      const digitsOnly = item.replace(/[^\d]/g, "");
      if (!digitsOnly) {
        return false;
      }
      if (digitsOnly.length >= 3) {
        return true;
      }
      const numeric = Number(digitsOnly);
      return Number.isFinite(numeric) && numeric >= 10;
    });

  return Array.from(new Set(normalized));
}

function buildPriceContext(priceInput: string): string {
  if (!priceInput.trim()) {
    return "Not provided.";
  }

  const numericValues = extractForbiddenPriceTokens(priceInput)
    .map((item) => Number(item.replace(/[^\d.]/g, "")))
    .filter((item) => Number.isFinite(item) && item > 0);

  if (!numericValues.length) {
    return "User provided price context. Treat as variable and avoid exact numbers.";
  }

  const anchor = Math.max(...numericValues);
  const budgetTier =
    anchor < 500
      ? "entry-level budget segment"
      : anchor < 2000
        ? "budget segment"
        : anchor < 5000
          ? "mid-range segment"
          : anchor < 15000
            ? "upper mid-range segment"
            : "premium segment";

  return `${budgetTier} in PH market. Exact seller pricing changes often, so do not mention exact numeric price.`;
}

function buildPriceTokenVariants(token: string): string[] {
  const trimmed = token.trim();
  const cleaned = trimmed.replace(/[^\d.]/g, "");
  const digitsOnly = cleaned.replace(/[^\d]/g, "");
  if (!digitsOnly) {
    return [];
  }

  const commaFormatted = digitsOnly.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const spacedFormatted = commaFormatted.replace(/,/g, " ");
  const dotFormatted = commaFormatted.replace(/,/g, ".");

  return Array.from(
    new Set(
      [
        trimmed,
        cleaned,
        digitsOnly,
        commaFormatted,
        spacedFormatted,
        dotFormatted,
      ].filter(Boolean),
    ),
  );
}

function buildPriceTokenPattern(token: string): RegExp {
  const variants = buildPriceTokenVariants(token)
    .map((item) => escapeRegExp(item))
    .join("|");
  if (!variants) {
    return /$^/g;
  }

  const amountPattern = `(?:${variants})(?:\\.0+)?(?:\\+)?`;
  const contextualPrefix =
    "(?:price|priced|for|at|worth|only|just|around|under|below|from|srp|budget|as\\s*low\\s*as|starting\\s*at|less\\s*than)";

  return new RegExp(
    `(?:\\b(?:\\u20B1|PHP|P)\\s*${amountPattern}\\b|\\b${contextualPrefix}\\s*(?:na\\s*)?(?:lang\\s*)?(?:\\u20B1|PHP|P)?\\s*${amountPattern}\\b|\\b${amountPattern}\\b)`,
    "gi",
  );
}

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

function normalizeLiveFaqs(input: unknown): LiveFaqItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      const typed = item as Partial<LiveFaqItem> | undefined;
      const question =
        typeof typed?.question === "string" ? typed.question.trim() : "";
      const answer = typeof typed?.answer === "string" ? typed.answer.trim() : "";
      if (!question || !answer) {
        return null;
      }
      return { question, answer };
    })
    .filter((item): item is LiveFaqItem => Boolean(item));
}

function ensureMinChars(value: string, min: number, fallback: string): string {
  const next = value.trim();
  if (next.length >= min) {
    return next;
  }
  if (fallback.trim().length >= min) {
    return fallback.trim();
  }
  return `${fallback.trim()} ${".".repeat(Math.max(0, min - fallback.trim().length))}`.trim();
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

type TextGuardrailRule = {
  note: string;
  pattern: RegExp;
  replacement: string;
};

const CLAIM_GUARDRAILS: TextGuardrailRule[] = [
  {
    note: "Avoided absolute superiority claim phrasing (e.g., No.1 / #1).",
    pattern: /\b(?:no\.?\s*1|number\s*1|#1)\b/gi,
    replacement: "popular option",
  },
  {
    note: "Avoided unverifiable superlative claim phrasing (e.g., the best).",
    pattern: /\bthe\s+best\b/gi,
    replacement: "a strong option",
  },
  {
    note: "Avoided uniqueness claim phrasing (e.g., the first / the only).",
    pattern: /\bthe\s+(?:first|only)\b/gi,
    replacement: "one option",
  },
  {
    note: "Avoided absolute quality claim phrasing (e.g., perfect).",
    pattern: /\bperfect\b/gi,
    replacement: "helpful",
  },
  {
    note: "Avoided medical miracle/cure claim phrasing.",
    pattern: /\b(?:miracle|cure|cures|cured|heal|heals|healed|treat|treats|treated)\b/gi,
    replacement: "support",
  },
  {
    note: "Avoided instant result claim phrasing.",
    pattern: /\binstant(?:ly)?\b/gi,
    replacement: "consistent",
  },
  {
    note: "Avoided before-and-after dramatic improvement phrasing.",
    pattern: /\bbefore[-\s]*(?:and|&)?[-\s]*after\b/gi,
    replacement: "real usage",
  },
  {
    note: "Avoided absolute natural composition claim phrasing (e.g., 100% natural).",
    pattern: /\b(?:100%\s*natural|all[-\s]*natural|chemical[-\s]*free)\b/gi,
    replacement: "ingredient-focused",
  },
];

const AFFILIATE_VOICE_GUARDRAILS: TextGuardrailRule[] = [
  {
    note: "Adjusted seller/manufacturer phrasing to affiliate voice.",
    pattern: /\b(?:we|kami)\s+(?:sell|manufacture|produce|make|offer)\b/gi,
    replacement: "as affiliate, I recommend",
  },
  {
    note: "Adjusted company guarantee phrasing to affiliate-safe wording.",
    pattern: /\bwe\s+(?:ensure|guarantee|provide)\b/gi,
    replacement: "seller details indicate",
  },
  {
    note: "Adjusted ownership phrasing to affiliate-safe wording.",
    pattern: /\b(?:our|aming|naming)\s+products?\b/gi,
    replacement: "this product",
  },
  {
    note: "Adjusted ownership phrasing to affiliate-safe wording.",
    pattern: /\b(?:our|aming|naming)\s+brand\b/gi,
    replacement: "the brand",
  },
  {
    note: "Adjusted ownership phrasing to affiliate-safe wording.",
    pattern: /\b(?:our|aming|naming)\s+customers?\b/gi,
    replacement: "buyers",
  },
  {
    note: "Adjusted seller phrasing to affiliate-safe wording.",
    pattern: /\b(?:binibenta|binebenta)\s+namin\s+ay\s+original\b/gi,
    replacement: "seller listing indicates the product is original",
  },
  {
    note: "Adjusted seller phrasing to affiliate-safe wording.",
    pattern: /\b(?:binibenta|binebenta)\s+namin\b/gi,
    replacement: "ni-recommend ko as affiliate",
  },
  {
    note: "Adjusted company-assurance phrasing to affiliate-safe wording.",
    pattern: /\b(?:rest\s+assured|sigurado\s+kami|panatag\s+kami)\b/gi,
    replacement: "based on seller information",
  },
  {
    note: "Adjusted store ownership phrasing to affiliate-safe wording.",
    pattern: /\b(?:sa|from)\s+(?:aming|our)\s+(?:store|shop)\b/gi,
    replacement: "from seller shop",
  },
];

const PRICE_GUARDRAILS: TextGuardrailRule[] = [
  {
    note: "Replaced exact price statements with dynamic price-check wording.",
    pattern:
      /(?:\u20B1\s?(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?|\bPHP\s?(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?|\bP\s?(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?|\b(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?\s?(?:php|pesos?)\b)/gi,
    replacement: "latest price in yellow basket",
  },
  {
    note: "Replaced contextual exact price statements with dynamic price-check wording.",
    pattern:
      /\b(?:price|priced|for|at|worth|only|just|around|under|below|from|srp|budget|as\s*low\s*as|starting\s*at|less\s*than)\s*(?:na\s*)?(?:lang\s*)?(?:\u20B1|PHP|P)?\s*(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?\b/gi,
    replacement: "latest price in yellow basket",
  },
  {
    note: "Replaced range/anchor price phrasing with dynamic price-check wording.",
    pattern:
      /\b(?:under|below|around|less\s*than|starting\s*at|from|as\s*low\s*as)\s*(?:\u20B1|PHP|P)?\s*(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?\b/gi,
    replacement: "check latest price in yellow basket",
  },
  {
    note: "Replaced exact amount + lang/only price phrasing with dynamic wording.",
    pattern:
      /\b(?:\u20B1|PHP|P)?\s*(?:\d{3,}|\d{1,3}(?:[,.]\d{3})+)(?:[.,]\d+)?(?:\+)?\s*(?:na\s*)?(?:lang|only)\b/gi,
    replacement: "check latest price in yellow basket",
  },
];

const DEFAULT_COMPLIANCE_NOTES = [
  "Avoid absolute or superlative claims (e.g., No.1, best, first, only, perfect) unless verifiable.",
  "Avoid medical/miracle/cure claims and instant-result promises.",
  "Avoid before-and-after dramatic transformation claims.",
  "Use dynamic price phrasing and avoid exact hardcoded prices in content.",
];

const DEFAULT_LIVE_COMPLIANCE_NOTES = [
  "Use only verifiable product statements and avoid absolute claims.",
  "Do not mention exact fixed prices; tell viewers to check latest basket/shop price.",
  "For health/beauty claims, avoid cure or instant-result language.",
  "If unsure about a viewer question, answer safely and suggest checking official product details.",
];

function sanitizeText(
  value: string,
  notes: Set<string>,
  forbiddenPriceTokens: string[] = [],
): string {
  let next = value;

  for (const rule of AFFILIATE_VOICE_GUARDRAILS) {
    const replaced = next.replace(rule.pattern, rule.replacement);
    if (replaced !== next) {
      notes.add(rule.note);
      next = replaced;
    }
  }

  for (const rule of CLAIM_GUARDRAILS) {
    const replaced = next.replace(rule.pattern, rule.replacement);
    if (replaced !== next) {
      notes.add(rule.note);
      next = replaced;
    }
  }

  for (const rule of PRICE_GUARDRAILS) {
    const replaced = next.replace(rule.pattern, rule.replacement);
    if (replaced !== next) {
      notes.add(rule.note);
      next = replaced;
    }
  }

  if (/(?:\u20B1\s*\d[\d,.+]*|\b(?:PHP|P)\s*\d[\d,.+]*)/i.test(next)) {
    notes.add("Removed remaining exact currency price references.");
    next = next.replace(
      /(?:\u20B1\s*\d[\d,.+]*|\b(?:PHP|P)\s*\d[\d,.+]*)/gi,
      "latest price in yellow basket",
    );
  }

  for (const token of forbiddenPriceTokens) {
    const pattern = buildPriceTokenPattern(token);
    const replaced = next.replace(pattern, "latest price in yellow basket");
    if (replaced !== next) {
      notes.add("Removed exact user-input price token from generated content.");
      next = replaced;
    }
  }

  return next.replace(/\s{2,}/g, " ").trim();
}

function sanitizeHashtag(
  tag: string,
  notes: Set<string>,
  forbiddenPriceTokens: string[] = [],
): string | null {
  const trimmed = tag.trim();
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase().replace(/\s+/g, "");
  if (
    /(?:no1|number1|#1|best|first|only|perfect|miracle|instant|beforeafter|100natural|allnatural|chemicalfree|cure|heal|treat)/.test(
      lower,
    )
  ) {
    notes.add("Removed risky hashtag claims that could violate policy.");
    return null;
  }

  if (
    /(?:\u20B1\s?\d|php\s?\d|p\s?\d|\d\s?(?:php|pesos?)|(?:under|below|around|from|srp|budget)\s*\d)/i.test(
      trimmed,
    )
  ) {
    notes.add("Removed exact price references from hashtags.");
    return null;
  }

  for (const token of forbiddenPriceTokens) {
    const pattern = buildPriceTokenPattern(token);
    if (pattern.test(trimmed)) {
      notes.add("Removed user-input price token from hashtags.");
      return null;
    }
  }

  const compact = `#${trimmed.replace(/^#+/, "").replace(/\s+/g, "")}`;
  return compact.length > 1 ? compact : null;
}

function sanitizeHashtagGroup(
  tags: string[],
  notes: Set<string>,
  forbiddenPriceTokens: string[] = [],
): string[] {
  return tags
    .map((tag) => sanitizeHashtag(tag, notes, forbiddenPriceTokens))
    .filter((tag): tag is string => Boolean(tag));
}

function normalizeOutput(
  raw: Record<string, unknown>,
  forbiddenPriceTokens: string[] = [],
): StrategyOutput {
  const positioningRaw = (raw.positioning ?? {}) as Record<string, unknown>;
  const complianceNotes = new Set<string>(asStringArray(raw.complianceNotes));
  const rawCaptions = asStringArray(raw.captions);
  const rawHashtagSets = asNestedStringArray(raw.hashtagSets);
  const rawVideoScripts = normalizeVideoScripts(raw.videoScripts);
  const rawScriptPostPackages = normalizeScriptPostPackages(
    raw.scriptPostPackages,
    rawVideoScripts,
    rawCaptions,
    rawHashtagSets,
  );

  const captions = rawCaptions.map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const hashtagSets = rawHashtagSets.map((group) =>
    sanitizeHashtagGroup(group, complianceNotes, forbiddenPriceTokens),
  );
  const videoScripts = rawVideoScripts.map((item) => ({
    ...item,
    title: sanitizeText(item.title, complianceNotes, forbiddenPriceTokens),
    script: sanitizeText(item.script, complianceNotes, forbiddenPriceTokens),
  }));
  const scriptPostPackages = rawScriptPostPackages.map((item) => ({
    scriptTitle: sanitizeText(item.scriptTitle, complianceNotes, forbiddenPriceTokens),
    postTitle: sanitizeText(item.postTitle, complianceNotes, forbiddenPriceTokens),
    postDescription: sanitizeText(
      item.postDescription,
      complianceNotes,
      forbiddenPriceTokens,
    ),
    hashtags: sanitizeHashtagGroup(
      item.hashtags,
      complianceNotes,
      forbiddenPriceTokens,
    ),
  }));
  for (const note of DEFAULT_COMPLIANCE_NOTES) {
    if (complianceNotes.size >= 3) {
      break;
    }
    complianceNotes.add(note);
  }

  return {
    strategySummary:
      typeof raw.strategySummary === "string"
        ? sanitizeText(raw.strategySummary, complianceNotes, forbiddenPriceTokens)
        : "No summary generated.",
    complianceNotes: Array.from(complianceNotes),
    positioning: {
      audience:
        typeof positioningRaw.audience === "string"
          ? sanitizeText(
              positioningRaw.audience,
              complianceNotes,
              forbiddenPriceTokens,
            )
          : "Not provided.",
      painPoint:
        typeof positioningRaw.painPoint === "string"
          ? sanitizeText(
              positioningRaw.painPoint,
              complianceNotes,
              forbiddenPriceTokens,
            )
          : "Not provided.",
      offerAngle:
        typeof positioningRaw.offerAngle === "string"
          ? sanitizeText(
              positioningRaw.offerAngle,
              complianceNotes,
              forbiddenPriceTokens,
            )
          : "Not provided.",
    },
    assumptions: asStringArray(raw.assumptions).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    hooks: asStringArray(raw.hooks).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    videoScripts,
    scriptPostPackages,
    ctaOptions: asStringArray(raw.ctaOptions).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    captions,
    hashtagSets,
    postingPlan14Days: asStringArray(raw.postingPlan14Days).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    livePlan: asStringArray(raw.livePlan).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    abTests: asStringArray(raw.abTests).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    kpiFocus: asStringArray(raw.kpiFocus).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
    nextActions24h: asStringArray(raw.nextActions24h).map((item) =>
      sanitizeText(item, complianceNotes, forbiddenPriceTokens),
    ),
  };
}

function normalizeLiveOutput(
  raw: Record<string, unknown>,
  input: LiveSellingBrief,
  forbiddenPriceTokens: string[] = [],
): LiveSellingOutput {
  const complianceNotes = new Set<string>(asStringArray(raw.complianceNotes));

  const openingLines = asStringArray(raw.openingLines).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const productPitchLines = asStringArray(raw.productPitchLines).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const lowViewerRepeatLines = asStringArray(raw.lowViewerRepeatLines).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const highViewerRepeatLines = asStringArray(raw.highViewerRepeatLines).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const engagementPrompts = asStringArray(raw.engagementPrompts).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const closingLines = asStringArray(raw.closingLines).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );
  const randomQuestionFramework = asStringArray(raw.randomQuestionFramework).map((item) =>
    sanitizeText(item, complianceNotes, forbiddenPriceTokens),
  );

  const faqs = normalizeLiveFaqs(raw.faqs).map((item) => ({
    question: sanitizeText(item.question, complianceNotes, forbiddenPriceTokens),
    answer: sanitizeText(item.answer, complianceNotes, forbiddenPriceTokens),
  }));

  const liveTitleRaw =
    typeof raw.liveTitle === "string"
      ? sanitizeText(raw.liveTitle, complianceNotes, forbiddenPriceTokens)
      : "";
  const aboutMeRaw =
    typeof raw.aboutMe === "string"
      ? sanitizeText(raw.aboutMe, complianceNotes, forbiddenPriceTokens)
      : "";

  const liveTitle = ensureMinChars(
    liveTitleRaw,
    15,
    `Live demo: ${input.productName || "Product picks tonight"}`,
  );
  const aboutMe = ensureMinChars(
    aboutMeRaw,
    30,
    "Sharing honest live demos, practical tips, and safe product guidance.",
  );

  const safeOpeningLines = openingLines.length
    ? openingLines
    : [
        sanitizeText(
          "Hi mga ka-live, quick demo tayo ngayon para makita ninyo if fit sa needs ninyo.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeProductPitchLines = productPitchLines.length
    ? productPitchLines
    : [
        sanitizeText(
          "Focus tayo sa actual features at real use case para clear kung para kanino siya.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeLowViewerRepeatLines = lowViewerRepeatLines.length
    ? lowViewerRepeatLines
    : [
        sanitizeText(
          "Replay friendly ito, i-recap ko ulit ang key features at paano gamitin.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeHighViewerRepeatLines = highViewerRepeatLines.length
    ? highViewerRepeatLines
    : [
        sanitizeText(
          "Welcome sa bagong pasok, quick recap tayo then sagutin ko live questions ninyo.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeEngagementPrompts = engagementPrompts.length
    ? engagementPrompts
    : [
        sanitizeText(
          "Comment your use case para ma-suggest ko if bagay ito sa setup ninyo.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeClosingLines = closingLines.length
    ? closingLines
    : [
        sanitizeText(
          "Check the yellow basket for latest details, then ask me before checkout if may concern.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];
  const safeFaqs = faqs.length
    ? faqs
    : [
        {
          question: "Paano ko malalaman kung fit ito sa needs ko?",
          answer: sanitizeText(
            "I-compare natin sa gamit mo ngayon, then tingnan natin kung solve nito ang main problem mo.",
            complianceNotes,
            forbiddenPriceTokens,
          ),
        },
        {
          question: "Magkano ito ngayon?",
          answer: sanitizeText(
            "Price changes per promo, so please check latest price in yellow basket bago checkout.",
            complianceNotes,
            forbiddenPriceTokens,
          ),
        },
      ];
  const safeRandomQuestionFramework = randomQuestionFramework.length
    ? randomQuestionFramework
    : [
        sanitizeText(
          "Kung wala sa FAQ, clarify muna ang exact need ng viewer bago sumagot.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
        sanitizeText(
          "Kung hindi verified ang claim, sabihin na for guidance only at i-check ang official details.",
          complianceNotes,
          forbiddenPriceTokens,
        ),
      ];

  for (const note of DEFAULT_LIVE_COMPLIANCE_NOTES) {
    if (complianceNotes.size >= 4) {
      break;
    }
    complianceNotes.add(note);
  }

  return {
    liveTitle,
    aboutMe,
    openingLines: safeOpeningLines,
    productPitchLines: safeProductPitchLines,
    lowViewerRepeatLines: safeLowViewerRepeatLines,
    highViewerRepeatLines: safeHighViewerRepeatLines,
    engagementPrompts: safeEngagementPrompts,
    closingLines: safeClosingLines,
    faqs: safeFaqs,
    randomQuestionFramework: safeRandomQuestionFramework,
    complianceNotes: Array.from(complianceNotes),
  };
}

function normalizeLiveFollowUpOutput(
  raw: Record<string, unknown>,
  question: string,
  forbiddenPriceTokens: string[] = [],
): LiveFollowUpOutput {
  const complianceNotes = new Set<string>(asStringArray(raw.complianceNotes));
  const answer =
    typeof raw.answer === "string"
      ? sanitizeText(raw.answer, complianceNotes, forbiddenPriceTokens)
      : "";
  const fallbackIfUnsure =
    typeof raw.fallbackIfUnsure === "string"
      ? sanitizeText(raw.fallbackIfUnsure, complianceNotes, forbiddenPriceTokens)
      : "";

  const safeAnswer =
    answer ||
    sanitizeText(
      "Great question. For accuracy, let me confirm the exact product details first, then I’ll guide you clearly.",
      complianceNotes,
      forbiddenPriceTokens,
    );
  const safeFallback =
    fallbackIfUnsure ||
    sanitizeText(
      "I want to keep this accurate, so I will stick to verified product info and ask you to check current shop details in basket.",
      complianceNotes,
      forbiddenPriceTokens,
    );

  for (const note of DEFAULT_LIVE_COMPLIANCE_NOTES) {
    if (complianceNotes.size >= 3) {
      break;
    }
    complianceNotes.add(note);
  }

  return {
    question: question.trim(),
    answer: safeAnswer,
    fallbackIfUnsure: safeFallback,
    complianceNotes: Array.from(complianceNotes),
  };
}

const SHARED_OUTPUT_SHAPE = `
{
  "strategySummary": "string",
  "complianceNotes": [
    "string"
  ],
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

const LIVE_OUTPUT_SHAPE = `
{
  "liveTitle": "string (at least 15 characters)",
  "aboutMe": "string (at least 30 characters)",
  "openingLines": ["string", "string", "string", "string"],
  "productPitchLines": ["string", "string", "string", "string", "string"],
  "lowViewerRepeatLines": ["string", "string", "string", "string"],
  "highViewerRepeatLines": ["string", "string", "string", "string"],
  "engagementPrompts": ["string", "string", "string", "string"],
  "closingLines": ["string", "string", "string"],
  "faqs": [
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"},
    {"question":"string", "answer":"string"}
  ],
  "randomQuestionFramework": ["string", "string", "string", "string"],
  "complianceNotes": ["string", "string", "string", "string"]
}
`.trim();

const LIVE_FOLLOW_UP_SHAPE = `
{
  "answer": "string",
  "fallbackIfUnsure": "string",
  "complianceNotes": ["string", "string", "string"]
}
`.trim();

function buildGuidedPrompt(product: ProductBrief, feedbackExamples: FeedbackExample[]): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);
  const feedbackDirectives = buildFeedbackDirectives(feedbackExamples);
  const priceContext = buildPriceContext(product.price);

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
- Price context: ${priceContext}
- Target audience: ${product.targetAudience}
- Goal: ${product.goal}
- Offer details: ${product.offerDetails}
- Common objections: ${product.objections}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Mandatory user style directives:
${feedbackDirectives}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Keep recommendations compliant and non-deceptive.
- Voice/identity: speak as an affiliate promoter only, not as seller, brand owner, or manufacturer.
- Avoid ownership phrases like "we sell", "our product", "our customers", "binibenta namin".
- Use affiliate-safe phrasing like "as affiliate", "seller store", "brand details".
- For "assumptions", only include assumptions if needed, else return [].
- For "scriptPostPackages", generate one package per script.
- postTitle should be scroll-stopping and concise.
- postDescription should be posting-ready with clear CTA.
- hashtags should be relevant and non-spammy.
- Never use unverifiable absolute/superlative claims such as No.1, #1, the best, the first, the only, perfect.
- Never use miracle/cure/medical treatment claims or disease-healing promises.
- Never claim instant or immediate dramatic results.
- Never suggest before-and-after dramatic transformation claims.
- Avoid absolute composition claims like 100% natural, all-natural, or chemical-free unless independently verifiable.
- Do not hardcode exact prices in scripts/titles/descriptions.
- Use dynamic price phrasing instead: "check latest price in yellow basket/shop link".
- Add at least 3 concise complianceNotes in output to remind creator what to avoid.
- Treat mandatory user style directives as hard constraints in every section.
- Never output exact numeric price even if user provided a price field.

Return JSON with this exact shape:
${SHARED_OUTPUT_SHAPE}
`.trim();
}

function buildAutomationPrompt(
  input: AutomationBrief,
  feedbackExamples: FeedbackExample[],
): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);
  const feedbackDirectives = buildFeedbackDirectives(feedbackExamples);
  const priceContext = buildPriceContext(input.price);

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
- Price context: ${priceContext}
- Brand tone preference: ${input.brandTone}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Mandatory user style directives:
${feedbackDirectives}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Keep recommendations compliant and non-deceptive.
- Voice/identity: speak as an affiliate promoter only, not as seller, brand owner, or manufacturer.
- Avoid ownership phrases like "we sell", "our product", "our customers", "binibenta namin".
- Use affiliate-safe phrasing like "as affiliate", "seller store", "brand details".
- Fill "assumptions" with the inferred audience/pain/offer assumptions.
- Focus on script-ready output, no long theory.
- For "scriptPostPackages", generate one package per script.
- postTitle should be scroll-stopping and concise.
- postDescription should be posting-ready with clear CTA.
- hashtags should be relevant and non-spammy.
- Never use unverifiable absolute/superlative claims such as No.1, #1, the best, the first, the only, perfect.
- Never use miracle/cure/medical treatment claims or disease-healing promises.
- Never claim instant or immediate dramatic results.
- Never suggest before-and-after dramatic transformation claims.
- Avoid absolute composition claims like 100% natural, all-natural, or chemical-free unless independently verifiable.
- Do not hardcode exact prices in scripts/titles/descriptions.
- Use dynamic price phrasing instead: "check latest price in yellow basket/shop link".
- Add at least 3 concise complianceNotes in output to remind creator what to avoid.
- Treat mandatory user style directives as hard constraints in every section.
- Never output exact numeric price even if user provided a price field.

Return JSON with this exact shape:
${SHARED_OUTPUT_SHAPE}
`.trim();
}

function buildLiveSellingPrompt(
  input: LiveSellingBrief,
  feedbackExamples: FeedbackExample[],
): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);
  const feedbackDirectives = buildFeedbackDirectives(feedbackExamples);

  return `
You are a live selling coach for TikTok Shop affiliates in the Philippines.

Task:
- Create a practical live selling script system in Taglish.
- Output what the host should say from start to close.
- Include lines for low-viewer moments and high-viewer moments.
- Keep all claims compliant and policy-safe.

Product input:
- Product name: ${input.productName}
- Product info/description: ${input.productInfo}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Mandatory user style directives:
${feedbackDirectives}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Voice/identity: speak as an affiliate promoter only, not as seller, brand owner, or manufacturer.
- Avoid ownership phrases like "we sell", "our product", "our customers", "binibenta namin".
- Use affiliate-safe phrasing like "as affiliate", "seller store", "brand details".
- liveTitle must be at least 15 characters.
- aboutMe must be at least 30 characters.
- Generate at least 8 FAQ items with clear direct answers.
- FAQs should cover shipping/process/returns/quality/use-case/common objections and trust concerns.
- For lowViewerRepeatLines, generate replay-friendly recap lines.
- For highViewerRepeatLines, generate short welcome+recap lines for new entrants.
- Never use unverifiable absolute/superlative claims such as No.1, #1, the best, the first, the only, perfect.
- Never use miracle/cure/medical treatment claims or disease-healing promises.
- Never claim instant or immediate dramatic results.
- Never suggest before-and-after dramatic transformation claims.
- Avoid absolute composition claims like 100% natural, all-natural, or chemical-free unless independently verifiable.
- Never hardcode exact numeric prices in scripts or answers.
- Use dynamic price phrasing instead: "check latest price in yellow basket/shop link".
- Treat mandatory user style directives as hard constraints in every section.

Return JSON with this exact shape:
${LIVE_OUTPUT_SHAPE}
`.trim();
}

function buildLiveFollowUpPrompt(
  input: LiveSellingBrief,
  question: string,
  liveOutput: LiveSellingOutput | null | undefined,
  feedbackExamples: FeedbackExample[],
): string {
  const feedbackContext = buildFeedbackContext(feedbackExamples);
  const feedbackDirectives = buildFeedbackDirectives(feedbackExamples);
  const faqContext = liveOutput?.faqs?.length
    ? liveOutput.faqs
        .slice(0, 8)
        .map((item, index) => `${index + 1}. Q: ${item.question}\nA: ${item.answer}`)
        .join("\n")
    : "No generated FAQ context yet.";

  return `
You are a live selling co-host assistant for TikTok Shop affiliates in the Philippines.

Task:
- Generate a safe, practical answer to one live viewer question.
- Keep answer concise and easy to say on live.
- Align with existing FAQ logic when relevant.

Product input:
- Product name: ${input.productName}
- Product info/description: ${input.productInfo}

Current FAQ context:
${faqContext}

Viewer question:
${question}

Learning examples from previous outputs and user feedback:
${feedbackContext}

Mandatory user style directives:
${feedbackDirectives}

Output rules:
- Respond ONLY in valid JSON.
- No markdown, no code fence.
- Language: Taglish (Filipino + English), practical and direct.
- Voice/identity: speak as an affiliate promoter only, not as seller, brand owner, or manufacturer.
- Avoid ownership phrases like "we sell", "our product", "our customers", "binibenta namin".
- Use affiliate-safe phrasing like "as affiliate", "seller store", "brand details".
- answer should be direct and live-ready (2-4 sentences).
- fallbackIfUnsure should be a safe line when details are uncertain.
- Never use unverifiable absolute/superlative claims such as No.1, #1, the best, the first, the only, perfect.
- Never use miracle/cure/medical treatment claims or disease-healing promises.
- Never claim instant or immediate dramatic results.
- Never suggest before-and-after dramatic transformation claims.
- Never hardcode exact numeric prices.
- If question asks price, use dynamic phrase: "check latest price in yellow basket".
- Treat mandatory user style directives as hard constraints in every section.

Return JSON with this exact shape:
${LIVE_FOLLOW_UP_SHAPE}
`.trim();
}

async function executeRawPrompt(
  apiKey: string,
  prompt: string,
): Promise<Record<string, unknown>> {
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
        temperature: 0.45,
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
  return tryParseJSON(rawText);
}

async function executePrompt(
  apiKey: string,
  prompt: string,
  forbiddenPriceTokens: string[],
): Promise<StrategyOutput> {
  const parsed = await executeRawPrompt(apiKey, prompt);
  return normalizeOutput(parsed, forbiddenPriceTokens);
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
  const forbiddenPriceTokens = extractForbiddenPriceTokens(product.price);
  return executePrompt(apiKey, prompt, forbiddenPriceTokens);
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
  const forbiddenPriceTokens = extractForbiddenPriceTokens(input.price);
  return executePrompt(apiKey, prompt, forbiddenPriceTokens);
}

export async function generateLiveSellingPlan({
  apiKey,
  input,
  feedbackExamples,
}: GenerateLiveSellingParams): Promise<LiveSellingOutput> {
  if (!apiKey.trim()) {
    throw new Error("Missing Gemini API key.");
  }

  const prompt = buildLiveSellingPrompt(input, feedbackExamples);
  const parsed = await executeRawPrompt(apiKey, prompt);
  return normalizeLiveOutput(parsed, input);
}

export async function generateLiveFollowUpAnswer({
  apiKey,
  input,
  question,
  liveOutput,
  feedbackExamples,
}: GenerateLiveFollowUpParams): Promise<LiveFollowUpOutput> {
  if (!apiKey.trim()) {
    throw new Error("Missing Gemini API key.");
  }
  if (!question.trim()) {
    throw new Error("Viewer question is required.");
  }

  const prompt = buildLiveFollowUpPrompt(input, question, liveOutput, feedbackExamples);
  const parsed = await executeRawPrompt(apiKey, prompt);
  return normalizeLiveFollowUpOutput(parsed, question);
}
