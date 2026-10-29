"""Refresh the offline inventory and content-based release fingerprint."""
from pathlib import Path
import argparse, hashlib, json, re

parser = argparse.ArgumentParser()
parser.add_argument('--preserve-media-checksums', action='store_true',
                    help='For a partial maintenance checkout, use previously verified MP3 checksums')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
site = root/'docs'
previous = {}
if args.preserve_media_checksums:
    for line in (root/'SHA256SUMS.txt').read_text().splitlines():
        if not line.strip(): continue
        checksum, name = line.split('  ',1)
        previous[name] = checksum
assets = sorted('./'+p.relative_to(site).as_posix() for directory in ['assets','audio']
                for p in (site/directory).iterdir() if p.is_file())
(site/'offline-assets.json').write_text(json.dumps(assets,indent=2)+'\n')
digests = {}
for file in sorted(site.rglob('*')):
    if not file.is_file(): continue
    relative = file.relative_to(site).as_posix()
    if args.preserve_media_checksums and file.suffix == '.mp3':
        digests[relative] = previous['docs/'+relative]
    else:
        body = file.read_bytes()
        if file.name == 'sw.js':
            body = re.sub(rb"const RELEASE = '[^']+';", b"const RELEASE = '__RELEASE__';", body)
        digests[relative] = hashlib.sha256(body).hexdigest()
fingerprint = hashlib.sha256(json.dumps(digests,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:16]
worker = site/'sw.js'
text, count = re.subn(r"const RELEASE = '[^']+';", "const RELEASE = 'v17-"+fingerprint+"';", worker.read_text())
if count != 1: raise SystemExit('Release marker missing or duplicated')
worker.write_text(text)
print('Offline release:', 'v17-'+fingerprint)

