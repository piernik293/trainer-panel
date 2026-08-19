---
name: Survey Chrome Translate hypothesis
description: Evidence threshold for attributing SurveyForm mobile DOM NotFoundError to Chrome Translate.
---

Do not treat the document language mismatch plus Chrome Translate as the confirmed cause of SurveyForm's `removeChild` or `insertBefore` errors. A controlled mobile test exercised the real submit-button transition from text to loading content and back, both normally and after moving its direct text node under a translation-style `font` wrapper; neither run produced a DOM exception.

**Why:** The controlled mutation was insufficient to reproduce either reported `NotFoundError`, so changing document language on this evidence would be speculative.

**How to apply:** Before changing language or translation settings for this bug, capture a failing run from native mobile Chrome with its actual Translate feature active and retain the full browser/component stack that identifies the failing reconciliation path.