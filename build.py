#!/usr/bin/env python3
"""Build a reproducible Zotero XPI with no third-party dependencies."""
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

root = Path(__file__).resolve().parent
version = json.loads((root / 'manifest.json').read_text())['version']
output = root / 'dist' / f'open-notes-in-typora-{version}.xpi'
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', compression=ZIP_DEFLATED) as archive:
    for name in ('manifest.json', 'bootstrap.js'):
        info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, (root / name).read_bytes())
with ZipFile(output) as archive:
    assert archive.testzip() is None
print(output)
