"""Installer tests use isolated temporary app roots, never the live server."""
from pathlib import Path
import hashlib, json, shutil, tempfile, unittest
from unittest.mock import patch
import install_aws

ROOT = Path(__file__).resolve().parents[1]

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.target=self.root/'live'
        self.target.mkdir()
        (self.target/'index.html').write_text('<title>Uposatha old installation</title>')
        (self.target/'sw.js').write_text('old worker')
        (self.target/'assets').mkdir()
        (self.target/'assets/old-tab.js').write_text('keep for open tabs')
        (self.target/'namo-tassa.mp3').write_bytes(b'original recording')
        self.media={'namo-tassa.mp3':hashlib.sha256(b'original recording').hexdigest()}
        self.payload=self.root/'payload'
        self.payload.mkdir()
        for name in ['index.html','sw.js','assets/readings-v17.js','assets/readings-v17.css','assets/readings-v17.json']:
            p=self.payload/name;p.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(ROOT/'docs'/name,p)
        self.expected={p.relative_to(self.payload).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in self.payload.rglob('*') if p.is_file()}
        self.manifest=self.root/'payload-sha256.json'
        self.manifest.write_text(json.dumps(self.expected))
    def tearDown(self): self.temp.cleanup()

    def test_verify_rejects_corruption_before_install(self):
        self.assertEqual(install_aws.verify(self.payload,self.manifest),self.expected)
        (self.payload/'assets/readings-v17.json').write_text('{}')
        with self.assertRaisesRegex(ValueError,'Checksum failed'):
            install_aws.verify(self.payload,self.manifest)
        self.assertIn('old installation',(self.target/'index.html').read_text())

    def test_apply_backup_and_rollback(self):
        backup=install_aws.apply(self.target,self.payload,self.expected,self.root/'backups',self.media)
        self.assertEqual((self.target/'index.html').read_bytes(),(self.payload/'index.html').read_bytes())
        self.assertTrue((self.target/'assets/old-tab.js').is_file())
        self.assertEqual((self.target/'namo-tassa.mp3').read_bytes(),b'original recording')
        install_aws.restore(self.target,backup)
        self.assertIn('old installation',(self.target/'index.html').read_text())
        self.assertEqual((self.target/'sw.js').read_text(),'old worker')

    def test_write_failure_restores_old_shell(self):
        original=install_aws.atomic_copy
        failed=False
        def fail_once(source,destination):
            nonlocal failed
            if destination.name=='sw.js' and not failed:
                failed=True
                raise OSError('simulated write failure')
            original(source,destination)
        with patch.object(install_aws,'atomic_copy',fail_once):
            with self.assertRaisesRegex(OSError,'simulated write failure'):
                install_aws.apply(self.target,self.payload,self.expected,self.root/'backups',self.media)
        self.assertIn('old installation',(self.target/'index.html').read_text())
        self.assertEqual((self.target/'sw.js').read_text(),'old worker')

    def test_unknown_media_and_invalid_release_do_not_write(self):
        with self.assertRaisesRegex(ValueError,'Existing recording differs'):
            install_aws.apply(self.target,self.payload,self.expected,self.root/'backups',{'namo-tassa.mp3':'0'*64})
        self.assertFalse((self.root/'backups').exists())
        with self.assertRaisesRegex(ValueError,'full 40-character'):
            install_aws.fetch_release('main',self.root)

if __name__=='__main__': unittest.main()
