"""Build a <=3-minute narrated walkthrough from verified browser captures.

Requires local macOS say, ffmpeg and ffprobe. No remote generation or paid service.
Run browser_demo.mjs first; it performs real synthetic-data decisions and saves evidence.
The film uses still captures of those interactions, not a fabricated application mockup.
"""
import json
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out" / "demo"
VIDEO = OUT / "video"
VIDEO.mkdir(exist_ok=True)
FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")
assert FFMPEG and FFPROBE, "ffmpeg and ffprobe are required"
evidence = json.loads((OUT / "browser-evidence.json").read_text())
case = evidence["caseBefore"]
assert case["case"]["id"] == "HL-HSP-007-2026102223-EXC", "Update narration for a different captured case"
assert len(case["units"]) == 2 and case["case"]["peak"] == 7.8

segments = [
    ("01-overview", "HOLDLINE | A hold queue with human control",
     "Holdline is Lebohang Loliwe's individual hackathon entry. In the synthetic starter year, seven thousand one hundred and twelve units were labelled exposed, and two thousand one hundred and nineteen were transfused. This prototype helps a duty officer review cold chain holds. It does not claim to prevent harm."),
    ("02-measured-case", "01 / See the reason and affected units",
     "Here is the running application at Kajiado County Referral Hospital. Three consecutive hourly readings exceed six degrees, peaking at seven point eight. The case links two synthetic units to that fridge. Measured events are distinguished from presumed logger gaps."),
    ("04-sms", "02 / A short fallback alert",
     "The fallback message is one hundred and thirty seven characters. It identifies the hold and affected units. This is an SMS preview only. Nothing is sent."),
    ("05-officer-gate", "03 / Officer can confirm a hold, not release",
     "Signed in as a duty officer, release controls are disabled. Accept always keeps all units quarantined, even if a release checkbox was selected. The server enforces this boundary."),
    ("06-two-signatures", "04 / Manager + reason + second qualified signer",
     "For this simulated review, a manager selects one unit, gives a reason, and supplies a different qualified signer's PIN. This changes only this case. The warning shows other holds remain; it is not permission to issue the unit."),
    ("08-audit", "05 / The recorded decision survives restart",
     "Change records one unit released within this case and one quarantined. The audit names the manager and second signer. Its hash chain is intact. Decisions and retry identifiers now persist across a server restart; users sign in again."),
    ("09-offline-queued", "06 / Offline Accept is saved on the device",
     "Now connectivity is disabled. The officer confirms a different hold. The interface shows one decision waiting to sync. Release cannot be queued offline."),
    ("10-offline-reload", "07 / Reload offline, retain the queue",
     "Reloading while offline preserves the cached case and the pending decision. The browser test verifies both before reconnecting."),
    ("11-synced", "08 / Reconnect: one decision, all units quarantined",
     "On reconnect, the queued Accept applies exactly once. All twenty six units remain quarantined. A retry does not create a second decision."),
    ("12-metrics", "09 / Fewer false holds, with an explicit tradeoff",
     "Across the full synthetic year, precision improves from twenty four point one to sixty six point one percent. False holds fall by eighteen thousand two hundred and fifty four. But one hundred and six more exposed units are missed, and fifty four fewer are held before their transfusion day. That tradeoff requires review, not a claim of clinical benefit."),
    ("01-overview", "HOLDLINE | Synthetic prototype, ready for review",
     "Sixty six automated tests pass. The next step is a supervised workflow review and better stock timing. Synthetic data, demo authentication, no live logger feed. Built by Lebohang Loliwe using AI coding agents under his direction. Tool disclosure is in the repository README. This walkthrough uses a synthetic voice."),
]

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

def duration(p):
    return float(run(FFPROBE,"-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",str(p)))

manifest=[]
for i,(image,title,words) in enumerate(segments,1):
    stem=VIDEO/f"{i:02d}"
    changed = not stem.with_suffix('.txt').exists() or stem.with_suffix('.txt').read_text() != words+'\n'
    stem.with_suffix('.txt').write_text(words+'\n')
    if changed or not stem.with_suffix('.aiff').exists() or '--reuse' not in sys.argv:
        run('/usr/bin/say','-v','Tessa','-r','170','-f',str(stem.with_suffix('.txt')),'-o',str(stem.with_suffix('.aiff')))
    manifest.append(dict(number=i,image=image,title=title,narration=words,seconds=duration(stem.with_suffix('.aiff'))+0.65,changed=changed))

total=sum(s['seconds'] for s in manifest)
assert total <= 179, f"Narration too long: {total:.1f}s; shorten script before export"
font=ROOT/'holdline/static/fonts/IBMPlexSans-SemiBold.woff2'
# Use the native installed system font for ffmpeg's title strip.
font=Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
for s in manifest:
    stem=VIDEO/f"{s['number']:02d}"
    if '--reuse' in sys.argv and not s['changed'] and stem.with_suffix('.mp4').exists():
        continue
    stem.with_suffix('.title').write_text(s['title'])
    # Keep every screenshot pixel; the 80px footer is outside the application capture.
    vf=(f"pad=1440:1080:0:0:color=0x101117,drawtext=fontfile='{font}':"
        f"textfile='{stem.with_suffix('.title')}':fontcolor=white:fontsize=26:x=28:y=1025")
    run(FFMPEG,'-hide_banner','-loglevel','error','-y','-loop','1','-framerate','24','-i',str(OUT/(s['image']+'.png')),
        '-i',str(stem.with_suffix('.aiff')),'-vf',vf,'-af','apad','-t',f"{s['seconds']:.3f}",
        '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k',str(stem.with_suffix('.mp4')))
    print(f"Rendered scene {s['number']} / {len(manifest)}",flush=True)

concat=VIDEO/'concat.txt'
concat.write_text(''.join(f"file '{VIDEO / (str(s['number']).zfill(2)+'.mp4')}'\n" for s in manifest))
dest=OUT/'HOLDLINE-demo.mp4'
if dest.exists():
    backup=OUT/'HOLDLINE-demo-before-credit-update.mp4'
    if not backup.exists(): shutil.copy2(dest,backup)
run(FFMPEG,'-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(dest))
actual=duration(dest)
assert actual<=180,actual
(OUT/'video-manifest.json').write_text(json.dumps(dict(duration_seconds=actual,voice='macOS Tessa (synthetic)',
    method='Narrated still captures of actual browser interactions',scenes=manifest),indent=2)+'\n')
print(json.dumps(dict(video=str(dest),duration_seconds=actual,bytes=dest.stat().st_size)),flush=True)
