"""Compare the deployed preview with the checked-out source (no backend requests)."""
import argparse
import hashlib
import json
from pathlib import Path
import time
from urllib.request import Request, urlopen


def deployment_paths(root):
    version = json.loads((root / 'version.json').read_text())['version']
    release = root / 'releases' / version
    paths = {'index.html', 'shell-v1.css', 'version.json',
             'runtime-config.json', 'manifest.webmanifest'}
    # Discover future loader versions and nested translation/assets automatically.
    paths.update(p.name for p in root.glob('boot-v*.js'))
    for folder in (root / 'assets', release):
        paths.update(p.relative_to(root).as_posix() for p in folder.rglob('*') if p.is_file())
    # Fail closed if the bilingual entry points themselves disappear from source.
    paths.update(f'releases/{version}/{name}' for name in ('client.js', 'locale.js', 'en.js', 'style.css'))
    for path in paths:
        if not (root / path).is_file():
            raise AssertionError('Required deployment file missing: ' + path)
    return version, sorted(paths)


def verify_files(root, base, opener=urlopen):
    version, paths = deployment_paths(root)
    for path in paths:
        request = Request(base.rstrip('/') + '/' + path + '?check=' + str(time.time_ns()),
                          headers={'Cache-Control': 'no-cache', 'User-Agent': 'ThenUsDeploymentCheck/2.0'})
        with opener(request, timeout=15) as response:
            if response.status != 200:
                raise AssertionError('Published file unavailable: ' + path)
            actual = hashlib.sha256(response.read()).digest()
        if actual != hashlib.sha256((root / path).read_bytes()).digest():
            raise AssertionError('Published file not current: ' + path)
    return version, paths


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', default='https://bumblev95.github.io/geuttae-uri/')
    parser.add_argument('--attempts', type=int, default=30)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for attempt in range(args.attempts):
        try:
            version, paths = verify_files(root, args.base)
            print(f'HTTPS PASS: {args.base} version {version} - {len(paths)} files match the committed source')
            break
        except Exception as error:
            print('Deployment check', attempt + 1, type(error).__name__, str(error), flush=True)
            if attempt + 1 == args.attempts:
                raise
            time.sleep(6)
