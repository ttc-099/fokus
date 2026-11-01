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
ENV_FILE = "/opt/data/.env"

GROQ_KEY = ""
try:
    with open(ENV_FILE) as f:
        for line in f:
            m = re.match(r"^GROQ_API_KEY=(.+)$", line.strip())
            if m:
                GROQ_KEY = m.group(1).strip()
                break
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
            created_at REAL NOT NULL)""")
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
            "SELECT u.id, u.username, u.created_at FROM sessions s "
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


def groq_chat(messages, max_tokens=1400):
    # no response_format: groq's json_object validation chokes on gpt-oss
    # reasoning output intermittently, so we parse the text defensively
    r = http_json(GROQ_URL,
                  payload={"model": MODEL,
                           "messages": messages,
                           "temperature": 0.7,
                           "max_tokens": max_tokens},
                  headers={"Authorization": "Bearer " + GROQ_KEY},
                  timeout=45)
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


# ---- ai generation (same prompts as the demo phase)
def generate_modules(topic):
    sources = wiki_research(topic)
    base_prompt = (
        'Create a JSON object {"modules": array of exactly 8 items}. '
        'Each item: {"title": a stage name of max 6 words, '
        '"content": 2 sentences, what to learn at this stage and why it matters}. '
        f'Topic: "{topic}". '
        'Sequence from complete beginner to advanced, titles specific to this topic. '
        f'Wikipedia research to ground it: {research_block(sources)}')
    msgs = [{"role": "system",
             "content": "You design beginner-to-advanced learning roadmaps. Output strict JSON only, no prose."},
            {"role": "user", "content": base_prompt}]
    data = groq_chat(msgs, max_tokens=4000)
    mods = data.get("modules", [])
    # retry once if the model stopped short (reasoning models sometimes truncate)
    if not isinstance(mods, list) or len(mods) < 8:
        msgs.append({"role": "user",
                     "content": f"Return the full roadmap: exactly 8 modules. Your previous answer had {len(mods) if isinstance(mods, list) else 0}."})
        data = groq_chat(msgs, max_tokens=4000)
        mods = data.get("modules", [])
    modules = [{"title": str(m.get("title", ""))[:60],
                "content": str(m.get("content", ""))[:400],
                "fullContent": None, "done": False}
               for m in mods if isinstance(m, dict)]
    return modules, [{"title": s["title"], "url": s["url"]} for s in sources]


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
             'Weave in the key concepts, one concrete practice exercise, and one common beginner mistake '
             'inside the paragraphs. Strictly no bullet points, no numbered lists, no headings, no markdown. '
             f'Wikipedia research: {research_block(sources)}'},
    ], max_tokens=2500)
    return {
        "v": 2,
        "content": str(data.get("content", "")).strip(),
        "sources": [{"title": s["title"], "url": s["url"]} for s in sources],
    }


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


def roadmap_json(row):
    return {"id": row["id"], "topic": row["topic"],
            "createdAt": row["created_at"],
            "modules": json.loads(row["modules"])}


def roadmap_summary(row):
    modules = json.loads(row["modules"])
    return {"id": row["id"], "topic": row["topic"],
            "createdAt": row["created_at"],
            "total": len(modules),
            "done": sum(1 for m in modules if m.get("done"))}


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
            return self.handle_create(user, body)
        m = re.fullmatch(r"/api/roadmaps/(\d+)/(toggle|detail|resources)", path)
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
                                    "createdAt": user["created_at"]})
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
            return self._json(200, roadmap_json(row))
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
                cur = c.execute("INSERT INTO users VALUES (NULL,?,?,?)",
                                (username, hash_password(password), time.time()))
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
            return self._json(422, {"error": "that doesn't look like a real topic",
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
            return self._json(422, {"error": "that's a real word, but not much to learn there",
                                    "suggestions": judge_sugg})
        try:
            modules, _sources = generate_modules(topic)
        except Exception:
            return self._json(502, {"error": "ai generation failed, try again"})
        if len(modules) < 4:
            return self._json(502, {"error": "ai returned too few modules, try again"})
        with db() as c:
            cur = c.execute("INSERT INTO roadmaps VALUES (NULL,?,?,?,?)",
                            (user["id"], topic, json.dumps(modules), time.time()))
            row = load_owned(c, user["id"], cur.lastrowid)
        return self._json(200, roadmap_json(row))

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
                # flip the done flag, save, return the whole roadmap
                modules[index]["done"] = not modules[index].get("done")
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


if __name__ == "__main__":
    init_db()
    os.chdir(DIST)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
