# TikTok Shop Compliance Guardrails (Affiliate Content)

Last checked: February 13, 2026

Use this guide when creating hooks, scripts, titles, descriptions, and hashtags.

## Core no-go claims to avoid

- Avoid unverifiable absolute/superlative claims:
  - `No.1`, `#1`, `the best`, `the first`, `the only`, `perfect`
- Avoid miracle or medical cure/treatment claims:
  - Any wording that implies curing illness or guaranteed physiological/health outcomes
- Avoid instant-result claims:
  - Promises of immediate dramatic outcomes in very short time
- Avoid dramatic before-and-after transformation claims
- Avoid absolute composition claims unless fully verifiable:
  - e.g., `100% natural` when you cannot prove and verify it
- Avoid exact hardcoded price lines in scripts/titles/descriptions:
  - Price can change; use dynamic phrase such as `check latest price in yellow basket`

## Safe phrasing direction

- Use: `popular option`, `creator-tested`, `good fit for`, `can help support`
- Use: `results vary by user`, `for guidance only`, `check latest price in basket`
- Use proof carefully: real usage context, neutral language, no exaggerated guarantees

## Official policy references (TikTok)

- TikTok Shop Content Policy (seller policy examples including prohibited exaggerated claims and instant/miracle style claims):  
  https://seller-th.tiktok.com/university/essay?knowledge_id=6166208262031362&role=1&identity=1
- TikTok Shop Content Policy (misleading price claim examples):  
  https://seller-us.tiktok.com/university/essay?knowledge_id=4363167744941004&role=1&identity=1
- TikTok Advertising Policies - Misleading and False Content:  
  https://ads.tiktok.com/help/article/misleading-and-false-content?lang=en
- TikTok Advertising Policies - Prohibited Products and Services (healthcare/medical risk claims):  
  https://ads.tiktok.com/help/article/prohibited-products-and-services?lang=en

## Implementation note in this app

The app now applies compliance guardrails in the generation layer by:
- strengthening prompt rules (policy-aware instructions)
- sanitizing high-risk words/claims in outputs
- replacing exact price mentions with dynamic wording
- surfacing compliance notes in AI output
