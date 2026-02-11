export type ProductBrief = {
  productName: string;
  niche: string;
  productDescription: string;
  features: string;
  price: string;
  targetAudience: string;
  goal: string;
  offerDetails: string;
  objections: string;
};

export type ProductProfile = ProductBrief & {
  id: string;
  createdAt: string;
};

export type AutomationBrief = {
  productName: string;
  productInfo: string;
  productDetails: string;
  price: string;
  brandTone: string;
};

export type AutomationProfile = AutomationBrief & {
  id: string;
  createdAt: string;
};

export type FeedbackExample = {
  id: string;
  createdAt: string;
  rating: number;
  whatWorked: string;
  whatToImprove: string;
  productName: string;
  outputSnapshot: string;
};

export type VideoScript = {
  title: string;
  durationSec: number;
  script: string;
};

export type ScriptPostPackage = {
  scriptTitle: string;
  postTitle: string;
  postDescription: string;
  hashtags: string[];
};

export type StrategyOutput = {
  strategySummary: string;
  positioning: {
    audience: string;
    painPoint: string;
    offerAngle: string;
  };
  assumptions: string[];
  hooks: string[];
  videoScripts: VideoScript[];
  scriptPostPackages: ScriptPostPackage[];
  ctaOptions: string[];
  captions: string[];
  hashtagSets: string[][];
  postingPlan14Days: string[];
  livePlan: string[];
  abTests: string[];
  kpiFocus: string[];
  nextActions24h: string[];
};
