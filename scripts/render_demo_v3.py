"""v3 walkthrough: element-level push-ins and an animated cursor over 2x captures.

Inputs (not committed): captures + boxes.json from `DPR=2 scripts/film_capture.mjs` (HOLDLINE_DEMO_OUT=CAP),
ElevenLabs narration/SFX/music in out/demo/v2/{audio,sfx}. Camera and cursor move on eased paths between
the real bounding boxes of the elements the narration talks about. Same narration timing as v2.
Usage: python3 scripts/render_demo_v3.py CAPTURE_DIR
"""
import hashlib, json, math, re, shutil, subprocess, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
CAP = Path(sys.argv[1])
V2 = ROOT / "out" / "demo" / "v2"; A, SFX = V2 / "audio", V2 / "sfx"
W = ROOT / "out" / "demo" / "v3"; W.mkdir(parents=True, exist_ok=True)
FF = shutil.which("ffmpeg")
FONT = next(p for p in ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if Path(p).exists())
OW, OH, FPS, GAP, END, DPR = 1920, 1080, 30, 0.35, 5.0, 2
BOX = json.loads((CAP / "boxes.json").read_text())
PW, PH = 1440, 1000  # capture viewport in CSS px

def run(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: sys.exit("ffmpeg failed:\n" + r.stderr[-1500:])
    return r
def dur(p):
    h, m, s = re.findall(r"time=(\d+):(\d+):([\d.]+)", run(FF, "-hide_banner", "-i", str(p), "-f", "null", "-").stderr)[-1]
    return int(h) * 3600 + int(m) * 60 + float(s)

def b(shot, key, pad=24):
    x, y, w, h = BOX[shot][key]; return (x - pad, y - pad, w + 2 * pad, h + 2 * pad)
def union(*bs):
    x0 = min(q[0] for q in bs); y0 = min(q[1] for q in bs); x1 = max(q[0] + q[2] for q in bs); y1 = max(q[1] + q[3] for q in bs)
    return (x0, y0, x1 - x0, y1 - y0)
WIDE = "wide"
def cam_rect(box, minw=560):
    """16:9 camera rectangle (CSS px) that contains box, clamped to the page."""
    if box == WIDE: w = PW; cx, cy = PW / 2, PH / 2
    else:
        x, y, bw, bh = box; w = max(minw, bw, bh * 16 / 9) * 1.0; cx, cy = x + bw / 2, y + bh / 2
    w = min(w, PW); h = w * 9 / 16
    if h > PH: h = PH; w = h * 16 / 9
    cx = min(max(cx, w / 2), PW - w / 2); cy = min(max(cy, h / 2), PH - h / 2)
    return (cx, cy, w)
def c(shot, key, dx=0.5, dy=0.5):
    x, y, w, h = BOX[shot][key]; return (x + w * dx, y + h * dy)

def row(i):  # label + baseline + HOLDLINE columns of one evaluation row, large enough to read on a phone
    x, y, w, h = BOX['10-metrics'][f'r{i}']; return (x, y - 14, 600, h + 28)
def num(i):
    x, y, w, h = BOX['10-metrics'][f'r{i}']; return (x + 330, y + h * 0.6)

# Per scene: footer title, camera keyframes (fraction of scene, box), cursor (fraction, point|None, click?)
S = [
 ("01-overview", "The morning after a power dip",
  [(0, WIDE), (0.12, b("01-overview", "head", 30)), (0.38, b("01-overview", "grid", 20)), (0.58, (0, 48, 620, 30)), (0.86, WIDE)],
  [(0.40, None), (0.44, c("01-overview", "grid", 0.72, 0.27)), (0.52, c("01-overview", "grid", 0.94, 0.47))]),
 ("02-measured-case", "01  See why it held",
  [(0, WIDE), (0.06, union(b("02-measured-case", "title", 16), b("02-measured-case", "peak", 16))), (0.36, b("02-measured-case", "explain", 20)),
   (0.72, b("02-measured-case", "facts", 16))],
  [(0.34, None), (0.40, c("02-measured-case", "explain", 0.12, 0.3)), (0.62, c("02-measured-case", "explain", 0.75, 0.8)), (0.80, c("02-measured-case", "facts", 0.06, 0.6))]),
 ("03-sms", "02  SMS preview: do not release",
  [(0, b("03-sms", "sms", 120)), (0.12, b("03-sms", "sms", 24))],
  [(0.2, None), (0.3, c("03-sms", "sms", 0.62, 0.62))]),
 ("04-officer-gate", "03  A duty officer can accept, not release",
  [(0, b("04-officer-gate", "roles", 160)), (0.18, b("04-officer-gate", "accept", 60)), (0.5, b("04-officer-gate", "roles", 30)), (0.82, b("04-officer-gate", "accept", 60))],
  [(0.1, None), (0.22, c("04-officer-gate", "accept")), (0.52, c("04-officer-gate", "roles", 0.3, 0.58)), (0.84, c("04-officer-gate", "accept", 0.6, 0.5))]),
 ("05-two-signatures", "04  Release: two different qualified signers",
  [(0, b("05-two-signatures", "decide", 30)), (0.28, b("05-two-signatures", "tick", 30)), (0.5, b("05-two-signatures", "decide", 20)), (0.8, b("05-two-signatures", "slide", 70))],
  [(0.25, None), (0.32, (BOX["05-two-signatures"]["tick"][0] + 24, BOX["05-two-signatures"]["tick"][1] + 30), "click"),
   (0.55, c("05-two-signatures", "confirm", 0.5, 4.0)), (0.80, c("05-two-signatures", "slide", 0.1, 0.5)), (0.92, c("05-two-signatures", "slide", 0.92, 0.5), "click")]),
 ("06-audit", "05  The audit records the decision and both signers",
  [(0, b("06-audit", "audit", 30)), (0.45, b("06-audit", "last", 20))],
  [(0.4, None), (0.5, c("06-audit", "last", 0.3, 0.3))]),
 ("07-offline-queued", "06  Offline: the Accept waits on the phone",
  [(0, union(b("07-offline-queued", "net", 20), b("07-offline-queued", "sync", 20))), (0.42, b("07-offline-queued", "accept", 60)), (0.72, b("07-offline-queued", "qnote", 40))],
  [(0.3, None), (0.44, c("07-offline-queued", "accept")), (0.52, c("07-offline-queued", "accept", 0.52, 0.55), "click"), (0.76, c("07-offline-queued", "qnote", 0.8, 0.8))]),
 ("08-offline-reload", "07  Reload offline: case and decision kept",
  [(0, b("08-offline-reload", "net", 60)), (0.45, b("08-offline-reload", "qnote", 50))],
  []),
 ("09-synced", "08  Reconnect: applied once, all 26 on hold",
  [(0, b("09-synced", "net", 80)), (0.3, b("09-synced", "decide", 30))],
  [(0.35, None), (0.5, c("09-synced", "decide", 0.4, 0.75))]),
 ("10-metrics", "09  Full synthetic year: the tradeoff",
  [(0, b("10-metrics", "table", 30)), (0.1, row(1)), (0.3, row(3)), (0.52, row(2)), (0.84, b("10-metrics", "table", 30))],
  [(0.08, None), (0.12, num(1)), (0.3, num(3)), (0.52, num(2)), (0.8, None)]),
 ("01-overview", "Synthetic data. Needs clinical review.",
  [(0, b("01-overview", "head", 30)), (0.35, WIDE)],
  []),
]
CLICK_SFX_AT = []  # absolute seconds, filled during render

def ease(t): return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2
def cam_at(keys, f, L):
    T = 1.1 / L  # transition length as a fraction of the scene
    rects = [(k, cam_rect(bx)) for k, bx in keys]
    cur = rects[0][1]
    for i in range(1, len(rects)):
        k, r = rects[i]
        if f < k: break
        p = min(1, (f - k) / T); e = ease(p); prev = cur
        # zoom in log-space so the push feels even
        w = math.exp(math.log(prev[2]) + (math.log(r[2]) - math.log(prev[2])) * e)
        cur = (prev[0] + (r[0] - prev[0]) * e, prev[1] + (r[1] - prev[1]) * e, w)
    return cur

def cursor_img(scale=1.0):
    s = 4; pts = [(0, 0), (0, 17), (4.2, 13.2), (7, 19.6), (9.6, 18.5), (6.9, 12.3), (12.4, 12.3)]
    im = Image.new("RGBA", (int(16 * s), int(24 * s)), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    P = [(1.5 * s + x * s, 1.5 * s + y * s) for x, y in pts]
    sh = Image.new("RGBA", im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).polygon([(x + s * 0.8, y + s * 1.2) for x, y in P], fill=(0, 0, 0, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(s * 1.2)); im = Image.alpha_composite(im, sh); d = ImageDraw.Draw(im)
    d.polygon(P, fill=(0, 0, 0, 255)); inner = [(1.5 * s + x * s * 0.86 + s * 0.9, 1.5 * s + y * s * 0.86 + s * 1.9) for x, y in pts]
    d.polygon(P, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=int(s * 1.1))
    return im.resize((int(16 * 1.9 * scale), int(24 * 1.9 * scale)), Image.LANCZOS)
CUR = cursor_img()

def cursor_at(path, f, L):
    """Returns (point or None, alpha, click_progress or None)."""
    if not path: return None, 0, None
    MV = 0.75 / L
    pos = None; alpha = 0; clickp = None
    pts = [(k, p, (len(e) > 0 and e[0] == "click")) for k, p, *e in path]
    for i, (k, p, clk) in enumerate(pts):
        if f < k: break
        if p is None: pos = pos; alpha = 0; continue
        prevp = next((q for kk, q, _ in reversed(pts[:i]) if q is not None), None)
        t = min(1, (f - k) / MV); e = ease(t)
        if prevp is None or alpha == 0 and pos is None:
            pos = p; alpha = min(1, t * 2)
        else:
            (x0, y0), (x1, y1) = (pos if pos else prevp), p
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2 - abs(x1 - x0) * 0.12  # gentle arc
            u = e; pos = ((1 - u) ** 2 * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) ** 2 * y0 + 2 * (1 - u) * u * my + u * u * y1)
            if t < 1: pass
            alpha = 1
        if clk and f >= k + MV: clickp = (f - k - MV) * L / 0.45
    if clickp is not None and clickp > 1: clickp = None
    return pos, alpha, clickp

# timing from the ElevenLabs narration
for i in range(1, 12): assert (A / f"{i:02d}.mp3").exists(), "missing narration; no fallback"
lens = [dur(A / f"{i:02d}.mp3") + GAP for i in range(1, 12)]
starts = [sum(lens[:k]) for k in range(11)]
total = sum(lens) + END; assert total <= 180

font_t = ImageFont.truetype(FONT, 30); font_e1 = ImageFont.truetype(FONT, 76); font_e2 = ImageFont.truetype(FONT, 32)
ENDCARD = ["Built by Lebo Loliwe (Lebohang Loliwe) using AI coding agents under his direction.",
           "Synthetic data: Terumo BCT Africa Hackathon 2026 starter kit.",
           "Narration, sound effects and music: AI generated with ElevenLabs (voice: Claire).",
           "Working prototype. Not a medical device. Not clinically validated."]
BG = (16, 17, 23)

def title_layer(text):
    im = Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    tw = d.textlength(text, font=font_t); x, y, ph = 56, OH - 112, 58
    d.rounded_rectangle((x, y, x + tw + 52, y + ph), radius=14, fill=(16, 17, 23, 215))
    d.rectangle((x, y + 14, x + 5, y + ph - 14), fill=(224, 87, 79, 255))
    d.text((x + 28, y + 12), text, font=font_t, fill=(255, 255, 255, 255)); return im

proc = subprocess.Popen([FF, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{OW}x{OH}",
    "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", str(W / "video.mp4")], stdin=subprocess.PIPE)
for si, ((img, title, keys, path), L) in enumerate(zip(S, lens)):
    src = Image.open(CAP / f"{img}.png").convert("RGB"); tl = title_layer(title)
    n = int(round(L * FPS))
    for fi in range(n):
        f = fi / n; cx, cy, cw = cam_at(keys, f, L); ch = cw * 9 / 16
        box = tuple(int(round(v * DPR)) for v in (cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2))
        fr = src.resize((OW, OH), Image.LANCZOS, box=box).convert("RGBA")
        pos, alpha, clickp = cursor_at(path, f, L)
        if pos and alpha > 0:
            sx = (pos[0] - (cx - cw / 2)) / cw * OW; sy = (pos[1] - (cy - ch / 2)) / ch * OH
            if clickp is not None:
                r = 10 + 34 * clickp; a = int(150 * (1 - clickp))
                ov = Image.new("RGBA", (OW, OH), (0, 0, 0, 0)); ImageDraw.Draw(ov).ellipse((sx - r, sy - r, sx + r, sy + r), outline=(255, 255, 255, a), width=4)
                fr = Image.alpha_composite(fr, ov)
            cu = CUR if alpha >= 1 else Image.blend(Image.new("RGBA", CUR.size, (0, 0, 0, 0)), CUR, alpha)
            fr.alpha_composite(cu, (int(sx - 3), int(sy - 3)))
        fr = Image.alpha_composite(fr, tl)
        # fades at scene boundaries
        a = min(1, fi / (0.25 * FPS), (n - 1 - fi) / (0.25 * FPS))
        out = fr.convert("RGB")
        if a < 1: out = Image.blend(Image.new("RGB", (OW, OH), BG), out, max(0, a))
        proc.stdin.write(out.tobytes())
    # click times for SFX
    MV = 0.75 / L
    for k, p, *e in path:
        if e and e[0] == "click": CLICK_SFX_AT.append(starts[si] + (k + MV) * L)
    print(f"scene {si+1}/11", flush=True)
# end card
ec = Image.new("RGB", (OW, OH), BG); d = ImageDraw.Draw(ec)
tw = d.textlength("HOLDLINE", font=font_e1); d.text(((OW - tw) / 2, 330), "HOLDLINE", font=font_e1, fill=(255, 255, 255))
d.rectangle((OW / 2 - 110, 440, OW / 2 + 110, 445), fill=(224, 87, 79))
for k, t in enumerate(ENDCARD):
    tw = d.textlength(t, font=font_e2); d.text(((OW - tw) / 2, 490 + k * 56), t, font=font_e2, fill=(201, 204, 214))
ne = int(END * FPS)
for fi in range(ne):
    a = min(1, fi / (0.4 * FPS)); proc.stdin.write(Image.blend(Image.new("RGB", (OW, OH), BG), ec, a).tobytes())
proc.stdin.close(); assert proc.wait() == 0

# audio: v2-music mix, with click sounds placed on the cursor clicks
CUES = [(starts[1] + 0.25, "alert", -14), (starts[5] + 0.15, "confirm", -14), (starts[6] + 0.3, "offline", -14), (starts[8] + 0.3, "online", -14)]
CUES += [(t, "click", -10) for t in CLICK_SFX_AT]
inp, flt = [], []
for i in range(11):
    inp += ["-i", str(A / f"{i+1:02d}.mp3")]; t = int(starts[i] * 1000)
    flt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={t}|{t}[v{i}]")
k = 11
for t0, fx, g in CUES:
    inp += ["-i", str(SFX / f"{fx}.mp3")]; t = int(t0 * 1000)
    flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g}dB,adelay={t}|{t}[c{k}]"); k += 1
inp += ["-i", str(SFX / "music.mp3")]
flt.append("".join(f"[v{i}]" for i in range(11)) + "amix=inputs=11:normalize=0:duration=longest,asplit=2[vox][key]")
flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=-16.6dB,apad,atrim=0:{total:.3f},afade=t=out:st={total-2.5:.3f}:d=2.5[mus0]")
flt.append("[mus0][key]sidechaincompress=threshold=0.02:ratio=4:attack=80:release=700:makeup=1[bed]")
flt.append("[vox]" + "".join(f"[c{j}]" for j in range(11, k)) + f"[bed]amix=inputs={len(CUES)+2}:normalize=0:duration=longest,apad,atrim=0:{total:.3f}[out]")
run(FF, "-hide_banner", "-y", *inp, "-filter_complex", ";".join(flt), "-map", "[out]", "-c:a", "pcm_s24le", str(W / "mix.wav"))
m = json.loads(re.findall(r"\{[^{}]*\}", run(FF, "-hide_banner", "-i", str(W / "mix.wav"), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-").stderr)[-1])
ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
run(FF, "-hide_banner", "-y", "-i", str(W / "mix.wav"), "-af", ln + ",aresample=48000", "-c:a", "aac", "-b:a", "256k", str(W / "audio.m4a"))
dest = ROOT / "out" / "demo" / "HOLDLINE-demo-Lebohang-Loliwe-v3.mp4"
run(FF, "-hide_banner", "-y", "-i", str(W / "video.mp4"), "-i", str(W / "audio.m4a"), "-map", "0:v", "-map", "1:a", "-c", "copy", "-shortest", "-movflags", "+faststart", str(dest))
actual = dur(dest); assert actual <= 180
print(json.dumps(dict(video=str(dest), duration=actual, sha256=hashlib.sha256(dest.read_bytes()).hexdigest(), clicks=[round(t, 2) for t in CLICK_SFX_AT])))
