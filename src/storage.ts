import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AutomationBrief,
  AutomationProfile,
  FeedbackExample,
  ProductBrief,
  ProductProfile,
} from "./types";

const PROFILE_KEY = "affiliate_profiles_v1";
const AUTO_PROFILE_KEY = "affiliate_auto_profiles_v1";
const FEEDBACK_KEY = "affiliate_feedback_v1";
const MAX_PROFILES = 20;
const MAX_AUTO_PROFILES = 20;
const MAX_FEEDBACK = 120;

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function getProductProfiles(): Promise<ProductProfile[]> {
  const profiles = await readJSON<ProductProfile[]>(PROFILE_KEY, []);
  return profiles.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function saveProductProfile(
  product: ProductBrief,
): Promise<ProductProfile> {
  const newProfile: ProductProfile = {
    ...product,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };

  const existing = await getProductProfiles();
  const byIdentity = existing.filter(
    (item) =>
      !(
        item.productName.toLowerCase().trim() ===
          product.productName.toLowerCase().trim() &&
        item.niche.toLowerCase().trim() === product.niche.toLowerCase().trim()
      ),
  );

  const next = [newProfile, ...byIdentity].slice(0, MAX_PROFILES);
  await writeJSON(PROFILE_KEY, next);
  return newProfile;
}

export async function getFeedbackExamples(): Promise<FeedbackExample[]> {
  const feedback = await readJSON<FeedbackExample[]>(FEEDBACK_KEY, []);
  return feedback.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getAutomationProfiles(): Promise<AutomationProfile[]> {
  const profiles = await readJSON<AutomationProfile[]>(AUTO_PROFILE_KEY, []);
  return profiles.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function saveAutomationProfile(
  input: AutomationBrief,
): Promise<AutomationProfile> {
  const newProfile: AutomationProfile = {
    ...input,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };

  const existing = await getAutomationProfiles();
  const byIdentity = existing.filter(
    (item) =>
      !(
        item.productName.toLowerCase().trim() ===
          input.productName.toLowerCase().trim() &&
        item.productInfo.toLowerCase().trim() ===
          input.productInfo.toLowerCase().trim()
      ),
  );

  const next = [newProfile, ...byIdentity].slice(0, MAX_AUTO_PROFILES);
  await writeJSON(AUTO_PROFILE_KEY, next);
  return newProfile;
}

export async function saveFeedbackExample(
  feedback: Omit<FeedbackExample, "id" | "createdAt">,
): Promise<FeedbackExample> {
  const newFeedback: FeedbackExample = {
    ...feedback,
    id: makeId(),
    createdAt: new Date().toISOString(),
  };

  const existing = await getFeedbackExamples();
  const next = [newFeedback, ...existing].slice(0, MAX_FEEDBACK);
  await writeJSON(FEEDBACK_KEY, next);
  return newFeedback;
}

export function buildFeedbackContext(examples: FeedbackExample[]): string {
  if (!examples.length) {
    return "No previous feedback examples yet.";
  }

  const top = examples
    .slice()
    .sort((a, b) => {
      if (b.rating === a.rating) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return b.rating - a.rating;
    })
    .slice(0, 8);

  const lines = top.map((item, index) => {
    return [
      `Example ${index + 1}:`,
      `- Rating: ${item.rating}/5`,
      `- Product: ${item.productName}`,
      `- Worked: ${item.whatWorked || "n/a"}`,
      `- Improve: ${item.whatToImprove || "n/a"}`,
      `- Snapshot: ${item.outputSnapshot || "n/a"}`,
    ].join("\n");
  });

  return lines.join("\n\n");
}

function normalizeDirective(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[.]{2,}/g, ".")
    .trim();
}

function uniqueNonEmpty(lines: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of lines) {
    const normalized = normalizeDirective(raw);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }

  return output;
}

export function buildFeedbackDirectives(examples: FeedbackExample[]): string {
  if (!examples.length) {
    return [
      "User preference directives:",
      "- Keep outputs simple, direct, and conversion-focused.",
      "- Use clean CTA and practical Taglish phrasing.",
    ].join("\n");
  }

  const recent = examples
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 12);

  const latest = recent[0];
  const latestMustApply = uniqueNonEmpty([
    latest?.whatWorked ?? "",
    latest?.whatToImprove ?? "",
  ]).slice(0, 4);

  const preferredStyle = uniqueNonEmpty(
    recent
      .map((item) => item.whatWorked)
      .filter(Boolean),
  ).slice(0, 6);

  const improveStyle = uniqueNonEmpty(
    recent
      .map((item) => item.whatToImprove)
      .filter(Boolean),
  ).slice(0, 8);

  const lines: string[] = [];
  lines.push("User preference directives (hard requirements):");

  if (latestMustApply.length) {
    lines.push("Latest feedback to apply now (highest priority):");
    latestMustApply.forEach((item) => lines.push(`- ${item}`));
  }

  if (preferredStyle.length) {
    lines.push("Preferred style:");
    preferredStyle.forEach((item) => lines.push(`- ${item}`));
  }

  if (improveStyle.length) {
    lines.push("Must improve / avoid:");
    improveStyle.forEach((item) => lines.push(`- ${item}`));
  }

  if (!preferredStyle.length && !improveStyle.length) {
    lines.push("- Keep outputs simple, direct, and conversion-focused.");
    lines.push("- Use clean CTA and practical Taglish phrasing.");
  }

  lines.push(
    "If there is conflict, prioritize 'Latest feedback to apply now' first, then 'Must improve / avoid'.",
  );
  return lines.join("\n");
}
