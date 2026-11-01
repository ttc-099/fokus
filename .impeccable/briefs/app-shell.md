# Surface brief: app shell (dashboard, roadmap view, login, settings)

## Scope and visitor mode
Whole app UI, Operate mode. Owner pinned the world: standard edtech app, white and blue, left sidebar with sections.

## Audience, job, action
A learner managing their roadmaps: create one, open it, study a module (guide + video + courses), mark progress. Every visit starts at "what do I learn next?"

## Direction contract
THESIS: a clean edtech app shell where the colorful roadmap cell track is the only expressive element; everything else is the category standard done at full fidelity.
OWN-WORLD: white ground, cool-tinted canvas, blue (#2563eb) accents, slate text, white cards with offset+blur shadows; the cell track keeps its 8-hue gradient cells on a connector line.
STORY: sidebar (FOKUS, My roadmaps, Settings, user chip) -> dashboard with create + progress-led roadmap cards -> roadmap page: track + progress bar, module panel with tabs (guide / videos & courses), mark-done.
FIRST VIEWPORT: 1440px: fixed 240px white sidebar left (logo top, nav sections, user + sign out bottom); main canvas #f5f8fc; dashboard greeting + create form on a white card, roadmap cards below with progress bar + module count + date; primary action is the create button, blue, top right of the card.
FORM: canon edtech app shell (owner-pinned), position 1 of 1; seed: none (brief-pinned canon, no roll run).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions
- Sidebar sections beyond My roadmaps/Settings (Explore, Progress) are deferred until they have real function; no dead nav items shipped.
