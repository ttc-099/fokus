#!/usr/bin/env python3
# fokus host: static dist + spa fallback + full app backend
# - auth: register / login / logout with scrypt passwords + cookie sessions
# - roadmaps: saved per user in sqlite, ai-generated (groq free tier + wikipedia)
# - GET  -> ./dist files, unknown extensionless paths fall back to index.html
# no deps beyond the python stdlib; the groq key stays on the gateway

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import traceback
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

BASE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(BASE, "dist")
DB = os.path.join(BASE, "fokus.db")
PORT = 8774
SERVER_STARTED = None  # set at serve time
ENV_FILE = "/opt/data/.env"

GROQ_KEY = ""
ADMIN_USERS = set()
try:
    with open(ENV_FILE) as f:
        for line in f:
            m = re.match(r"^GROQ_API_KEY=(.+)$", line.strip())
            if m:
                GROQ_KEY = m.group(1).strip()
                continue
            m = re.match(r"^FOKUS_ADMIN=(.+)$", line.strip())
            if m:
                # comma separated usernames that can see engine internals
                ADMIN_USERS = {u.strip().lower() for u in m.group(1).split(",") if u.strip()}
except FileNotFoundError:
    pass

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"
SESSION_DAYS = 30


# ---- storage: sqlite, one connection per request (thread safe by construction)
def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at REAL NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0)""")
        # migration: older users tables get the admin flag column
        ucols = {r[1] for r in c.execute("PRAGMA table_info(users)")}
        if "is_admin" not in ucols:
            c.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
        # admin accounts come from the FOKUS_ADMIN env var (comma separated)
        for name in ADMIN_USERS:
            c.execute("UPDATE users SET is_admin = 1 WHERE username = ?", (name,))
        c.execute("""CREATE TABLE IF NOT EXISTS counters (
            name TEXT PRIMARY KEY,
            value INTEGER NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at REAL NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS roadmaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            topic TEXT NOT NULL,
            modules TEXT NOT NULL,
            created_at REAL NOT NULL)""")
        # migration: older rows get a null trace column
        cols = {r[1] for r in c.execute("PRAGMA table_info(roadmaps)")}
        if "trace" not in cols:
            c.execute("ALTER TABLE roadmaps ADD COLUMN trace TEXT")


# ---- passwords: scrypt with a random salt, constant-time compare
def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        digest = hashlib.scrypt(password.encode(),
                                salt=bytes.fromhex(salt_hex), n=2 ** 14, r=8, p=1)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


# ---- sessions: opaque token in an HttpOnly cookie, row per session in sqlite
def create_session(user_id):
    token = secrets.token_urlsafe(32)
    with db() as c:
        c.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        c.execute("INSERT INTO sessions VALUES (?,?,?)",
                  (token, user_id, time.time() + SESSION_DAYS * 86400))
    return token


def session_user(request):
    # pull the cookie header, find fokus_session, look up a live session row
    cookie = request.headers.get("Cookie", "")
    token = ""
    for part in cookie.split(";"):
        if part.strip().startswith("fokus_session="):
            token = part.strip().split("=", 1)[1]
    if not token:
        return None
    with db() as c:
        row = c.execute(
            "SELECT u.id, u.username, u.created_at, u.is_admin FROM sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires_at > ?", (token, time.time())).fetchone()
    return dict(row) if row else None


def delete_session(request):
    cookie = request.headers.get("Cookie", "")
    for part in cookie.split(";"):
        if part.strip().startswith("fokus_session="):
            with db() as c:
                c.execute("DELETE FROM sessions WHERE token = ?",
                          (part.strip().split("=", 1)[1],))


# ---- rate limits: ai calls per ip + global daily cap, auth attempts tighter
AI_WINDOW, AI_MAX = 600, 20
AUTH_WINDOW, AUTH_MAX = 3600, 15
GLOBAL_DAY, GLOBAL_MAX = 86400, 300
_ai_hits = defaultdict(deque)
_auth_hits = defaultdict(deque)
_global_hits = deque()


def rate_ok(bucket_map, key, window, limit):
    now = time.time()
    q = bucket_map[key]
    while q and q[0] < now - window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


def ai_allowed(ip):
    if not rate_ok(_ai_hits, ip, AI_WINDOW, AI_MAX):
        return False
    now = time.time()
    while _global_hits and _global_hits[0] < now - GLOBAL_DAY:
        _global_hits.popleft()
    if len(_global_hits) >= GLOBAL_MAX:
        return False
    _global_hits.append(now)
    return True


# ---- outbound http helper (no deps)
def http_json(url, payload=None, headers=None, timeout=45):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Content-Type", "application/json")
    # groq + wikipedia both 403 the default python-urllib user-agent
    req.add_header("User-Agent", "fokus-demo/1.0 (gateway hosted; contact via funnel)")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# ---- wikipedia research: search once, then intro extracts in one request
def wiki_research(query, n=3):
    try:
        s = http_json(
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode(
                {"action": "query", "list": "search", "srsearch": query,
                 "srlimit": n, "format": "json"}),
            timeout=6)
        titles = [r["title"] for r in s["query"]["search"]]
        if not titles:
            return []
        e = http_json(
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode(
                {"action": "query", "prop": "extracts", "exintro": 1,
                 "explaintext": 1, "format": "json", "redirects": 1,
                 "titles": "|".join(titles)}),
            timeout=6)
        out = []
        for p in e["query"]["pages"].values():
            text = (p.get("extract") or "")[:600]
            if text:
                out.append({"title": p["title"], "text": text,
                            "url": "https://en.wikipedia.org/wiki/"
                                   + urllib.parse.quote(p["title"].replace(" ", "_"))})
        return out[:n]
    except Exception:
        return []


# ---- llm telemetry: every groq call logs tokens, latency, tok/s
# (filled during a generation, drained by the agent pipeline below)
LLM_CALLS = []

# indicative groq pricing per million tokens (we ride the free tier,
# but cost-per-request is a first-class metric in the ui)
COST_IN, COST_OUT = 0.05, 0.10


def groq_chat(messages, max_tokens=1400, retries=2):
    # no response_format: groq's json_object validation chokes on gpt-oss
    # reasoning output intermittently, so we parse the text defensively.
    # the model sometimes answers in prose instead of json, and the free tier
    # returns 429 on bursts, so retry both before surfacing an error.
    last = None
    for attempt in range(retries + 1):
        try:
            return _groq_once(messages, max_tokens)
        except ValueError as e:
            # prose instead of json: nudge it harder and try again
            last = e
            messages = messages + [{"role": "user",
                                    "content": "Output only a JSON object, nothing else."}]
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 502, 503):
                raise
            time.sleep(2 + attempt * 3)
    raise last


def _groq_once(messages, max_tokens=1400):
    t0 = time.time()
    r = http_json(GROQ_URL,
                  payload={"model": MODEL,
                           "messages": messages,
                           "temperature": 0.7,
                           "max_tokens": max_tokens},
                  headers={"Authorization": "Bearer " + GROQ_KEY},
                  timeout=45)
    dt = max(time.time() - t0, 0.001)
    u = r.get("usage") or {}
    LLM_CALLS.append({"model": MODEL,
                      "ms": int(dt * 1000),
                      "prompt_tokens": u.get("prompt_tokens", 0),
                      "completion_tokens": u.get("completion_tokens", 0),
                      "tps": round(u.get("completion_tokens", 0) / dt, 1)})
    text = r["choices"][0]["message"]["content"].strip()
    # strip markdown fences, take the outermost {...} block
    text = re.sub(r"^```(json)?|```$", "", text, flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no json object in model output")
    return json.loads(text[start:end + 1])


def research_block(sources):
    if not sources:
        return "(no research found, use your own knowledge)"
    return " ".join(f'[Wikipedia: {s["title"]}] {s["text"]}' for s in sources)


# ---- ai generation: an explicit agent pipeline
# researcher (wikipedia) -> builder (llm writes 8 modules) -> validator
# (checks the contract, triggers one rebuild if the model stopped short).
# each stage is timed and its llm calls recorded, so every roadmap row
# carries a granular trace: per-call tokens, tok/s and wall time.
def generate_modules(topic):
    trace = {"model": MODEL, "agents": []}
    state = {}

    def stage(name, fn):
        # run one agent, drain the llm calls it made into its trace entry
        del LLM_CALLS[:]
        t0 = time.time()
        out = fn()
        trace["agents"].append({"agent": name,
                                "ms": int((time.time() - t0) * 1000),
                                "calls": list(LLM_CALLS)})
        return out

    def research():
        state["sources"] = wiki_research(topic)
        return state["sources"]

    def build():
        base_prompt = (
            'Create a JSON object {"modules": array of items}. '
            'Decide how many items the topic genuinely needs: a broad field may need 12, '
            'a narrow skill may need 5. Between 5 and 12, sized to the real scope, never padded. '
            'Each item: {"title": a stage name of max 6 words, '
            '"content": 2 sentences, what to learn at this stage and why it matters}. '
            f'Topic: "{topic}". '
            'Sequence from complete beginner to advanced, titles specific to this topic. '
            f'Wikipedia research to ground it: {research_block(state["sources"])}')
        state["msgs"] = [
            {"role": "system",
             "content": "You design beginner-to-advanced learning roadmaps. Output strict JSON only, no prose."},
            {"role": "user", "content": base_prompt}]
        return groq_chat(state["msgs"], max_tokens=4000).get("modules", [])

    def validate(mods):
        # validator: keep the model's own module count, rebuild only if unusable
        count = len(mods) if isinstance(mods, list) else 0
        if 5 <= count <= 12:
            return mods
        state["msgs"].append(
            {"role": "user",
             "content": f"Return the full roadmap as JSON. Your previous answer had {count} modules; it needs between 5 and 12, sized to the topic."})
        return groq_chat(state["msgs"], max_tokens=4000).get("modules", [])

    sources = stage("Researcher", research)
    mods = stage("Builder", build)
    mods = stage("Validator", lambda: validate(mods))
    modules = [{"title": str(m.get("title", ""))[:60],
                "content": str(m.get("content", ""))[:400],
                "fullContent": None, "done": False}
               for m in mods if isinstance(m, dict)]
    return modules, [{"title": s["title"], "url": s["url"]} for s in sources], trace


def trace_totals(trace):
    # roll a trace up into llm-native totals: calls, tokens, tok/s, cost
    if not trace:
        return {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0,
                "tokens": 0, "ms": 0, "tps": 0, "cost_usd": 0}
    calls = [c for a in trace["agents"] for c in a["calls"]]
    pin = sum(c["prompt_tokens"] for c in calls)
    pout = sum(c["completion_tokens"] for c in calls)
    ms = sum(c["ms"] for c in calls)
    return {"calls": len(calls),
            "prompt_tokens": pin, "completion_tokens": pout, "tokens": pin + pout,
            "ms": ms,
            "tps": round(pout / max(ms / 1000, 0.001), 1),
            "cost_usd": round((pin * COST_IN + pout * COST_OUT) / 1e6, 6)}


def generate_detail(topic, title, index):
    sources = wiki_research(f"{topic} {title}", n=2)
    data = groq_chat([
        {"role": "system",
         "content": "You write focused study guides. Output strict JSON only, no prose."},
        {"role": "user",
         "content":
             'Create a JSON object {"content": one string}. The string: a 150-220 word '
             'free-form study guide for module ' + str(index) + f' ("{title}") of a learning path on "{topic}". '
             'Write it as 2-3 natural flowing paragraphs, like a friendly tutor explaining the module. '
             'Weave in the key concepts and one common beginner mistake inside the paragraphs. '
             'Strictly no bullet points, no numbered lists, no headings, no markdown. '
             'Also include "worked", a fully worked example of the core skill of this stage: '
             '{"setup": the concrete situation in one line, "steps": [3 to 5 short numbered actions, '
             'each one sentence, concrete and specific to the topic], "result": what the learner ends '
             'up with, one sentence, "watchout": the specific mistake people make at one of these '
             'steps, one sentence}. The example must be something the learner could actually do right '
             'now at this level, not a summary of the idea. '
             f'Wikipedia research: {research_block(sources)}'},
    ], max_tokens=6000)  # gpt-oss spends ~1.5k on reasoning before any output
    worked = data.get("worked") if isinstance(data.get("worked"), dict) else None
    if worked:
        raw_steps = [str(x).strip() for x in (worked.get("steps") or [])][:5]
        # the ui numbers the steps itself, so drop any "1." / "1)" the model adds
        steps = [re.sub(r"^\s*\d+\s*[.)]\s*", "", x) for x in raw_steps]
        worked = {"setup": str(worked.get("setup", "")).strip()[:300],
                  "steps": [x[:240] for x in steps if x],
                  "result": str(worked.get("result", "")).strip()[:300],
                  "watchout": str(worked.get("watchout", "")).strip()[:300]}
        if len(worked["steps"]) < 2:
            worked = None
    return {
        "v": 3,
        "content": str(data.get("content", "")).strip(),
        "worked": worked,
        "sources": [{"title": s["title"], "url": s["url"]} for s in sources],
    }


def generate_quiz(topic, title, index, guide="", watched=None):
    # a check sized to the module: what the guide actually covered decides how many
    # targeted questions there are, and they must span recall, application and a trap
    guide_block = (guide or "")[:2600] if guide else ""
    data = groq_chat([
        {"role": "system",
         "content": "You write targeted comprehension checks. Output strict JSON only, no prose."},
        {"role": "user",
         "content":
             'Create a JSON object {"questions": [...]} checking whether someone really '
             f'understood module {index} ("{title}") of a learning path on "{topic}". '
             'Decide the count from the material: pick the number needed to cover every distinct '
             'concept in the guide, between 3 and 5. Do not pad, do not repeat a concept. '
             'Each question must be targeted at a specific idea, not general trivia, and across '
             'the set cover at least one of these kinds: '
             '{"kind": "recall", ...} remembering a definition or term; '
             '{"kind": "apply", ...} using the idea in a situation they have not seen; '
             '{"kind": "trap", ...} a common beginner mistake stated so the wrong answer looks tempting. '
             'Each item: {"q": the question, "kind": one of recall/apply/trap, '
             '"concept": the specific idea it tests (3-6 words), "options": [4 short answers], '
             '"answer": index of the correct option (0-3), "why": one sentence a learner learns something from, explaining why the right answer is right rather than just naming the concept. '
             'Exactly one option is correct, the others plausible but wrong. '
             'Keep every option under 90 characters, plain text, no markdown. '
             + (f"Study guide the learner just read: {guide_block}" if guide_block
                else "Write questions that test the module scope stated above.")
             + (" Videos they watched: " + "; ".join(watched[:3]) +
                ". Cover the concepts those videos and the guide share; if a concept is only "
                "in the videos, test that too, so the check matches what they actually saw."
                if watched else "")},
    ], max_tokens=4000)  # reasoning + up to five questions
    out = []
    for q in (data.get("questions") or [])[:6]:
        if not isinstance(q, dict):
            continue
        opts = [str(o).strip() for o in (q.get("options") or [])][:4]
        try:
            ans = int(q.get("answer", -1))
        except Exception:
            ans = -1
        text = str(q.get("q", "")).strip()
        kind = str(q.get("kind", "")).strip().lower()
        if kind not in ("recall", "apply", "trap"):
            kind = "recall"
        if len(opts) == 4 and 0 <= ans < 4 and text:
            out.append({"q": text, "kind": kind,
                        "concept": str(q.get("concept", "")).strip()[:60],
                        "options": opts, "answer": ans,
                        "why": str(q.get("why", "")).strip()})
    # 3 to 5 questions, and the pass mark is two thirds of whatever was asked
    out = out[:5]
    return {"v": 2, "questions": out, "pass": max(2, -(-len(out) * 2 // 3))}


# ---- youtube: scrape the results page (no key needed), verify via oembed
def youtube_videos(query, want=3):
    try:
        req = urllib.request.Request(
            "https://www.youtube.com/results?"
            + urllib.parse.urlencode({"search_query": query}),
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
                     "Accept-Language": "en-US,en;q=0.9"})
        with urllib.request.urlopen(req, timeout=8) as r:
            html = r.read().decode("utf-8", "ignore")
        # pull the fields out of each videoRenderer block
        out, seen = [], set()
        for chunk in html.split('"videoRenderer":{')[1:]:
            block = chunk[:3000]
            vid = re.search(r'"videoId":"([\w-]{11})"', block)
            title = re.search(r'"title":\{"runs":\[\{"text":"([^"]{2,120})"', block)
            channel = re.search(r'"ownerText":\{"runs":\[\{"text":"([^"]{1,60})"', block)
            length = re.search(r'"lengthText":\{[^}]*"simpleText":"([\d:]+)"', block)
            if not (vid and title) or vid.group(1) in seen:
                continue
            # skip shorts when the duration is known (under 2 minutes)
            if length:
                secs = sum(int(p) * 60 ** i for i, p in enumerate(reversed(length.group(1).split(":"))))
                if secs < 120:
                    continue
            seen.add(vid.group(1))
            out.append({"id": vid.group(1), "title": title.group(1),
                        "channel": channel.group(1) if channel else "",
                        "length": length.group(1) if length else ""})
            if len(out) >= want + 4:
                break
        # rank by title overlap with the stage, so a same-name-but-wrong-topic video
        # does not ride in on search position alone
        words = {w.lower() for w in re.findall(r"[a-z]{4,}", query)}
        def score(v):
            t = {w.lower() for w in re.findall(r"[a-z]{4,}", v.get("title", ""))}
            return len(words & t)
        out.sort(key=score, reverse=True)
        out = [v for v in out if score(v) > 0] or out

        # verify each candidate really exists (and drop dead/embed-blocked ones)
        verified = []
        for v in out:
            if len(verified) >= want:
                break
            try:
                o = http_json("https://www.youtube.com/oembed?"
                              + urllib.parse.urlencode(
                                  {"url": f"https://www.youtube.com/watch?v={v['id']}",
                                   "format": "json"}), timeout=6)
                v["title"] = str(o.get("title", v["title"]))[:110]
                v["channel"] = str(o.get("author_name", v["channel"]))[:60]
                verified.append(v)
            except Exception:
                continue
        return verified
    except Exception:
        return []


def course_links(topic, title):
    # deterministic deep links to real platform searches: always valid, never fabricated
    q = urllib.parse.quote_plus(f"{topic} {title}")
    return [
        {"name": f"{title} courses", "platform": "Coursera",
         "url": f"https://www.coursera.org/search?query={urllib.parse.quote_plus(title)}"},
        {"name": f"{title} courses", "platform": "Udemy",
         "url": f"https://www.udemy.com/courses/search/?q={urllib.parse.quote_plus(title)}"},
        {"name": f"{title} lessons", "platform": "Khan Academy",
         "url": f"https://www.khanacademy.org/search?page_search_query={urllib.parse.quote_plus(title)}"},
        {"name": f"free {title} tutorials", "platform": "freeCodeCamp",
         "url": f"https://www.freecodecamp.org/news/search?query={urllib.parse.quote_plus(title)}"},
        {"name": f"more videos on {title}", "platform": "YouTube",
         "url": f"https://www.youtube.com/results?search_query={q}"},
    ]



# ---- topic gate: algorithmic nonsense detection before spending an ai call
QWERTY_RUNS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"]
ACRONYM_OK = {"html", "css", "sql", "tsql", "php", "api", "aws", "gcp", "seo", "ui",
              "ux", "csv", "json", "xml", "http", "tcp", "ip", "os", "db", "oop",
              "ml", "ai", "js", "ts", "c", "go", "r", "k8s", "npm", "ci", "cd"}
VOWELS = set("aeiouy")


def shannon_entropy(s):
    if not s:
        return 0.0
    freq = {c: s.count(c) for c in set(s)}
    n = len(s)
    return -sum((f / n) * __import__("math").log2(f / n) for f in freq.values())


def token_nonsense(tok):
    # returns a score; >= 3 means this token is likely key spam
    import math, re as _re
    score = 0
    t = tok.lower()
    alpha = [c for c in t if c.isalpha()]
    # long runs along a keyboard row (either direction)
    for row in QWERTY_RUNS:
        for i in range(len(row) - 3):
            frag = row[i:i + 4]
            if frag in t or frag[::-1] in t:
                score += 3
                break
    # same character repeated 4+ times
    if _re.search(r"(.)\1{3,}", t):
        score += 2
    # periodic repeats like ababab / abcabcabc
    for p in (1, 2, 3):
        if len(t) >= p * 3 and t == t[:p] * (len(t) // p):
            score += 3
            break
    # very low character entropy
    if len(alpha) >= 6 and shannon_entropy(t) < 2.3:
        score += 2
    # consonant soup: real English needs vowels (tech acronyms excepted)
    if len(alpha) >= 4 and not (set(alpha) & VOWELS) and t not in ACRONYM_OK:
        score += 3
    return score


def wiki_corroborates(topic):
    # does wikipedia know this topic? fuzzy search returns junk for gibberish,
    # so require a returned title to actually share the query as a word/substring
    try:
        r = http_json(
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode(
                {"action": "query", "list": "search", "srsearch": topic,
                 "srlimit": 5, "format": "json"}), timeout=6)
        q = topic.lower()
        for item in r["query"]["search"]:
            title = item["title"].lower()
            if q in title or title in q:
                return True
            # any full word of the query appearing in a title counts
            if any(w in title for w in q.split() if len(w) >= 3):
                return True
        return False
    except Exception:
        return True  # wiki unreachable: never block a maybe-real topic on a network error


def topic_check(topic):
    # returns (ok, suggestions) — suggestions come from wikipedia on the
    # most real-looking word, so "pythonsdfg" can still rescue "python"
    tokens = [t for t in re.split(r"[^A-Za-z0-9+#]+", topic.lower()) if t]
    scored = [(token_nonsense(t), t) for t in tokens]
    total = sum(s for s, _ in scored)
    ok = total < 3
    if total == 2:
        # borderline (e.g. low-entropy "hjhdhdehe" or repeat-y "banana"):
        # let wikipedia decide — real words have articles, key spam does not
        ok = wiki_corroborates(topic)
    suggestions = []
    if not ok:
        # pick the longest token that itself looks sane and has a vowel
        candidates = sorted((t for s, t in scored if s == 0 and set(t) & VOWELS),
                            key=len, reverse=True)
        if not candidates:
            # key spam glued onto a real word ("pythonsdfg"): probe prefixes
            longest = max((t for _, t in scored), key=len, default="")
            probes = [longest[:max(4, int(len(longest) * f))]
                      for f in (0.8, 0.6, 0.45)]
            candidates = list(dict.fromkeys(probes))
        for cand in candidates[:2]:
            try:
                r = http_json(
                    "https://en.wikipedia.org/w/api.php?"
                    + urllib.parse.urlencode(
                        {"action": "query", "list": "search", "srsearch": cand,
                         "srlimit": 4, "format": "json"}), timeout=6)
                seen = set()
                for item in r["query"]["search"]:
                    title = item["title"]
                    if ":" in title or title.lower() in seen:
                        continue
                    seen.add(title.lower())
                    suggestions.append(title)
                    if len(suggestions) >= 3:
                        break
            except Exception:
                pass
            if suggestions:
                break
    return ok, suggestions


def llm_topic_check(topic):
    # real word != learnable subject: a tiny judge call separates
    # "guitar" (learnable) from "banana" (a fruit, not a course)
    data = groq_chat([
        {"role": "system",
         "content": "You decide whether topics are learnable. Output strict JSON only."},
        {"role": "user",
         "content":
             'Would "' + topic + '" work as the subject of a structured learning roadmap: '
             'a skill, craft, art, sport, language, field of study, or discipline someone '
             'can practice and improve at? Answer as JSON {"ok": true/false, '
             '"suggestions": array of up to 3 strings}. If not ok, suggestions are nearby '
             'learnable topics the person might have meant (e.g. "banana" -> '
             '["baking", "fruit carving", "nutrition basics"]). If ok, suggestions is [].'},
    ], max_tokens=300)
    return bool(data.get("ok")), [str(s)[:60] for s in data.get("suggestions", [])][:3]


def bump_counter(name, by=1):
    with db() as c:
        c.execute("INSERT INTO counters (name, value) VALUES (?,?) "
                  "ON CONFLICT(name) DO UPDATE SET value = value + excluded.value",
                  (name, by))


def _agent_averages(rows):
    # mean wall time per pipeline agent across all traced roadmaps
    agg = {}
    for r in rows:
        if not r["trace"]:
            continue
        for a in json.loads(r["trace"]).get("agents", []):
            name = a["agent"].capitalize()
            e = agg.setdefault(name, [0, 0])
            e[0] += a["ms"]; e[1] += 1
    return agg


def roadmap_json(row, admin=False):
    # engine internals (trace + totals) only ship to admin accounts
    trace = json.loads(row["trace"]) if row["trace"] else None
    return {"id": row["id"], "topic": row["topic"],
            "createdAt": row["created_at"],
            "modules": json.loads(row["modules"]),
            "trace": trace if admin else None,
            "traceTotals": trace_totals(trace) if admin else None}


def roadmap_summary(row):
    modules = json.loads(row["modules"])
    next_mod = next((m["title"] for m in modules if not m.get("done")), None)
    return {"id": row["id"], "topic": row["topic"],
            "createdAt": row["created_at"],
            "total": len(modules),
            "done": sum(1 for m in modules if m.get("done")),
            "next": next_mod}


def load_owned(c, user_id, roadmap_id):
    row = c.execute("SELECT * FROM roadmaps WHERE id = ? AND user_id = ?",
                    (roadmap_id, user_id)).fetchone()
    return row


# ---- request handler
class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST, **kwargs)

    def log_message(self, fmt, *args):
        pass  # keep quiet, no keys, users, or topics in logs

    def client_ip(self):
        return self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()

    def _json(self, code, obj, set_cookie=None):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if set_cookie is not None:
            self.send_header("Set-Cookie", set_cookie)
        self.end_headers()
        self.wfile.write(body)

    def _cookie(self, token):
        return (f"fokus_session={token}; Path=/; Max-Age={SESSION_DAYS * 86400}; "
                "HttpOnly; SameSite=Lax; Secure")

    def _clear_cookie(self):
        return "fokus_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"

    def _read_body(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            return None

    # ---- routing ---------------------------------------------------------
    def do_POST(self):
        try:
            return self.route_post()
        except Exception:
            # log the real traceback, the browser only sees a generic 500
            self.log_error_to_file()
            try:
                return self._json(500, {"error": "internal error"})
            except Exception:
                pass

    def do_DELETE(self):
        # deletes share the post routing, they just carry no body
        self._delete = True
        try:
            return self.route_post()
        except Exception:
            self.log_error_to_file()
            try:
                return self._json(500, {"error": "internal error"})
            except Exception:
                pass

    def log_error_to_file(self):
        try:
            with open(os.path.join(BASE, "fokus-error.log"), "a") as f:
                f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + "-" * 40 + "\n")
                traceback.print_exc(file=f)
        except Exception:
            pass

    def route_post(self):
        path = self.strip_prefix(self.path.split("?")[0]).rstrip("/")
        if getattr(self, "_delete", False):
            body = {}
            m = re.fullmatch(r"/api/roadmaps/(\d+)", path)
            if m:
                return self.handle_delete_user(m.group(1))
            return self._json(404, {"error": "not found"})
        body = self._read_body()
        if body is None:
            return self._json(400, {"error": "bad json"})

        # auth endpoints (no session needed, tighter rate limit)
        if path in ("/api/auth/register", "/api/auth/login"):
            if not rate_ok(_auth_hits, self.client_ip(), AUTH_WINDOW, AUTH_MAX):
                return self._json(429, {"error": "too many attempts, try later"})
            return self.handle_auth(path, body)

        # everything below needs a logged-in user
        user = session_user(self)
        if not user:
            return self._json(401, {"error": "not signed in"})
        if path == "/api/auth/logout":
            delete_session(self)
            return self._json(200, {"ok": True}, set_cookie=self._clear_cookie())
        if path == "/api/validate-topic" and isinstance(body.get("topic"), str):
            # nonsense gate: algorithmic check, no ai cost
            ok, suggestions = topic_check(str(body.get("topic", "")))
            return self._json(200, {"ok": ok, "suggestions": suggestions})
        if path == "/api/roadmaps" and isinstance(body.get("topic"), str):
            # strictly-admin: admins manage the instance, they don't learn
            if user["is_admin"]:
                return self._json(403, {"error": "Admin accounts manage the instance, not learn in it"})
            return self.handle_create(user, body)
        m = re.fullmatch(r"/api/roadmaps/(\d+)/(toggle|detail|resources|quiz)", path)
        if m:
            return self.handle_module(user, int(m.group(1)), m.group(2), body)
        m = re.fullmatch(r"/api/roadmaps/(\d+)", path)
        if m:
            return self.handle_delete(user, int(m.group(1)))
        return self._json(404, {"error": "not found"})

    def do_GET(self):
        path = self.strip_prefix(self.path.split("?")[0]).rstrip("/")
        if path == "/api/me":
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            return self._json(200, {"username": user["username"],
                                    "createdAt": user["created_at"],
                                    "isAdmin": bool(user["is_admin"])})
        if path == "/api/roadmaps":
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            with db() as c:
                rows = c.execute(
                    "SELECT * FROM roadmaps WHERE user_id = ? ORDER BY created_at DESC",
                    (user["id"],)).fetchall()
            return self._json(200, [roadmap_summary(r) for r in rows])
        m = re.fullmatch(r"/api/roadmaps/(\d+)", path)
        if m:
            # one full roadmap, so a refresh of /roadmap/<id> restores everything
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            with db() as c:
                row = load_owned(c, user["id"], int(m.group(1)))
            if not row:
                return self._json(404, {"error": "roadmap not found"})
            return self._json(200, roadmap_json(row, admin=bool(user["is_admin"])))
        if path == "/api/activity":
            # completion dates for the sidebar calendar: last 35 days per day count
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            days, week, total = {}, 0, None
            now = time.time()
            week_ago = now - 7 * 86400
            with db() as c:
                rows = c.execute("SELECT modules FROM roadmaps WHERE user_id = ?",
                                 (user["id"],)).fetchall()
            for row in rows:
                for mod in json.loads(row["modules"]):
                    ts = mod.get("doneAt")
                    if not ts:
                        continue
                    day = time.strftime("%Y-%m-%d", time.gmtime(ts))
                    days[day] = days.get(day, 0) + 1
                    total = (total or 0) + 1
                    if ts >= week_ago:
                        week += 1
            return self._json(200, {"days": days, "week": week, "total": total or 0})
        if path == "/api/metrics":
            # llm-native engine metrics rolled up across all roadmaps (admin only)
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            if not user["is_admin"]:
                return self._json(403, {"error": "admin only"})
            with db() as c:
                rows = c.execute("SELECT trace FROM roadmaps WHERE user_id = ?",
                                 (user["id"],)).fetchall()
            agg = {"roadmaps": len(rows), "calls": 0, "tokens": 0, "ms": 0, "cost_usd": 0}
            out_toks = 0
            for row in rows:
                if not row["trace"]:
                    continue
                t = trace_totals(json.loads(row["trace"]))
                agg["calls"] += t["calls"]
                agg["tokens"] += t["tokens"]
                agg["ms"] += t["ms"]
                agg["cost_usd"] = round(agg["cost_usd"] + t["cost_usd"], 6)
                out_toks += t["completion_tokens"]
            agg["tps"] = round(out_toks / max(agg["ms"] / 1000, 0.001), 1)
            agg["cost_usd"] = round(agg["cost_usd"], 4)
            return self._json(200, agg)
        if path == "/api/admin/stats":
            # whole-instance stats for the admin dashboard (admin only)
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            if not user["is_admin"]:
                return self._json(403, {"error": "admin only"})
            now = time.time()
            week_ago = now - 7 * 86400
            with db() as c:
                users = c.execute("SELECT username, created_at FROM users").fetchall()
                rows = c.execute(
                    "SELECT r.topic, r.created_at, r.modules, r.trace, u.username "
                    "FROM roadmaps r JOIN users u ON u.id = r.user_id "
                    "ORDER BY r.created_at DESC").fetchall()
                c2 = c
            modules_total = modules_done = 0
            per_user, per_day = {}, {}
            day0 = time.strftime("%Y-%m-%d", time.gmtime(now - 13 * 86400))
            llm = {"calls": 0, "tokens": 0, "ms": 0, "cost_usd": 0.0, "out_tokens": 0}
            for row in rows:
                mods = json.loads(row["modules"])
                done = sum(1 for m in mods if m.get("done"))
                modules_total += len(mods)
                modules_done += done
                u = per_user.setdefault(row["username"], {"roadmaps": 0, "done": 0, "last": 0.0})
                u["roadmaps"] += 1
                u["done"] += done
                # last activity: newest roadmap or newest module completion
                u["last"] = max(u["last"], row["created_at"])
                for m in mods:
                    if m.get("doneAt"):
                        u["last"] = max(u["last"], m["doneAt"])
                day = time.strftime("%Y-%m-%d", time.gmtime(row["created_at"]))
                if day >= day0:
                    per_day[day] = per_day.get(day, 0) + 1
                if row["trace"]:
                    t = trace_totals(json.loads(row["trace"]))
                    llm["calls"] += t["calls"]
                    llm["tokens"] += t["tokens"]
                    llm["ms"] += t["ms"]
                    llm["cost_usd"] += t["cost_usd"]
                    llm["out_tokens"] += t["completion_tokens"]
            # full 14-day series including zero days
            series = []
            for i in range(13, -1, -1):
                d = time.strftime("%Y-%m-%d", time.gmtime(now - i * 86400))
                series.append({"day": d, "roadmaps": per_day.get(d, 0)})
            top = sorted(per_user.items(), key=lambda kv: -kv[1]["roadmaps"])[:8]
            # tokens per day + avg generation time from traces
            tok_day, gen_ms = {}, []
            for row in rows:
                if row["trace"]:
                    t = trace_totals(json.loads(row["trace"]))
                    gen_ms.append(t["ms"])
                    day = time.strftime("%Y-%m-%d", time.gmtime(row["created_at"]))
                    if day >= day0:
                        tok_day[day] = tok_day.get(day, 0) + t["tokens"]
            token_series = [{"day": d["day"], "tokens": tok_day.get(d["day"], 0)} for d in series]
            first = min((r["created_at"] for r in rows), default=None)
            span_days = max(1, (now - first) / 86400) if first else 14
            month_proj = round(sum(tok_day.values()) / max(span_days, 1) * 0, 4)  # tokens/day avg below
            tok_total = sum(t["tokens"] for t in [trace_totals(json.loads(r["trace"])) for r in rows if r["trace"]])
            cost_total = sum(t["cost_usd"] for t in [trace_totals(json.loads(r["trace"])) for r in rows if r["trace"]])
            month_cost = round(cost_total / min(span_days, 14 if not tok_day else 14) * 30, 4) if cost_total else 0.0
            try:
                db_size = os.path.getsize(DB)
            except Exception:
                db_size = 0
            return self._json(200, {
                "users": len(users),
                "newUsersWeek": sum(1 for u in users if u["created_at"] >= week_ago),
                "activeWeek": sum(1 for v in per_user.values() if v["last"] >= week_ago),
                "roadmaps": len(rows),
                "modules": modules_total,
                "modulesDone": modules_done,
                "llm": {"calls": llm["calls"], "tokens": llm["tokens"],
                        "tps": round(llm["out_tokens"] / max(llm["ms"] / 1000, 0.001), 1),
                        "costUsd": round(llm["cost_usd"], 4)},
                "gateRejections": (c2.execute("SELECT value FROM counters WHERE name = 'gate_rejections'")
                                   .fetchone() or {"value": 0})["value"],
                "avgGenMs": round(sum(gen_ms) / len(gen_ms)) if gen_ms else 0,
                "lastCreated": max((r["created_at"] for r in rows), default=None),
                "tokenSeries": token_series,
                "models": [{"model": MODEL, "calls": llm["calls"], "tokens": llm["tokens"],
                            "tps": round(llm["out_tokens"] / max(llm["ms"] / 1000, 0.001), 1),
                            "costUsd": round(llm["cost_usd"], 4)}],
                "monthCost": month_cost,
                "dbInfo": {"path": DB, "sizeKb": round(db_size / 1024), "roadmaps": len(rows)},
                "serverStarted": SERVER_STARTED or now,
                "funnel": {"started": len(rows),
                           "touched": sum(1 for r in rows if any(m.get("done") for m in json.loads(r["modules"]))),
                           "finished": sum(1 for r in rows if all(m.get("done") for m in json.loads(r["modules"])) and json.loads(r["modules"]))},
                "completionRate": round(100 * modules_done / modules_total, 1) if modules_total else 0,
                "attention": [{"topic": r["topic"], "owner": r["username"], "ageDays": int((now - r["created_at"]) / 86400)}
                              for r in rows
                              if not any(m.get("done") for m in json.loads(r["modules"])) and now - r["created_at"] > 3 * 86400][:5],
                "slowest": sorted([{"topic": r["topic"],
                                    "ms": trace_totals(json.loads(r["trace"]))["ms"],
                                    "tokens": trace_totals(json.loads(r["trace"]))["tokens"]}
                                   for r in rows if r["trace"]],
                                  key=lambda x: -x["ms"])[:5],
                "agentAverages": (lambda ag: {k: round(v[0] / v[1]) for k, v in ag.items()})((
                    lambda: ({}))() if not rows else _agent_averages(rows)),
                "config": {"admins": sorted(ADMIN_USERS), "sessionDays": SESSION_DAYS,
                           "authRateLimit": AUTH_MAX, "aiPerWindow": AI_MAX},
                "series": series,
                "topUsers": [{"username": k, "roadmaps": v["roadmaps"], "done": v["done"]} for k, v in top],
                "recent": [{"topic": r["topic"], "owner": r["username"],
                            "created": r["created_at"],
                            "done": sum(1 for m in json.loads(r["modules"]) if m.get("done")),
                            "total": len(json.loads(r["modules"]))}
                           for r in rows[:8]]})
        m = re.fullmatch(r"/api/admin/(users|roadmaps)", path)
        if m:
            # admin sub-pages: per-user activity and the instance content list
            user = session_user(self)
            if not user:
                return self._json(401, {"error": "not signed in"})
            if not user["is_admin"]:
                return self._json(403, {"error": "admin only"})
            with db() as c:
                users = c.execute("SELECT username, created_at FROM users").fetchall()
                rows = c.execute(
                    "SELECT r.id, r.topic, r.created_at, r.modules, r.trace, u.username "
                    "FROM roadmaps r JOIN users u ON u.id = r.user_id "
                    "ORDER BY r.created_at DESC").fetchall()
            if m.group(1) == "users":
                per = {}
                seen = set()
                for r in rows:
                    mods = json.loads(r["modules"])
                    p = per.setdefault(r["username"],
                                       {"roadmaps": 0, "done": 0, "lastActive": r["created_at"]})
                    p["roadmaps"] += 1
                    p["done"] += sum(1 for x in mods if x.get("done"))
                    if r["username"] not in seen:
                        seen.add(r["username"])
                        p["lastTopic"] = r["topic"]
                    for x in mods:
                        if x.get("doneAt"):
                            p["lastActive"] = max(p["lastActive"], x["doneAt"])
                # per-user completion calendar (last 35 days) for the admin expansion
                for r in rows:
                    p = per.setdefault(r["username"], {"roadmaps": 0, "done": 0, "lastActive": r["created_at"], "days": {}})
                    p.setdefault("days", {})
                    for x in json.loads(r["modules"]):
                        if x.get("doneAt"):
                            day = time.strftime("%Y-%m-%d", time.gmtime(x["doneAt"]))
                            p["days"][day] = p["days"].get(day, 0) + 1
                return self._json(200, [
                    {"username": u["username"], "joined": u["created_at"],
                     **per.get(u["username"], {"roadmaps": 0, "done": 0, "lastActive": None, "days": {}})}
                    for u in users])
            out = []
            for r in rows:
                mods = json.loads(r["modules"])
                t = trace_totals(json.loads(r["trace"])) if r["trace"] else None
                out.append({"id": r["id"], "topic": r["topic"], "owner": r["username"],
                            "created": r["created_at"],
                            "done": sum(1 for x in mods if x.get("done")),
                            "total": len(mods),
                            "genMs": t["ms"] if t else None,
                            "tokens": t["tokens"] if t else None,
                            "hasResources": any(x.get("resources") for x in mods)})
            return self._json(200, out)
        if path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        return super().do_GET()

    # ---- endpoint bodies --------------------------------------------------
    def handle_auth(self, path, body):
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        if not re.fullmatch(r"[A-Za-z0-9_]{3,24}", username):
            return self._json(400, {"error": "username must be 3-24 letters, numbers or _"})
        if len(password) < 6:
            return self._json(400, {"error": "password must be at least 6 characters"})
        with db() as c:
            if path == "/api/auth/register":
                existing = c.execute("SELECT id FROM users WHERE username = ?",
                                     (username,)).fetchone()
                if existing:
                    return self._json(409, {"error": "that username is taken"})
                cur = c.execute("INSERT INTO users (username, password_hash, created_at, is_admin) "
                                "VALUES (?,?,?,?)",
                                (username, hash_password(password), time.time(),
                                 1 if username.lower() in ADMIN_USERS else 0))
                user_id = cur.lastrowid
            else:
                row = c.execute("SELECT id, password_hash FROM users WHERE username = ?",
                                (username,)).fetchone()
                if not row or not verify_password(password, row["password_hash"]):
                    return self._json(401, {"error": "wrong username or password"})
                user_id = row["id"]
        token = create_session(user_id)
        return self._json(200, {"username": username},
                          set_cookie=self._cookie(token))

    def handle_create(self, user, body):
        # validate the topic, then spend one ai call on it
        topic = re.sub(r"\s+", " ", body.get("topic", "")).strip()[:80]
        if not topic or not re.fullmatch(r"[\w\s&+\-'.(),]{2,80}", topic):
            return self._json(400, {"error": "invalid topic"})
        # nonsense gate: refuse key spam before it reaches the ai
        ok, suggestions = topic_check(topic)
        if not ok:
            bump_counter("gate_rejections")
            return self._json(422, {"error": "That doesn't look like a real topic",
                                    "suggestions": suggestions})
        if not ai_allowed(self.client_ip()):
            return self._json(429, {"error": "rate limited, try again later"})
        if not GROQ_KEY:
            return self._json(503, {"error": "ai backend not configured"})
        # learnability gate: a tiny judge call, so "banana" gets redirected
        # to real topics instead of generating a course about a fruit
        try:
            learnable, judge_sugg = llm_topic_check(topic)
        except Exception:
            learnable, judge_sugg = True, []  # judge down: don't block real users
        if not learnable:
            bump_counter("gate_rejections")
            return self._json(422, {"error": "That's a real word, but not much to learn there",
                                    "suggestions": judge_sugg})
        try:
            modules, _sources, trace = generate_modules(topic)
        except Exception:
            return self._json(502, {"error": "ai generation failed, try again"})
        if len(modules) < 4:
            return self._json(502, {"error": "ai returned too few modules, try again"})
        with db() as c:
            cur = c.execute(
                "INSERT INTO roadmaps (user_id, topic, modules, created_at, trace) "
                "VALUES (?,?,?,?,?)",
                (user["id"], topic, json.dumps(modules), time.time(),
                 json.dumps(trace)))
            row = load_owned(c, user["id"], cur.lastrowid)
        return self._json(200, roadmap_json(row, admin=bool(user["is_admin"])))

    def handle_module(self, user, roadmap_id, action, body):
        try:
            index = int(body.get("index", -1))
        except Exception:
            index = -1
        with db() as c:
            row = load_owned(c, user["id"], roadmap_id)
            if not row:
                return self._json(404, {"error": "roadmap not found"})
            modules = json.loads(row["modules"])
            if index < 0 or index >= len(modules):
                return self._json(400, {"error": "invalid module index"})
            if action == "toggle":
                # flip the done flag (and remember when) then save
                if modules[index].get("done"):
                    modules[index]["done"] = False
                    modules[index].pop("doneAt", None)
                else:
                    modules[index]["done"] = True
                    modules[index]["doneAt"] = time.time()
                c.execute("UPDATE roadmaps SET modules = ? WHERE id = ?",
                          (json.dumps(modules), roadmap_id))
            elif action == "resources":
                # real youtube videos + course deep links, generated once and stored
                if modules[index].get("resources"):
                    row = load_owned(c, user["id"], roadmap_id)
                    return self._json(200, roadmap_json(row))
                if not ai_allowed(self.client_ip()):
                    return self._json(429, {"error": "rate limited, try again later"})
                vids = youtube_videos(f'{row["topic"]} {modules[index]["title"]} tutorial')
                modules[index]["resources"] = {
                    "videos": vids,
                    "links": course_links(row["topic"], modules[index]["title"])}
                c.execute("UPDATE roadmaps SET modules = ? WHERE id = ?",
                          (json.dumps(modules), roadmap_id))
            elif action == "quiz":
                # three quick questions per module, generated once and stored
                if modules[index].get("quiz"):
                    row = load_owned(c, user["id"], roadmap_id)
                    return self._json(200, roadmap_json(row))
                if not ai_allowed(self.client_ip()):
                    return self._json(429, {"error": "rate limited, try again later"})
                try:
                    vids = (modules[index].get("resources") or {}).get("videos") or []
                    modules[index]["quiz"] = generate_quiz(
                        row["topic"], modules[index]["title"], index + 1,
                        guide=(modules[index].get("detail") or {}).get("content", ""),
                        watched=[v.get("title", "") for v in vids if v.get("title")])
                except Exception:
                    return self._json(502, {"error": "quiz generation failed, try again"})
                c.execute("UPDATE roadmaps SET modules = ? WHERE id = ?",
                          (json.dumps(modules), roadmap_id))
            else:  # detail
                if not ai_allowed(self.client_ip()):
                    return self._json(429, {"error": "rate limited, try again later"})
                try:
                    modules[index]["detail"] = generate_detail(
                        row["topic"], modules[index]["title"], index + 1)
                    # legacy flat text stays for old clients; structured wins on render
                    modules[index]["fullContent"] = None
                except Exception:
                    return self._json(502, {"error": "ai generation failed, try again"})
                c.execute("UPDATE roadmaps SET modules = ? WHERE id = ?",
                          (json.dumps(modules), roadmap_id))
            row = load_owned(c, user["id"], roadmap_id)
        return self._json(200, roadmap_json(row))

    def handle_delete(self, user, roadmap_id):
        with db() as c:
            row = load_owned(c, user["id"], roadmap_id)
            if not row:
                return self._json(404, {"error": "roadmap not found"})
            c.execute("DELETE FROM roadmaps WHERE id = ?", (roadmap_id,))
        return self._json(200, {"ok": True})

    def handle_delete_user(self, roadmap_id_str):
        # DELETE requests arrive here: auth first, then reuse handle_delete
        user = session_user(self)
        if not user:
            return self._json(401, {"error": "not signed in"})
        if not roadmap_id_str.isdigit():
            return self._json(400, {"error": "bad roadmap id"})
        return self.handle_delete(user, int(roadmap_id_str))

    # ---- static files ------------------------------------------------------
    @staticmethod
    def strip_prefix(path):
        # funnel strips the /fokus mount prefix, but accept it if present
        for prefix in ("/fokus", "/fokus/"):
            if path.startswith(prefix):
                return path[len("/fokus"):]
        return path

    def translate_path(self, path):
        path = self.strip_prefix(path.split("?", 1)[0].split("#", 1)[0])
        candidate = super().translate_path(path)
        # SPA fallback: unknown extensionless paths -> index.html
        if not os.path.exists(candidate) and not os.path.basename(candidate).count("."):
            return os.path.join(DIST, "index.html")
        return candidate

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


SERVER_STARTED = time.time()

if __name__ == "__main__":
    init_db()
    os.chdir(DIST)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
