"""Audit the merged RELEASE manifest and exact APK/AAB ZIPs; never sign or upload."""
import hashlib
import json
import os
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ANDROID = '{http://schemas.android.com/apk/res/android}'
PACKAGE = 'com.bumblevai.thenus'


def audit(manifest, apk, aab):
    root = ET.fromstring(Path(manifest).read_text())
    assert root.get('package') == PACKAGE, 'Wrong release package (TEST must not be uploaded)'
    assert root.get(ANDROID + 'versionName') == '1.0.0', 'Unexpected version'
    assert root.get(ANDROID + 'versionCode') == '10000', 'Unexpected versionCode'
    sdk = root.find('uses-sdk')
    assert sdk is not None and int(sdk.get(ANDROID + 'targetSdkVersion')) >= 36, 'Target API below 36'
    app = root.find('application')
    for attribute in ('debuggable', 'allowBackup', 'usesCleartextTraffic'):
        assert app.get(ANDROID + attribute, 'false' if attribute == 'debuggable' else None) == 'false', attribute + ' must be false'
    permissions = {p.get(ANDROID + 'name') for p in root if p.tag.startswith('uses-permission')}
    # AndroidX may merge a private signature-level receiver permission. No SDK permission
    # gets a free pass merely because it wasn't present in the source manifest.
    allowed = {
        'android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE',
        'com.google.android.gms.permission.AD_ID',
        'android.permission.ACCESS_ADSERVICES_AD_ID',
        'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
        'android.permission.ACCESS_ADSERVICES_TOPICS',
        PACKAGE + '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION',
    }
    assert 'android.permission.INTERNET' in permissions
    assert permissions <= allowed, 'Unreviewed merged permissions: ' + str(permissions - allowed)
    private = PACKAGE + '.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'
    if private in permissions:
        assert any(p.get(ANDROID + 'name') == private and p.get(ANDROID + 'protectionLevel') == 'signature'
                   for p in root.findall('permission')), 'Receiver permission must be signature protected'
    files = []
    for filename in (apk, aab):
        filename = Path(filename)
        with zipfile.ZipFile(filename) as archive:
            names = archive.namelist()
            assert not any(n.endswith('.so') for n in names), 'Native library added: review 16 KB page-size compatibility before release'
            assert not any(n.lower().endswith(('.jks', '.keystore', '.p12', '.pfx')) for n in names), 'Private key packaged'
        files.append({'name': filename.name, 'sha256': hashlib.sha256(filename.read_bytes()).hexdigest(), 'bytes': filename.stat().st_size})
    return {'package': PACKAGE, 'versionName': '1.0.0', 'versionCode': 10000,
            'targetSdk': int(sdk.get(ANDROID + 'targetSdkVersion')), 'permissions': sorted(permissions),
            'nativeLibraries': [], 'sourceCommit': os.environ.get('RELEASE_SOURCE_SHA'),
            'workflowCommit': os.environ.get('GITHUB_SHA'), 'runId': os.environ.get('GITHUB_RUN_ID'),
            'signing': 'unsigned; requires retained private upload key', 'physicalDeviceTest': 'not performed by this audit', 'files': files}


if __name__ == '__main__':
    if len(sys.argv) != 5:
        raise SystemExit('Usage: audit-release.py merged-release.xml release.apk release.aab output.json')
    report = audit(*sys.argv[1:4])
    Path(sys.argv[4]).write_text(json.dumps(report, indent=2) + '\n')
    print('RELEASE AUDIT PASS: package, merged permissions, API, backup, cleartext, native libraries and SHA-256')
