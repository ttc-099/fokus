# 📚 FOKUS – Personalized Learning Roadmaps

FOKUS is a web app designed to help learners create and follow **personalized, AI-driven learning roadmaps**. Whether you're a student, professional, or self-learner, FOKUS simplifies complex goals into structured, achievable steps — and now remembers your progress.

---

## 🚀 Quickstart (full version)

Requirements: **Node.js 20+** and npm.

```bash
# 1. install everything (frontend deps at root, backend deps in server/)
npm install
npm --prefix server install

# 2. configure the server (defaults work out of the box)
cp server/.env.example server/.env

# 3. create the database (sqlite file, zero setup)
npm --prefix server run db:push

# 4. run frontend + backend together
npm run dev
```

- App: **http://localhost:5173**
- API: **http://localhost:4000/api/health**

The app runs with the **offline** AI provider by default — template-generated roadmaps, no API key needed. Create an account, generate a roadmap, click cells for study guides, mark them done.

### Using a real AI provider

Edit `server/.env`:

```bash
# OpenAI (or any OpenAI-compatible endpoint)
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini

# Hugging Face inference router
AI_PROVIDER=huggingface
AI_API_KEY=hf_...
AI_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

If the provider fails mid-request, the server automatically falls back to the offline generator, so the app never breaks.

### Switching to PostgreSQL

Set `DATABASE_URL="postgresql://user:pass@localhost:5432/fokus"` in `server/.env`, then run `npm --prefix server run db:push` again.

---

## 🛠️ Architecture

```
/                    vite + react + typescript frontend
  src/pages          dashboard, roadmap view, auth, settings
  src/context        auth session (jwt stored client-side)
  src/services       typed api client (axios, via vite /api proxy)

/server              express + typescript backend
  src/routes         auth (register/login/me), roadmaps (crud + generate + progress)
  src/ai             provider layer: offline | openai | huggingface (openai-compatible)
  prisma/schema      users, roadmaps, roadmap cells (sqlite or postgres)
```

### API summary

- `POST /api/auth/register` · `POST /api/auth/login` · `GET /api/auth/me`
- `GET /api/roadmaps` — your roadmaps with progress counts
- `POST /api/roadmaps/generate` — `{topic, goal?, moduleCount?}` → AI-planned roadmap
- `GET /api/roadmaps/:id` · `DELETE /api/roadmaps/:id`
- `PATCH /api/roadmaps/:id/cells/:cellId` — toggle `{completed}`
- `POST /api/roadmaps/:id/cells/:cellId/detail` — lazy-generate the study guide
- `GET /api/health` — liveness + active AI provider

---

## 📌 Current Features

* ✅ **Accounts** — register/login with JWT, roadmaps saved per user
* ✅ **AI-generated roadmaps** — any OpenAI-compatible provider (OpenAI, Hugging Face) with an offline fallback that always works
* ✅ **Progress tracking** — mark cells done, progress bars per roadmap
* ✅ **Cell UI** — the original cell-based design, now backed by real data
* ✅ **Lazy study guides** — detailed content generated on first click and cached

* **Note: This project is part of an ongoing learning process in TypeScript and frontend development. While some starter code was AI-assisted, all implementations have been adapted and expanded to fit the original design and vision.**

---

## 📈 Future Roadmap

* [x] AI-generated roadmaps tailored to career or academic goals
* [x] User accounts + authentication
* [x] Progress tracking dashboards
* [ ] Collaboration tools (e.g., group learning roadmaps)
* [ ] Mobile-first design for accessibility

---

## 🚀 Project Goals

* **Personalized Learning** → Use AI to recommend learning pathways based on user goals.
* **Progress Tracking** → Visualize milestones and achievements through roadmap cells.
* **Scalable for Institutions** → Adaptable for universities, training centers, and individual learners.
* **Affordable & Accessible** → Provide roadmap creation and tracking without heavy costs.

---

## 🛠️ Tech Stack

* **Frontend:** Vite + TypeScript React (for UI/UX design and roadmap visualization)
* **Backend:** Node.js + Express (for API + business logic)
* **Database:** SQLite for development, PostgreSQL for production (via Prisma)
* **AI Integration:** OpenAI-compatible API (OpenAI, Hugging Face router) with an offline template fallback
* **Version Control:** Git + GitHub

---

## 👥 About the Project

FOKUS was first conceptualized as a gimmick idea for a **pitching competition**, hoping to ease the burdens of educators and students alike. The project is growing into a **scalable edtech solution**.

---

## Original Pitch Deck
<a href="https://www.canva.com/design/DAGvq1zD1Iw/HU_JbNEXYYWzOLt2WvFHTg/edit?utm_content=DAGvq1zD1Iw&utm_campaign=designshare&utm_medium=link2&utm_source=sharebutton" target="_blank">
  <img src="https://img.shields.io/badge/View%20Pitch%20Deck-Click%20Here-blue?style=for-the-badge" />
</a>

---

## 📬 Contact

📧 Email: sherianne.sactt@gmail.com
