"""Render the v2 walkthrough (ElevenLabs narration, voice Claire) from verified captures.

Inputs (not committed): out/demo/v2/*.png from scripts/film_capture.mjs, narration segments
out/demo/v2/audio/NN.mp3 and sound effects out/demo/v2/sfx/*.mp3, all generated with ElevenLabs
on Lebo's paid plan. No macOS `say`, no fallback voice: the script stops if any narration file is missing.
Needs ffmpeg with drawtext, zoompan and loudnorm. Output: out/demo/HOLDLINE-demo-Lebohang-Loliwe-v2.mp4
"""
import hashlib, json, re, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
V2 = ROOT / "out" / "demo" / "v2"
A, SFX, W = V2 / "audio", V2 / "sfx", V2 / "work"
W.mkdir(parents=True, exist_ok=True)
FF = shutil.which("ffmpeg"); assert FF, "ffmpeg required"
FONT = next(p for p in ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                        "/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if Path(p).exists())
MUSIC = "--music" in sys.argv  # variant with an ElevenLabs Music score ducked under the voice
GAP, FPS, END = 0.35, 30, 5.0
BED_DB = -21  # ambient bed sits far under the voice
VOICE = dict(name="Claire", id="gsm4lUH9bnZ3pjR1Pw7w", model="eleven_multilingual_v2")

# image, footer title, zoom start, zoom end, focus x, focus y (in the 1440x1000 capture)
SEG = [
    ("01-overview", "HOLDLINE | The morning after a power dip", 1.00, 1.10, 860, 260),
    ("02-measured-case", "01 / See why it held and the affected units", 1.00, 1.18, 820, 200),
    ("03-sms", "02 / SMS preview: do not release (simulated)", 1.05, 1.30, 740, 500),
    ("04-officer-gate", "03 / A duty officer can accept, not release", 1.00, 1.30, 1170, 420),
    ("05-two-signatures", "04 / Release: two different qualified signers", 1.00, 1.30, 1170, 500),
    ("06-audit", "05 / The audit records the decision and both signers", 1.00, 1.22, 1000, 560),
    ("07-offline-queued", "06 / Offline: the Accept waits on the phone", 1.00, 1.25, 1170, 380),
    ("08-offline-reload", "07 / Reload offline: case and decision kept", 1.12, 1.25, 1100, 200),
    ("09-synced", "08 / Reconnect: applied once, all 26 on hold", 1.00, 1.22, 1150, 420),
    ("10-metrics", "09 / Full synthetic year: fewer false holds, a stated tradeoff", 1.00, 1.30, 520, 330),
    ("01-overview", "HOLDLINE | Synthetic data. Needs clinical review.", 1.10, 1.00, 860, 260),
]
# (segment index from 1, offset seconds, effect, gain dB)
CUES = [(2, 0.25, "alert", -14), (4, 0.4, "click", -12), (5, 0.4, "click", -12), (6, 0.15, "confirm", -14),
        (7, 0.3, "offline", -14), (8, 0.3, "click", -12), (9, 0.3, "online", -14), (10, 0.3, "click", -14)]
ENDCARD = ["HOLDLINE", "Built by Lebo Loliwe (Lebohang Loliwe) using AI coding agents under his direction.",
           "Synthetic data: Terumo BCT Africa Hackathon 2026 starter kit.",
           ("Narration, sound effects and music: AI generated with ElevenLabs (voice: Claire)." if MUSIC else
            "Narration and sound effects: AI generated with ElevenLabs (voice: Claire)."),
           "Working prototype. Not a medical device. Not clinically validated."]

def run(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode: sys.exit("ffmpeg failed:\n" + r.stderr[-1500:])
    return r
def dur(p):
    out = run(FF, "-hide_banner", "-i", str(p), "-f", "null", "-").stderr
    h, m, s = re.findall(r"time=(\d+):(\d+):([\d.]+)", out)[-1]; return int(h) * 3600 + int(m) * 60 + float(s)
def esc(t): return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace("%", "\\%")

for i in range(1, 12): assert (A / f"{i:02d}.mp3").exists(), f"missing ElevenLabs narration {i:02d}; no fallback"
lens = [dur(A / f"{i:02d}.mp3") + GAP for i in range(1, 12)]
total = sum(lens) + END
assert total <= 180, f"{total:.1f}s: too long, report rather than speeding up"

clips = []
AUDIO_ONLY = '--audio-only' in sys.argv
if not AUDIO_ONLY:
    for i, ((img, title, z0, z1, fx, fy), L) in enumerate(zip(SEG, lens), 1):
        n = int(round(L * FPS)); o = W / f"v{i:02d}.mp4"; tf = W / f"t{i:02d}.txt"; tf.write_text(title)
        zoom = f"{z0}+({z1}-{z0})*(0.5-0.5*cos(PI*on/{n}))"  # eased zoom, no jumps
        x = f"max(0,min(iw-iw/zoom,{fx*2}-iw/zoom/2))"; y = f"max(0,min(ih-ih/zoom,{fy*2}-ih/zoom/2))"
        vf = (f"scale=2880:2000:flags=lanczos,zoompan=z='{zoom}':x='{x}':y='{y}':d={n}:s=1440x1000:fps={FPS},"
              f"pad=1440:1080:0:0:color=0x101117,drawtext=fontfile='{FONT}':textfile='{tf}':fontcolor=white:fontsize=26:x=28:y=1027,"
              f"fade=t=in:st=0:d=0.25,fade=t=out:st={L-0.25:.3f}:d=0.25,format=yuv420p")
        run(FF, "-hide_banner", "-y", "-loop", "1", "-i", str(V2 / f"{img}.png"), "-vf", vf, "-frames:v", str(n),
            "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", str(FPS), str(o)); clips.append(o)
        print(f"scene {i}/11 {L:.2f}s", flush=True)
    # end card
    lines = "".join(f",drawtext=fontfile='{FONT}':text='{esc(t)}':fontcolor={'white' if k==0 else '0xC9CCD6'}:fontsize={64 if k==0 else 28}:x=(w-tw)/2:y={360 if k==0 else 470+(k-1)*52}"
                    for k, t in enumerate(ENDCARD))
    o = W / "v12.mp4"
    run(FF, "-hide_banner", "-y", "-f", "lavfi", "-i", f"color=c=0x101117:s=1440x1080:r={FPS}:d={END}", "-vf",
        f"drawbox=x=620:y=450:w=200:h=4:color=0xE0574F:t=fill{lines},fade=t=in:st=0:d=0.4,format=yuv420p",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", str(o)); clips.append(o)
    (W / "concat.txt").write_text("".join(f"file '{c}'\n" for c in clips))
    run(FF, "-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", str(W / "concat.txt"), "-c", "copy", str(W / "video.mp4"))

# audio: voice + cues + very low ambient bed, then two-pass loudness to -16 LUFS / -1.5 dBTP
starts = [sum(lens[:k]) for k in range(11)]
inp, flt = [], []
for i in range(11):
    inp += ["-i", str(A / f"{i+1:02d}.mp3")]; t = int(starts[i] * 1000)
    flt.append(f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={t}|{t}[v{i}]")
k = 11
for seg, off, fx, g in CUES:
    inp += ["-i", str(SFX / f"{fx}.mp3")]; t = int((starts[seg-1] + off) * 1000)
    flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={g}dB,adelay={t}|{t}[c{k}]"); k += 1
vl = "".join(f"[v{i}]" for i in range(11))
if MUSIC:  # music.mp3 measures -18.4 LUFS; -16.6 dB puts it at about -35 before the final +6.5 dB normalisation. Score sits ~12 LU under the voice in gaps and ducks ~6 dB more under speech (sidechain on the voice)
    inp += ["-i", str(SFX / "music.mp3")]
    flt.append(f"{vl}amix=inputs=11:normalize=0:duration=longest,asplit=2[vox][key]")
    flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume=-16.6dB,apad,atrim=0:{total:.3f},afade=t=out:st={total-2.5:.3f}:d=2.5[mus0]")
    flt.append("[mus0][key]sidechaincompress=threshold=0.02:ratio=4:attack=80:release=700:makeup=1[bed]")
    labels = "[vox]" + "".join(f"[c{j}]" for j in range(11, k)) + "[bed]"; nin = 1 + len(CUES) + 1
else:
    inp += ["-stream_loop", "-1", "-i", str(SFX / "bed.mp3")]
    flt.append(f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,volume={BED_DB}dB,atrim=0:{total:.3f},afade=t=in:d=2,afade=t=out:st={total-3:.3f}:d=3[bed]")
    labels = vl + "".join(f"[c{j}]" for j in range(11, k)) + "[bed]"; nin = 11 + len(CUES) + 1
flt.append(f"{labels}amix=inputs={nin}:normalize=0:duration=longest,apad,atrim=0:{total:.3f}[out]")
run(FF, "-hide_banner", "-y", *inp, "-filter_complex", ";".join(flt), "-map", "[out]", "-c:a", "pcm_s24le", str(W / "mix.wav"))
m = json.loads(re.findall(r"\{[^{}]*\}", run(FF, "-hide_banner", "-i", str(W / "mix.wav"), "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-").stderr)[-1])
ln = (f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
      f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
run(FF, "-hide_banner", "-y", "-i", str(W / "mix.wav"), "-af", ln + ",aresample=48000", "-c:a", "aac", "-b:a", "256k", str(W / "audio.m4a"))
dest = ROOT / "out" / "demo" / ("HOLDLINE-demo-Lebohang-Loliwe-v2-music.mp4" if MUSIC else "HOLDLINE-demo-Lebohang-Loliwe-v2.mp4")
run(FF, "-hide_banner", "-y", "-i", str(W / "video.mp4"), "-i", str(W / "audio.m4a"), "-map", "0:v", "-map", "1:a",
    "-vf", "pad=1920:1080:240:0:color=0x101117", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", "-movflags", "+faststart", str(dest))
actual = dur(dest); assert actual <= 180, actual
sha = hashlib.sha256(dest.read_bytes()).hexdigest()
(V2 / ("video-manifest-music.json" if MUSIC else "video-manifest.json")).write_text(json.dumps(dict(file=dest.name, duration_seconds=round(actual, 3), sha256=sha,
    voice=VOICE, sound_effects="ElevenLabs sound generation", scenes=[dict(n=i+1, image=s[0], title=s[1], start=round(starts[i], 2),
    seconds=round(lens[i], 2)) for i, s in enumerate(SEG)]), indent=2) + "\n")
print(json.dumps(dict(video=str(dest), duration=actual, sha256=sha)))
