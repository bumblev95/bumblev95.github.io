import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('audit_release', Path(__file__).with_name('audit-release.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
XML = '''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.bumblevai.thenus" android:versionName="1.0.0" android:versionCode="10000"><uses-sdk android:targetSdkVersion="36"/><uses-permission android:name="android.permission.INTERNET"/>{extra}<application android:allowBackup="false" android:usesCleartextTraffic="false"/></manifest>'''

class ReleaseAudit(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.manifest = Path(self.temp.name)/'manifest.xml'
        self.apk = Path(self.temp.name)/'release.apk'
        self.aab = Path(self.temp.name)/'release.aab'
        self.manifest.write_text(XML.format(extra=''))
        for p in (self.apk, self.aab):
            with zipfile.ZipFile(p, 'w') as z:
                z.writestr('assets/local.js', 'local')
    def run_audit(self):
        return module.audit(self.manifest, self.apk, self.aab)
    def test_current_candidate(self):
        self.assertEqual(self.run_audit()['package'], 'com.bumblevai.thenus')
    def test_dependency_permission_blocks_release(self):
        self.manifest.write_text(XML.format(extra='<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>'))
        with self.assertRaisesRegex(AssertionError, 'Unreviewed merged permissions'):
            self.run_audit()
    def test_wrong_variant_blocks_release(self):
        self.manifest.write_text(XML.format(extra='').replace('package="com.bumblevai.thenus"', 'package="com.bumblevai.thenus.test"'))
        with self.assertRaisesRegex(AssertionError, 'Wrong release package'):
            self.run_audit()
    def test_unused_foreground_worker_blocks_release(self):
        xml = XML.format(extra='').replace('/></manifest>', '><service android:name="androidx.work.impl.foreground.SystemForegroundService"/></application></manifest>')
        self.manifest.write_text(xml)
        with self.assertRaisesRegex(AssertionError, 'Unexpected foreground service'):
            self.run_audit()
    def test_compiled_and_source_signature_levels_with_unsafe_rejection(self):
        permission = module.PACKAGE + '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
        for level in ('signature', '0x2', '0x00000002', '2', 'normal', '0x0', 'dangerous', '0x1'):
            with self.subTest(level=level):
                extra = f'<permission android:name="{permission}" android:protectionLevel="{level}"/><uses-permission android:name="{permission}"/>'
                self.manifest.write_text(XML.format(extra=extra))
                if level in ('signature', '0x2', '0x00000002', '2'):
                    self.run_audit()
                else:
                    with self.assertRaisesRegex(AssertionError, 'signature protected'):
                        self.run_audit()
    def test_native_dependency_requires_page_size_review(self):
        with zipfile.ZipFile(self.aab, 'a') as z:
            z.writestr('base/lib/arm64-v8a/new.so', b'library')
        with self.assertRaisesRegex(AssertionError, '16 KB'):
            self.run_audit()

if __name__ == '__main__':
    unittest.main()
