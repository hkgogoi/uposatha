#!/usr/bin/env python3
"""Install an offline Uposatha release without changing Caddy or any services.

Run from the downloaded update package, which contains payload/ and checksums.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tarfile
import tempfile
import time
import urllib.request
import re

HERE = Path(__file__).resolve().parent
DEFAULT_TARGET = Path('/srv/uposatha-download')

def verify(payload, manifest):
    expected = json.loads(manifest.read_text())
    if not isinstance(expected, dict) or not expected:
        raise ValueError('Empty or invalid payload manifest')
    actual = {p.relative_to(payload).as_posix() for p in payload.rglob('*') if p.is_file()}
    if actual != set(expected):
        raise ValueError('Payload file list does not match its manifest')
    for relative, digest in expected.items():
        p = payload / relative
        if Path(relative).is_absolute() or '..' in Path(relative).parts or p.is_symlink():
            raise ValueError('Unsafe payload path: ' + relative)
        if hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            raise ValueError('Checksum failed: ' + relative)
    html = (payload/'index.html').read_text()
    for name in ['assets/readings-v17.css','assets/readings-v17.js','assets/readings-v17.json']:
        if name not in expected:
            raise ValueError('Missing reading asset: ' + name)
    if 'readings-v17.css' not in html:
        raise ValueError('Missing reader stylesheet in app shell')
    data = json.loads((payload/'assets/readings-v17.json').read_text())
    dhp = next(b for b in data['books'] if b['id'] == 'dhammapada')
    if len(data['books']) != 6 or sum(len(c['paragraphs']) for c in dhp['sections']) != 423:
        raise ValueError('Reading collection is incomplete')
    return expected

def check_target(target):
    if target.is_symlink() or not target.is_dir():
        raise ValueError('Target must be an existing real Uposatha directory: ' + str(target))
    if not (target/'index.html').is_file() or 'uposatha' not in (target/'index.html').read_text().lower():
        raise ValueError('The target does not look like an existing Uposatha installation')
    if not (target/'sw.js').is_file() or not (target/'assets').is_dir():
        raise ValueError('Expected an Uposatha app root with sw.js and assets/')
    # Never follow symlinks during a privileged copy.
    for entry in target.rglob('*'):
        if entry.is_symlink():
            raise ValueError('Unexpected symlink in app directory: ' + str(entry))

def atomic_copy(source, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='.uposatha-', dir=destination.parent)
    try:
        with os.fdopen(handle, 'wb') as stream:
            stream.write(source.read_bytes()); stream.flush(); os.fsync(stream.fileno())
        os.chmod(name, 0o644)
        os.replace(name, destination)
    finally:
        if os.path.exists(name): os.unlink(name)

def restore(target, backup):
    marker = backup/'uposatha-backup.json'
    info = json.loads(marker.read_text())
    if info.get('target') != str(target) or not (backup/'site/index.html').is_file():
        raise ValueError('Backup does not belong to this Uposatha target')
    original = backup/'site'
    for file in original.rglob('*'):
        if file.is_symlink(): raise ValueError('Backup contains a symlink')
    # Keep new immutable assets available to open tabs; restore the previous shell last.
    files = [p for p in original.rglob('*') if p.is_file()]
    order = lambda p: (p.name == 'sw.js', p.name == 'index.html', str(p))
    for file in sorted(files, key=order):
        atomic_copy(file, target/file.relative_to(original))

def apply(target, payload, expected, backup_root, required):
    check_target(target)
    # Packages may omit unchanged large media; verify the live recordings before cutover.
    for relative, digest in required.items():
        file = target/relative
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
            raise ValueError('Existing recording differs or is missing: ' + relative + '. No files changed.')
    stamp = time.strftime('%Y%m%d-%H%M%S') + '-' + str(os.getpid())
    backup = backup_root/('uposatha-backup-' + stamp)
    backup.mkdir(mode=0o700, parents=True)
    shutil.copytree(target, backup/'site', symlinks=False)
    (backup/'uposatha-backup.json').write_text(json.dumps({'target':str(target),'version':'17','created':stamp},indent=2)+'\n')
    print('Backup:', backup, flush=True)
    try:
        # Publish worker last so it sees the complete shell and asset inventory.
        ordered = sorted(expected, key=lambda name: (name=='sw.js', name=='index.html', name))
        for relative in ordered:
            atomic_copy(payload/relative, target/relative)
        for relative, digest in expected.items():
            if hashlib.sha256((target/relative).read_bytes()).hexdigest() != digest:
                raise ValueError('Post-install check failed: ' + relative)
        print('Installed Uposatha Version 17 with all six readings.')
        print('No services restarted and no Caddy configuration changed.')
        print('Rollback: sudo python3 ' + str(Path(__file__).resolve()) + ' --rollback ' + str(backup))
    except BaseException:
        restore(target, backup)
        print('Previous Uposatha files restored after installation failure.', flush=True)
        raise
    return backup

def fetch_release(commit, destination):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Use the full 40-character GitHub release commit')
    archive = destination/'release.tar.gz'
    url = 'https://codeload.github.com/hkgogoi/uposatha/tar.gz/' + commit
    print('Downloading the pinned Uposatha release from GitHub…', flush=True)
    request = urllib.request.Request(url, headers={'User-Agent':'Uposatha-Installer/17'})
    with urllib.request.urlopen(request, timeout=90) as response, archive.open('wb') as stream:
        size = 0
        while True:
            chunk = response.read(1024*1024)
            if not chunk: break
            size += len(chunk)
            if size > 160*1024*1024: raise ValueError('Release download exceeds size limit')
            stream.write(chunk)
    payload = destination/'payload'
    payload.mkdir()
    checksums = None
    with tarfile.open(archive,'r:gz') as release:
        entries = release.getmembers()
        if len(entries) > 2000: raise ValueError('Too many archive entries')
        total = 0
        for entry in entries:
            parts = Path(entry.name).parts
            if not parts or '..' in parts or Path(entry.name).is_absolute():
                raise ValueError('Unsafe release archive path')
            if len(parts) == 2 and parts[1] == 'SHA256SUMS.txt' and entry.isfile():
                checksums = release.extractfile(entry).read().decode('utf-8')
            if len(parts) < 3 or parts[1] != 'docs': continue
            if entry.isdir(): continue
            if not entry.isfile(): raise ValueError('Unsupported entry in app payload')
            total += entry.size
            if total > 180*1024*1024: raise ValueError('Expanded release exceeds size limit')
            file = payload.joinpath(*parts[2:]); file.parent.mkdir(parents=True, exist_ok=True)
            with release.extractfile(entry) as source, file.open('wb') as target:
                shutil.copyfileobj(source,target)
    if checksums is None: raise ValueError('Release has no checksum manifest')
    expected = {}
    for line in checksums.splitlines():
        if not line.strip(): continue
        digest, name = line.split('  ',1)
        if name.startswith('docs/'):
            expected[name[5:]] = digest
    (destination/'payload-sha256.json').write_text(json.dumps(expected,indent=2)+'\n')
    (destination/'required-media.json').write_text('{}\n')
    verify(payload,destination/'payload-sha256.json')
    print('Pinned release checksums verified.', flush=True)
    return destination

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    mode=parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check',action='store_true')
    mode.add_argument('--apply',action='store_true')
    mode.add_argument('--rollback',type=Path)
    parser.add_argument('--target',type=Path,default=DEFAULT_TARGET)
    parser.add_argument('--backup-root',type=Path,default=Path('/srv'))
    parser.add_argument('--source-commit',help='Download a full pinned release when no local payload is present')
    args=parser.parse_args()
    if (args.apply or args.rollback) and os.geteuid()!=0:
        parser.error('--apply and --rollback require sudo')
    target=args.target.absolute()
    check_target(target)
    temporary = None
    package = HERE
    if not args.rollback and not (package/'payload').is_dir():
        if not args.source_commit: parser.error('No payload found; supply --source-commit with the release commit')
        temporary = tempfile.TemporaryDirectory(prefix='uposatha-release-')
        package = fetch_release(args.source_commit,Path(temporary.name))
    payload=package/'payload'
    if args.check:
        expected=verify(payload,package/'payload-sha256.json')
        required=json.loads((package/'required-media.json').read_text())
        for name,digest in required.items():
            if not (target/name).is_file() or hashlib.sha256((target/name).read_bytes()).hexdigest()!=digest:
                raise ValueError('Existing recording differs or is missing: '+name)
        print('PASS: payload verified; six complete readings; existing app and recordings verified.')
        return
    lock_path=target.parent/('.'+target.name+'-update.lock')
    with lock_path.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        check_target(target)
        if args.rollback:
            restore(target,args.rollback.absolute())
            print('Restored the saved Uposatha files. No services restarted.')
        else:
            expected=verify(payload,package/'payload-sha256.json')
            required=json.loads((package/'required-media.json').read_text())
            apply(target,payload,expected,args.backup_root.absolute(),required)

if __name__=='__main__':
    try: main()
    except (OSError,ValueError,KeyError,StopIteration) as error:
        raise SystemExit('Uposatha update stopped: '+str(error))
