"""Fetch the author's public CC0 Standard animation archives for adaptation/QA.

No account, purchase or paid API. Archives and provenance stay outside release files.
"""
import datetime
import hashlib
import json
import pathlib
import stat
import urllib.request
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent / 'test-assets' / 'external' / 'quaternius-animations'
root.mkdir(parents=True, exist_ok=True)
packs = [
    ('library-1', 'universal_animation_librarystandard.zip', 'https://opengameart.org/content/universal-animation-library', 'https://quaternius.com/packs/universalanimationlibrary.html'),
    ('library-2', 'universal_animation_library_2standard.zip', 'https://opengameart.org/content/universal-animation-library-2', 'https://quaternius.com/packs/universalanimationlibrary2.html'),
]
manifest_path = root / 'manifest.json'
prior = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
expected = {pack['archive']: pack['sha256'] for pack in prior.get('packs', [])}
records = []
for name, filename, author_page, official_page in packs:
    url = 'https://opengameart.org/sites/default/files/' + filename
    archive_path = root / filename
    if not archive_path.exists():
        request = urllib.request.Request(url, headers={'User-Agent': 'DirectorDesk-Asset-QA/1.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read(64 * 1024 * 1024 + 1)
        if len(data) > 64 * 1024 * 1024:
            raise ValueError('Archive exceeds expected download size')
        temporary = archive_path.with_suffix('.download')
        temporary.write_bytes(data)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('Archive checksum failed')
        temporary.replace(archive_path)
    data = archive_path.read_bytes()
    if filename in expected and hashlib.sha256(data).hexdigest() != expected[filename]:
        raise ValueError('Cached archive differs from recorded source checksum')
    destination = root / name
    files = []
    with zipfile.ZipFile(archive_path) as archive:
        if sum(entry.file_size for entry in archive.infolist()) > 256 * 1024 * 1024:
            raise ValueError('Expanded archive exceeds expected size')
        for entry in archive.infolist():
            relative = pathlib.PurePosixPath(entry.filename)
            if relative.is_absolute() or '..' in relative.parts or '\\' in entry.filename or stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError('Unsafe archive path')
            if entry.is_dir() or relative.suffix.lower() not in {'.glb', '.fbx', '.gltf', '.bin', '.txt', '.png', '.jpg'}:
                continue
            target = (destination / str(relative)).resolve()
            if not target.is_relative_to(destination.resolve()):
                raise ValueError('Archive path escapes fixture directory')
            contents = archive.read(entry)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(contents)
            files.append({'file': target.relative_to(root).as_posix(), 'bytes': len(contents), 'sha256': hashlib.sha256(contents).hexdigest()})
    for suffix, page_url in [('author', author_page), ('official', official_page)]:
        page_path = root / f'{name}-{suffix}.html'
        if not page_path.exists():
            with urllib.request.urlopen(page_url, timeout=45) as response:
                page_path.write_bytes(response.read())
    records.append({'name': name, 'archive': filename, 'url': url, 'authorPage': author_page, 'officialPage': official_page,
                    'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'license': 'CC0-1.0', 'files': files})
    print(f'{name}: {len(files)} files, {len(data)} archive bytes', flush=True)
(root / 'manifest.json').write_text(json.dumps({'downloadedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Local adaptation and QA. Raw archives, source metadata and test projects are excluded from release. Curated derived presets require separate implementation and release review.',
    'licenseEvidence': 'Author-uploaded OpenGameArt pages, official product pages and License.txt inside each archive identify CC0. Only Standard archives were downloaded.',
    'packs': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Animation archives, original licenses, public provenance pages and checksums saved.', flush=True)
