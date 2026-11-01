# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Students, professionals, and self-learners (inferred from README) who want to break a learning goal into structured steps. Primary user is the builder herself demoing the concept (session-confirmed).

## Product Purpose
FOKUS turns any learning goal into a personalized, AI-driven roadmap: 8 sequenced modules from beginner to advanced, each with a study guide, curated videos, and course links, plus progress tracking. Success = a learner can enter "origami" and get a real, grounded path they can follow and check off (session-confirmed).

## Positioning
Roadmap generation grounded in live Wikipedia research with per-module real video/course recommendations, cheap enough for institutions (README). Demo deployment lives on a personal gateway with accounts and saved roadmaps (session-confirmed).

## Operating Context
Web app used in a browser, often during study time (daylight, desk). Demo hosted at a funnel URL; Groq free-tier LLM + Wikipedia + YouTube (keyless) behind a gateway backend (session-confirmed).

## Capabilities and Constraints
- accounts (username/password, no email), sessions, saved roadmaps in sqlite
- AI generation via gpt-oss-20b on Groq free tier; rate limits per IP and per day
- module study guides + verified YouTube embeds + course deep-links
- prototype stage; no collaboration, no mobile app (README future list)

## Brand Commitments
- Name: FOKUS (session-confirmed logo text)
- Visual direction pinned by the owner: **white and blue**, standard edtech app UI with a user-side column (sidebar) of sections, like Coursera/Khan/Udemy (session-confirmed). Canon commitment.
- The colorful cell track is the product's recognizable trait and stays as the one signature move (assistant decision, owner may veto).

## Evidence on Hand
README + pitch deck link in repo. Live demo with real AI generation, real accounts, real roadmaps. No testimonials or metrics exist; must not be fabricated.

## Product Principles
1. Every screen answers "what do I learn next?"
2. Recommendations must be real and verifiable; no fabricated links or badges.
3. Progress is visible and survives refreshes.
4. The roadmap track (cells on a line) is the identity; everything else gets out of its way.
