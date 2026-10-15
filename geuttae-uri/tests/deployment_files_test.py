import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from urllib.parse import urlparse

spec = importlib.util.spec_from_file_location('check_preview', Path(__file__).resolve().parents[1] / 'tools/check-preview-files.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class DeploymentFilesTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        files = ['index.html', 'shell-v1.css', 'runtime-config.json', 'manifest.webmanifest',
                 'boot-v3.js', 'boot-v4.js', 'assets/nested/photo.png']
        files += ['releases/1.2.3/' + name for name in ['client.js', 'locale.js', 'en.js', 'style.css', 'locales/nested.json']]
        for name in files:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name)
        (self.root / 'version.json').write_text('{"version":"1.2.3"}')

    def opener(self, stale=None, missing=None):
        def open_file(request, timeout):
            path = urlparse(request.full_url).path.removeprefix('/geuttae-uri/')
            response = io.BytesIO(b'stale' if path == stale else (self.root / path).read_bytes())
            response.status = 404 if path == missing else 200
            return response
        return open_file

    def test_discovers_loaders_translations_and_nested_files(self):
        version, paths = check.verify_files(self.root, 'https://example.test/geuttae-uri/', self.opener())
        self.assertEqual(version, '1.2.3')
        for name in ['boot-v3.js', 'boot-v4.js', 'releases/1.2.3/locale.js', 'releases/1.2.3/en.js', 'releases/1.2.3/locales/nested.json', 'assets/nested/photo.png']:
            self.assertIn(name, paths)

    def test_rejects_stale_loader_and_translation(self):
        for path in ['boot-v3.js', 'releases/1.2.3/locale.js', 'releases/1.2.3/en.js']:
            with self.subTest(path=path), self.assertRaisesRegex(AssertionError, path):
                check.verify_files(self.root, 'https://example.test/geuttae-uri/', self.opener(stale=path))

    def test_rejects_missing_published_translation(self):
        with self.assertRaisesRegex(AssertionError, 'unavailable.*en.js'):
            check.verify_files(self.root, 'https://example.test/geuttae-uri/', self.opener(missing='releases/1.2.3/en.js'))

    def test_rejects_missing_source_translation(self):
        (self.root / 'releases/1.2.3/en.js').unlink()
        with self.assertRaisesRegex(AssertionError, 'missing.*en.js'):
            check.deployment_paths(self.root)


if __name__ == '__main__':
    unittest.main()
