# KareIQ risk engine: workbook issues for your confirmation

The workbook formulas, bands and thresholds are implemented exactly as supplied and are active. Nothing below was chosen silently. Each result is calculated under every alternative of every open question: where all alternatives agree, the result is used; where they differ, the result is shown as unresolved and never counts towards the overall category (so it can never make anyone Green). Answers can be recorded in Office > Settings > Risk rules (name and date kept; earlier answers stay in the history).

## A. Whole-indicator conflicts (the indicator is not calculated until answered)

- **Heart risk: which Reynolds formula is authoritative?**
  - Workbook: RiskCalculation&Formulas!A7; RiskCalculation&Formulas!A9; Heart Risk by Gender!A3:A9
  - Alternatives: A) Separate men's and women's equations (Heart Risk by Gender sheet) / B) One equation for everyone (RiskCalculation&Formulas sheet)
  - Blocks: Heart disease risk (Reynolds 10-year)
- **FIB-4: the two sheets give different formulas. Which is correct?**
  - Workbook: Risk and Other Indicators!D9; RiskCalculation&Formulas!A36
  - Alternatives: A) (Age × AST) / (Platelets × √ALT) (Risk and Other Indicators) / B) Age × AST × Platelets × √ALT (RiskCalculation&Formulas)
  - Blocks: Liver scarring (FIB-4 index)
- **ELF: is the 0.394 coefficient on ln(TIMP-1) included?**
  - Workbook: Risk and Other Indicators!D11; RiskCalculation&Formulas!A44
  - Alternatives: A) 2.278 + 0.851·ln(HA) + 0.751·ln(PIIINP) + 0.394·ln(TIMP-1) / B) 2.278 + 0.851·ln(HA) + 0.751·ln(PIIINP) + ln(TIMP-1)
  - Blocks: Enhanced Liver Fibrosis (ELF) score
- **MMSE has two scales in the workbook. Which one decides the band?**
  - Workbook: Risk and Other Indicators!F14:F15
  - Alternatives: A) Cognitive impairment: 0–17 severe, 18–23 mild, 24–30 none / B) Dementia odds: below 21 increased odds, above 25 decreased odds (21–25 is not covered and gets its own band to map)
  - Blocks: Memory and thinking (MMSE)
- **4-Stage Balance: one sheet bands it by seconds, the other by which stage can be held. Which method?**
  - Workbook: Risk and Other Indicators!F17; Standard Range!C38:D39
  - Alternatives: A) By stage held for 10 seconds (Standard Range): all four held = normal; stage 3 or stage 4 not held = increased fall risk / B) By seconds held (Risk and Other Indicators): under 10 s high fall risk, over 21 s low fall risk (10–21 s is not covered and gets its own band to map)
  - Blocks: 4-Stage Balance test
- **Functional Reach: one sheet bands it in inches, the other gives single cm values by sex with no bands. Which?**
  - Workbook: Risk and Other Indicators!F18; Standard Range!C40:D41
  - Alternatives: A) Inches: over 10 low risk, 6–10 moderate risk, under 6 high risk (cm ÷ 2.54) / B) cm by sex: at or above 38.1 cm (men) / 35.1 cm (women) normal, below it increased risk (my reading of single values; needs clinical confirmation)
  - Blocks: Functional Reach test

## B. Gaps and overlaps (only the values in question are unresolved; all other values are classified)

- **A score exactly on a boundary that the workbook gives to two bands (for example Snehita 0.574 is the end of "0.4004–0.574 Moderate" and the start of "0.574–0.795 High"): which band does it belong to?**
  - Workbook: Risk and Other Indicators!F4
  - Alternatives: A) The lower band / B) The higher band
  - Blocks: values exactly on a shared band boundary (Snehita 0.574)
- **Heart risk bands leave gaps (7.4–7.5% and 19.9–20%). Where do those values go?**
  - Workbook: Risk and Other Indicators!F3; RiskCalculation&Formulas!A19:A22
  - Alternatives: A) Below 5 low · 5 to under 7.5 borderline · 7.5 to under 20 intermediate · 20 or more high / B) Below 5 low · 5 to under 7.5 borderline · 7.5 to 20 intermediate · more than 20 high
  - Blocks: Heart disease risk (Reynolds 10-year)
- **The workbook says the men's equation was not validated for men with diabetes. For a diabetic man:**
  - Workbook: Heart Risk by Gender!A40; Heart Risk by Gender!D31
  - Alternatives: A) Calculate and show the warning / B) Do not calculate (Not assessed)
  - Blocks: Heart disease risk (Reynolds 10-year)
- **Kidney: the allowed ACR range cell was turned into a date by Excel ("Oct 3000"). Values outside the range are set to the nearest limit (cell D5). Which range?**
  - Workbook: 5Y Kidney Risk!E2:F2; 5Y Kidney Risk!D5
  - Alternatives: A) 10 to 3000 mg/g (my reading of the corrupted cell) / B) Do not limit ACR
  - Blocks: Kidney failure risk (KFRE, 5-year)
- **Kidney: the workbook gives no risk bands, only the 5-year percentage (from "less than 5%" to "more than 70%"). Enter the cut-offs.**
  - Workbook: 5Y Kidney Risk!B15:C19; Risk and Other Indicators!F6
  - Alternatives: enter cut-offs (Needs attention (Amber) from, Very high (Red) from)
  - Blocks: Kidney failure risk (KFRE, 5-year)
- **FIB-4: the low band reads "<1.3 - 1.45 - Low risk". What is the low cut-off?**
  - Workbook: Risk and Other Indicators!F9
  - Alternatives: A) Below 1.3 low, 1.3 to 2.67 intermediate / B) Below 1.45 low, 1.45 to 2.67 intermediate
  - Blocks: Liver scarring (FIB-4 index)
- **ELF: "7.7 to <9.8 moderate" and ">9.8 high" leave exactly 9.8 uncovered. Where does 9.8 go?**
  - Workbook: Risk and Other Indicators!F11
  - Alternatives: A) Moderate / B) High
  - Blocks: Enhanced Liver Fibrosis (ELF) score
- **IDRS: "30–50 Medium" and ">60 High" leave 51–60 uncovered. Where do 51–60 go?**
  - Workbook: Risk and Other Indicators!F7
  - Alternatives: A) 30–59 medium, 60 or more high / B) 30–50 medium, 51 or more high / C) 30–60 medium, more than 60 high
  - Blocks: Diabetes risk (IDRS)
- **TUG: the two sheets band it differently, and "10–19" / ">20" / ">30" leave 19–20 s and exactly 30 s uncovered. Which bands?**
  - Workbook: Risk and Other Indicators!F16; Standard Range!C34:E34
  - Alternatives: A) Indicators sheet: under 10 normal · 10 to under 20 good · 20 to 30 possible fall risk · more than 30 high fall risk / B) Indicators sheet: under 10 normal · 10 to under 20 good · 20 to under 30 possible fall risk · 30 or more high fall risk / C) Standard Range sheet: under 10 normal mobility · 10 to under 20 good mobility · 20 or more increased fall risk
  - Blocks: Timed Up and Go (TUG)
- **Blood pressure: "Standard 120 / 80" and "Elevated 120–129" both include 120. Which?**
  - Workbook: Standard Range!C2:J2
  - Alternatives: A) Standard below 120 and below 80 · Elevated 120–129 and below 80 · Stage 1 130–139 or 80–89 · Stage 2 140+ or 90+ / B) Standard up to 120 and up to 80 · Elevated 121–129 and below 80 · Stage 1 130–139 or 81–89 · Stage 2 140+ or 90+
  - Blocks: Blood pressure (Standard Range)
- **Oxygen: "95–100% Standard" and "88–92% Risky" leave 93–94% uncovered. Where do 93–94% go?**
  - Workbook: Standard Range!C4:H4
  - Alternatives: A) Risky / B) Standard / C) Their own band (to map)
  - Blocks: Oxygen saturation (Standard Range)
- **Perfusion index: "> 1 good" and "< 1 weak" leave exactly 1 uncovered. Where does 1 go?**
  - Workbook: Standard Range!C8:F8
  - Alternatives: A) Weak blood flow / B) Good blood flow
  - Blocks: Perfusion index (Standard Range)

## C. Bands the workbook gives no Red/Amber/Green category

Categories follow the agreed wording: "very high" Red; "elevated, moderate, medium, intermediate, high" Amber; normal/low/good/standard Green. These bands fall outside that wording, so results in them are shown but not counted (and the customer cannot be Green):

- Heart disease risk (Reynolds 10-year): Borderline risk
- Obesity (Body Mass Index): Underweight; Overweight; Obese (class I); Obese (class II); Obese (class III)
- Sleep quality (PSQI): Poor sleep quality
- Depression (PHQ-9): Mild depression; Moderately severe depression; Severe depression
- Anxiety (GAD-7): Mild anxiety; Severe anxiety
- Memory and thinking (MMSE): Mild cognitive impairment; Severe cognitive impairment; 21–25 (not covered by the workbook); Increased odds of dementia
- Timed Up and Go (TUG): Good mobility (can go out alone); Potential risk of falls (limited mobility); Increased fall risk (mobility issues)
- 4-Stage Balance test: Cannot hold stage 4 for 10 s (increased fall risk); Cannot hold stage 3 for 10 s (increased fall risk); 10–21 s (not covered by the workbook)
- Functional Reach test: Below the reference for their sex
- 30-Second Chair Stand test: Below average (lower-body weakness)
- Oxygen saturation (Standard Range): 93–94% (not covered by the workbook); Critical (below 88%)
- Pulse (Standard Range): Outside 60–100 (no band in the workbook)
- Perfusion index (Standard Range): Low PI (weak blood flow)
- Blood glucose (Standard Range): Fasting 100–125 (pre-diabetic); Fasting 126 or higher (diabetic); Fasting below 70 (not covered by the workbook); After a meal 140 or higher (not covered by the workbook)

Most urgent clinically: Severe and Moderately severe depression (PHQ-9), Severe anxiety (GAD-7), Severe cognitive impairment (MMSE), Critical oxygen below 88% (SpO2) and Fasting 126 or higher (glucose). Today they do not raise a customer to Amber or Red.

Applied by the agreed wording; please confirm: SpO2 "Risky (88–92%)" = Amber, IDRS "Medium risk" = Amber, BP "High, stage 2" = Amber (not Red), every "High risk" band = Amber (only "very high" is Red).

## D. Rules the workbook does not give (defaults in use)

- **How long a result stays valid.** Default: until a newer result is recorded (no expiry). Alternative: a number of days per indicator.
- **Which indicators are required before a customer can be Green.** Default: every applicable indicator (strict: with the conflicts in A open, nobody can be Green yet). Alternatives: required for chosen packages only; not required.
- **Single vitals from the Standard Range sheet** (blood pressure, SpO2, pulse, perfusion index, glucose) count towards the overall category, because the workbook is approved as a whole. Confirm or exclude.

## E. Not calculable

- COPD / asthma (UCAP or CAT): The workbook has no formula or bands for COPD (Risk and Other Indicators!F8: "I don't have access to formula"; RiskCalculation&Formulas!A77 names CAT, the Indicators sheet names UCAP).

## F. App-only ranges not used in risk

Cholesterol, temperature and the after-meal / random glucose colours on the Vitals page come from the app, not the workbook, and do not affect risk.
