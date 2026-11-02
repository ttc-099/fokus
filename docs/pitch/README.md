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

1. **Title** — type any topic, get a learning path
2. **Problem** — the 85–90% non-completion figure, and why (no map, no feedback), against how self-study usually goes
3. **Who we start with** — self-directed students, what they look like and why them first
4. **Solution** — the roadmap as the interface, with the real course screen
5. **Inside a module** — watch, read, check, with the real module and quiz screens
6. **Pipeline** — topic gate → research → eight modules → real resources → the check, plus engine numbers
7. **Where this goes** — students now, study groups next, classrooms, then institutions
8. **What is built today** — learner and operator sides, plus installable app and Android build
9. **The honest limit list** — capacity, retention evidence, surface area, distribution
10. **The ask** — a closed beta of ten self-study students, fix first-run, then open the next tier

## Notes on the changes

- Market slides no longer quote 650 / 250 users without a denominator; the segment is described instead, because the original numbers invited "out of what".
- The two "the product in code" slides are replaced with real screens: nobody outside a judging panel evaluates source.
- A limits slide was added. Capacity is stated in tokens (about 4,000 per new roadmap, about 34,000 for a fully opened one), which is the number a reader asks for.
- The expansion path is now explicit and staged, since the plan is to move from self-study students to cohorts, classrooms and institutions.
- No testimonials, no invented metrics. Everything on the slides is either the app's own output or a cited figure.
