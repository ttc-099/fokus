# FOKUS pitch deck (v2)

Reworked deck, rebuilt from the original Canva version (`UoSM_SENDIRIHAHA_final`) against what
the app actually does today. Ten slides, 1920×1080.

## Files

| File | What it is |
| --- | --- |
| `deck.html` | the master: every slide in one file, open it in a browser to read the deck |
| `slide-01.png` … `slide-10.png` | one 1920×1080 image per slide |
| `slide-01.html` … `slide-10.html` | per-slide sources, for re-rendering a single slide |
| `fokus-pitch-deck.pdf` | the whole deck as a PDF, for handing over or importing |
| `shots/` | the app screenshots used on slides 4, 5 and 8 |

Re-render after editing `deck.html`:

```bash
python3 render_deck.py     # see the script in the PR description, or re-open deck.html
```

## Slide map

1. **Title** — to lower the 90% failure rate of self-initiated learning, from a learner, for learners
2. **The problem: why does this happen?** — the 85–90% figure, self-paced disengagement, no gentle entry, and the without-a-path journey
3. **Who is affected? (our market)** — university student and young adult, with the issue for each, and where the segment split comes from
4. **The trend from now** — 83% of students use AI in their studies, 68% use it to complete assignments, 89% use free tools rather than institution ones, with full citations
5. **Scenario: "easy way out"** — are they really learning? The paste-and-submit loop against the checked path, and what the check does
6. **The solution: better with a map** — why: an accessible simple UI; why: to ensure it actually landed
7. **The product** — the roadmap screen, numbered and checked
8. **Inside a module** — watch, read, check, with the real module and quiz screens
9. **The product in code** — topic gate, research, eight modules, real resources, the check
10. **Business model** — Free, Plus RM12/month, Cohort RM6/seat against the ChatGPT+ RM90 and Notion RM51 benchmarks, plus unit economics
11. **Where this goes** — students now, study groups next, classrooms, institutions
12. **What is built today** — learner and operator sides, installable app, Android build
13. **The honest limit list** — capacity, retention evidence, surface area, distribution
14. **The ask** — closed beta of ten, fix the first run, then the next tier

## Notes on the changes

- Market slides no longer quote 650 / 250 users without a denominator; the segment is described instead, because the original numbers invited "out of what".
- The two "the product in code" slides are replaced with real screens: nobody outside a judging panel evaluates source.
- A limits slide was added. Capacity is stated in tokens (about 4,000 per new roadmap, about 34,000 for a fully opened one), which is the number a reader asks for.
- The expansion path is now explicit and staged, since the plan is to move from self-study students to cohorts, classrooms and institutions.
- The business model is priced against the two benchmarks the original deck used: ChatGPT+ at RM90/month and Notion at RM51/month. Plus is RM12, which is 13% and 24% of those respectively.
- Unit economics are derived, not guessed: about RM0.003 of inference for a new roadmap and about RM0.03 for one taken all the way through, from Groq's published gpt-oss-20b rates ($0.075 input / $0.30 output per million tokens) at 4.07 MYR to USD, against the app's own token limits.
- The trend slide uses real published figures rather than the original direction-only graph: KPMG's student survey (83%, 89%), a Sunway University study (68% of 119 students using AI for assignments) and Nasidi et al. in JONUS. Full citations sit on the slide.
- The original 650 / 250 market figures are gone. They had no stated denominator, which is the first question a reader asks; the slide now describes the two segments and names the studies behind the split instead.
- No testimonials, no invented metrics. Everything on the slides is either the app's own output or a cited figure.
