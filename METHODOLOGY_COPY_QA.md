# Wine Price Calculator — methodology copy QA

Purpose: prepare a copy-only, non-production review package that removes claim ambiguity without changing the current formula, inputs, scoring logic, or experiment scope.

## Required copy replacements

1. Meta description
   - Current: `A Freakonomics-inspired wine value experiment based on Orley Ashenfelter's Bordeaux Equation.`
   - Proposed: `An Ashenfelter-inspired Bordeaux weather and value-signal experiment with exploratory regional and grape extensions.`

2. Result row label
   - Current: `Original Bordeaux Equation Score`
   - Proposed: `Prototype climate heuristic score`

3. Formula helper
   - Current: `Original idea: winter rainfall + growing-season temperature − harvest rainfall. Prototype extension: apply a grape multiplier and simplified climate assumptions so the interaction works across more regions. The extension is exploratory and should not be attributed to Ashenfelter.`
   - Proposed: `Ashenfelter’s Bordeaux work modeled auction-price variation using vintage age plus Bordeaux weather variables. This prototype keeps the weather intuition but substitutes simplified regional assumptions and exploratory grape multipliers.`

4. Origin equation label
   - Current: `The famous simplified Bordeaux Equation`
   - Proposed: `Prototype climate heuristic inspired by Ashenfelter`

5. Source boundary sentence
   - Add near the methodology/origin explanation: `Ashenfelter’s published Bordeaux model was a log-price model for Bordeaux vintages, not a universal bottle-price or quality score.`

## QA acceptance criteria

- No UI copy implies the displayed score is the canonical Ashenfelter equation output.
- No UI copy implies the prototype estimates an actual bottle market price or production cost.
- Bordeaux-specific published work is clearly separated from prototype regional assumptions and grape multipliers.
- Existing inputs, formula logic, result values, reset behavior, and responsive layout remain unchanged.
- No analytics, user data, account behavior, pricing claim, or external benchmark is added.
- Production remains untouched until BoRam explicitly approves the copy-only release.

## Recommendation

Ship only the claim-transparency copy correction next. Do not expand into market-price or production-cost claims until a benchmark dataset exists.