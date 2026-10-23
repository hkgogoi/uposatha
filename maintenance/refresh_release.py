"""Refresh the offline inventory and release fingerprint after editing docs/."""
from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parents[1]
site = root/'docs'
assets = sorted('./'+p.relative_to(site).as_posix() for directory in ['assets', 'audio']
                for p in (site/directory).iterdir() if p.is_file())
(site/'offline-assets.json').write_text(json.dumps(assets, indent=2)+'\n')
digest = hashlib.sha256()
for file in sorted(site.rglob('*')):
    if file.is_file():
        content = file.read_bytes()
        if file.name == 'sw.js':
            content = re.sub(rb"const RELEASE = '[^']+';", b"const RELEASE = '__RELEASE__';", content)
        digest.update(file.relative_to(site).as_posix().encode())
        digest.update(b'\0')
        digest.update(content)
        digest.update(b'\0')
worker = site/'sw.js'
text, count = re.subn(r"const RELEASE = '[^']+';", "const RELEASE = 'v16-"+digest.hexdigest()[:16]+"';", worker.read_text())
if count != 1:
    raise SystemExit('Release marker missing or duplicated')
worker.write_text(text)
print('Offline release:', 'v16-'+digest.hexdigest()[:16])
