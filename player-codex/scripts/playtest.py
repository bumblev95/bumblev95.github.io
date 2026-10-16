#!/usr/bin/env python3
"""Validate evidence, import drafts and render reviewed EN/KO findings. No network IO.

The small schema interpreter supports exactly the keywords used by playtest.schema.json.
Semantic checks below enforce provenance, review binding, coordinates and deduplication.
It checks structure and attestations; a person must actually inspect the linked media.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone
import hashlib
import html
import json
import math
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

GAME = Path(__file__).resolve().parents[1] / 'archeage-chronicles'
DATA = GAME / 'data/playtest-records.json'
SCHEMA = GAME / 'data/playtest.schema.json'
PUBLIC = GAME / 'data/playtest-guide.json'
BEGIN = '<!-- playtest:start -->'
END = '<!-- playtest:end -->'
EXPECTED_TARGETS = {
    'class-weapons': {'class', 'skill'}, 'level-stats': {'stat'},
    'weapon-traits': {'trait', 'skill'}, 'diamond-shores': {'location'},
    'collectibles': {'collectible'}, 'hinnon-patterns': {'boss_pattern'},
    'channel-differences': {'channel'},
}
KEYWORDS = {'$schema', '$defs', '$ref', 'title', 'type', 'properties', 'required',
            'additionalProperties', 'items', 'minItems', 'maxItems', 'enum', 'const',
            'anyOf', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength', 'format'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def when(value):
    require(isinstance(value, str) and bool(re.fullmatch(
        r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)', value)),
        'Timestamp must be RFC3339 with an explicit timezone')
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)


def https_url(value):
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username
                and not parsed.password and parsed.port in (None, 443)
                and not any(c.isspace() or ord(c) < 32 or c in '\\<>"' for c in value))
    except (ValueError, TypeError):
        return False


def schema_check(value, spec, root=None, path='$'):
    root = root or spec
    require(not set(spec) - KEYWORDS, f'{path}: unsupported schema keyword')
    if '$ref' in spec:
        name = spec['$ref'].removeprefix('#/$defs/')
        return schema_check(value, root['$defs'][name], root, path)
    if 'anyOf' in spec:
        for option in spec['anyOf']:
            try:
                schema_check(value, option, root, path)
                return
            except ValueError:
                pass
        raise ValueError(f'{path}: does not match any allowed type')
    types = {'object': lambda v: isinstance(v, dict), 'array': lambda v: isinstance(v, list),
             'string': lambda v: isinstance(v, str), 'null': lambda v: v is None,
             'number': lambda v: type(v) in (int, float) and math.isfinite(v),
             'integer': lambda v: type(v) is int}
    if 'type' in spec:
        require(types[spec['type']](value), f'{path}: expected {spec["type"]}')
    if 'const' in spec:
        require(type(value) is type(spec['const']) and value == spec['const'], f'{path}: wrong constant')
    if 'enum' in spec:
        require(value in spec['enum'], f'{path}: unsupported value {value!r}')
    if isinstance(value, dict):
        props = spec.get('properties', {})
        require(not set(spec.get('required', [])) - set(value), f'{path}: missing required fields')
        if spec.get('additionalProperties') is False:
            require(not set(value) - set(props), f'{path}: unknown fields {set(value) - set(props)}')
        for key, entry in value.items():
            if key in props:
                schema_check(entry, props[key], root, f'{path}.{key}')
    if isinstance(value, list):
        require(len(value) >= spec.get('minItems', 0), f'{path}: too few items')
        require(len(value) <= spec.get('maxItems', math.inf), f'{path}: too many items')
        for index, entry in enumerate(value):
            schema_check(entry, spec['items'], root, f'{path}[{index}]')
    if isinstance(value, str):
        require(spec.get('minLength', 0) <= len(value) <= spec.get('maxLength', math.inf), f'{path}: invalid length')
        if 'pattern' in spec:
            require(re.fullmatch(spec['pattern'], value) is not None, f'{path}: invalid identifier or hash')
        if spec.get('format') == 'date-time':
            when(value)
        if spec.get('format') == 'https-url':
            require(https_url(value), f'{path}: a safe public HTTPS source URL is required')
    if type(value) in (int, float):
        require(spec.get('minimum', -math.inf) <= value <= spec.get('maximum', math.inf), f'{path}: value out of bounds')


def unique(items, name):
    require(len(items) == len(set(items)), f'Duplicate {name}; reuse the existing item instead')


def localized(value, bilingual=False):
    return all(value[lang].strip() for lang in ('en', 'ko')) if bilingual else any(v.strip() for v in value.values())


def canonical_url(value):
    p = urlsplit(value)
    host = p.hostname.lower()
    query = dict(parse_qsl(p.query, keep_blank_values=True))
    if host in {'youtu.be', 'www.youtu.be'}:
        return 'https://youtube.com/watch?v=' + p.path.strip('/')
    if host in {'youtube.com', 'www.youtube.com', 'm.youtube.com'}:
        if p.path == '/watch' and query.get('v'):
            return 'https://youtube.com/watch?v=' + query['v']
        match = re.fullmatch(r'/(?:shorts|embed)/([\w-]+)', p.path.rstrip('/'))
        if match:
            return 'https://youtube.com/watch?v=' + match[1]
    tracking = {'si', 'feature', 'ref', 'fbclid', 'gclid'}
    pairs = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith('utm_') and k.lower() not in tracking]
    return urlunsplit(('https', host, p.path or '/', urlencode(sorted(pairs)), ''))


def revision(record, evidence):
    payload = {'record': {k: v for k, v in record.items() if k != 'verification'},
               'evidence': sorted((evidence[e] for e in record['evidence_ids']), key=lambda e: e['id'])}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def fact_identity(record):
    c = record['context']
    return (record['release_id'], record['kind'], record['subject_id'], record['fact_key'],
            *(c[k] for k in ('build', 'region', 'channel', 'class_id', 'weapon_id', 'level', 'variant')))


def validate_details(record, evidence, ready):
    d, kind = record['details'], record['kind']
    allowed = {'class': {'weapons'}, 'skill': {'measurements'}, 'stat': {'measurements'},
               'trait': {'prerequisite_ids'}, 'location': {'location'}, 'collectible': {'location'},
               'boss_pattern': {'boss_pattern'}, 'channel': {'transition'}}[kind]
    require(set(d) <= allowed, f'{record["id"]}: details do not match record kind')
    if ready:
        require(set(d) == allowed, f'{record["id"]}: structured details required before review')
        if kind == 'class':
            require(d['weapons'] and record['context']['class_id'], 'Class and observed weapon IDs required')
        if kind in ('skill', 'stat'):
            require(d['measurements'] and record['context']['class_id'], 'Measured values and class required')
            require(record['context']['level'] is not None and record['context']['variant'] != 'unspecified', 'Level and test setup required for measured values')
            if kind == 'skill':
                require(record['context']['weapon_id'], 'Skill weapon context required')
            for m in d['measurements']:
                require(m['unit'].strip() and localized(m['conditions']), 'Measurement units and conditions required')
        if kind == 'trait':
            require(record['context']['weapon_id'], 'Trait weapon context required')
    if 'location' in d:
        loc = d['location']
        ref = evidence.get(loc['reference_evidence_id'])
        require(ref is not None and ref['id'] in record['evidence_ids'] and ref['kind'] == 'screenshot',
                'Map coordinates require a linked screenshot reference')
        if loc['coordinate_system'] == 'normalized_0_1':
            require(0 <= loc['x'] <= 1 and 0 <= loc['y'] <= 1, 'Normalized coordinates must be within 0..1')
            require(loc['reference_width'] is None and loc['reference_height'] is None, 'Normalized coordinates must not imply pixel dimensions')
        elif loc['coordinate_system'] == 'map_pixels':
            w, h = loc['reference_width'], loc['reference_height']
            require(w and h and 0 <= loc['x'] <= w and 0 <= loc['y'] <= h, 'Pixel coordinates require positive map dimensions and bounds')
        else:
            require(loc['reference_width'] is None and loc['reference_height'] is None, 'Game XY must not imply pixel dimensions')
    if 'boss_pattern' in d:
        b = d['boss_pattern']
        require(b['impact_seconds'] > b['cue_seconds'], 'Boss impact must follow cue')
        if ready:
            require(b['phase'].strip() and localized(b['cue']) and localized(b['response']), 'Boss phase, cue and response required')
            require(any(evidence[e]['kind'] == 'video' and evidence[e]['start_seconds'] <= b['cue_seconds']
                        and evidence[e]['end_seconds'] >= b['impact_seconds'] for e in record['evidence_ids']),
                    'Boss timing needs a linked video clip covering cue through impact')
    if 'transition' in d:
        require(d['transition']['from'] != d['transition']['to'], 'Channel transition needs two different channels')
    for key in ('weapons', 'prerequisite_ids'):
        if key in d:
            unique(d[key], key)
    if 'measurements' in d:
        unique([m['metric'] for m in d['measurements']], 'measurement metric')


def validate(data, now=None):
    schema_check(data, json.loads(SCHEMA.read_text(encoding='utf-8')))
    now = now or datetime.now(timezone.utc)
    release = data['release']
    start, end = when(release['starts_at']), when(release['ends_at'])
    require(start < end, 'Release start must precede end')
    for key in ('checklist', 'evidence', 'records'):
        unique([x['id'] for x in data[key]], key + ' ID')
    checks = {c['id']: c for c in data['checklist']}
    require(set(EXPECTED_TARGETS) <= set(checks), 'The seven demo checklist targets must be preserved')
    for check in data['checklist']:
        require(localized(check['title'], True) and localized(check['prompt'], True) and check['kinds'], 'Bilingual checklist text and kinds required')
        unique(check['kinds'], 'checklist kind')
        if check['id'] in EXPECTED_TARGETS:
            require(set(check['kinds']) == EXPECTED_TARGETS[check['id']], 'Checklist record kinds changed')
    evidence = {e['id']: e for e in data['evidence']}
    urls, hashes = [], []
    for e in evidence.values():
        if e['captured_at'] is not None:
            captured = when(e['captured_at'])
            require(captured <= now, 'Future evidence capture time')
            if e['origin'] == 'gameplay':
                require(start <= captured <= end, 'Gameplay evidence outside the demo window')
        if e['kind'] == 'video':
            require(e['start_seconds'] is not None and e['end_seconds'] is not None
                    and e['end_seconds'] > e['start_seconds'], 'Video requires an explicit increasing clip range')
        else:
            require(e['start_seconds'] is None and e['end_seconds'] is None, 'Screenshot cannot have video timestamps')
        urls.append((canonical_url(e['url']), e['start_seconds'], e['end_seconds']))
        if e['sha256']:
            hashes.append((e['sha256'], e['start_seconds'], e['end_seconds']))
    unique(urls, 'source URL/clip')
    unique(hashes, 'media checksum')
    identities = []
    for record in data['records']:
        rid = record['id']
        require(record['release_id'] == release['id'], f'{rid}: wrong release')
        require(record['target_id'] in checks and record['kind'] in checks[record['target_id']]['kinds'], f'{rid}: invalid checklist target/kind')
        unique(record['evidence_ids'], 'record evidence reference')
        require(set(record['evidence_ids']) <= set(evidence), f'{rid}: missing evidence reference')
        identities.append(fact_identity(record))
        if record['observed_at'] is not None:
            observed = when(record['observed_at'])
            require(start <= observed <= min(end, now), f'{rid}: observation outside the demo or in the future')
        status, review = record['verification']['status'], record['verification']['review']
        ready = status in ('in_review', 'verified')
        validate_details(record, evidence, ready)
        if ready:
            require(record['observed_at'] and record['recorded_by'].strip() and record['evidence_ids']
                    and localized(record['title']) and localized(record['claim']), f'{rid}: observation, attribution, claim and evidence required')
            require(record['context']['build'] != 'unspecified' and record['context']['region'] != 'unspecified', f'{rid}: actual build and region required')
            for eid in record['evidence_ids']:
                e = evidence[eid]
                require(e['origin'] == 'gameplay' and e['captured_at'] and e['build'] == record['context']['build']
                        and e['creator'].strip() and localized(e['caption']), f'{rid}: requires attributed gameplay evidence from the same build')
                require(e['kind'] != 'screenshot' or e['sha256'], f'{rid}: screenshot SHA-256 required')
        if status in ('unverified', 'in_review'):
            require(review is None, f'{rid}: pending records cannot carry an approval')
        else:
            require(review is not None, f'{rid}: review required')
            require(review['decision'] == ('approve' if status == 'verified' else 'reject'), f'{rid}: review decision mismatch')
            unique(review['evidence_ids'], 'reviewed evidence reference')
            require(set(review['evidence_ids']) == set(record['evidence_ids']), f'{rid}: reviewer must inspect all linked evidence')
            require(review['revision_sha256'] == revision(record, evidence), f'{rid}: stale review; record or evidence changed')
            require(review['reviewer'].strip() and localized(review['notes']), f'{rid}: reviewer and review notes required')
            reviewed = when(review['reviewed_at'])
            captured = [when(evidence[e]['captured_at']) for e in record['evidence_ids'] if evidence[e]['captured_at']]
            lower = max(captured + ([when(record['observed_at'])] if record['observed_at'] else [])
                        or [datetime.min.replace(tzinfo=timezone.utc)])
            require(lower <= reviewed <= now, f'{rid}: review must follow observation/evidence and cannot be future-dated')
        if status == 'verified':
            require(release['active_build'] is not None, 'Set the actual active demo build before publishing')
            require(localized(record['title'], True) and localized(record['claim'], True), f'{rid}: EN and KO text required for publication')
            for e in record['evidence_ids']:
                require(localized(evidence[e]['caption'], True), f'{rid}: bilingual source caption required')
            for m in record['details'].get('measurements', []):
                require(localized(m['conditions'], True), f'{rid}: bilingual measurement conditions required')
            if record['kind'] == 'boss_pattern':
                b = record['details']['boss_pattern']
                require(localized(b['cue'], True) and localized(b['response'], True), f'{rid}: bilingual boss details required')
    unique(identities, 'fact for this build/context')
    return data


def effective_status(record, release):
    status = record['verification']['status']
    if status == 'verified' and record['context']['build'] != release['active_build']:
        return 'needs_recheck'
    return status


def project(data):
    validate(data)
    evidence = {e['id']: e for e in data['evidence']}
    findings = []
    for r in sorted(data['records'], key=lambda r: (r['target_id'], r['id'])):
        if effective_status(r, data['release']) != 'verified':
            continue
        review = r['verification']['review']
        findings.append({k: copy.deepcopy(r[k]) for k in (
            'id', 'target_id', 'kind', 'title', 'claim', 'context', 'details', 'observed_at', 'recorded_by')}
            | {'sources': [copy.deepcopy(evidence[e]) for e in r['evidence_ids']],
               'reviewer': review['reviewer'], 'reviewed_at': review['reviewed_at'],
               'revision_sha256': review['revision_sha256']})
    return {'schema_version': 1, 'game': data['game'], 'release': data['release'], 'findings': findings}


def esc(value):
    return html.escape(str(value), quote=True)


def text(ko, en, kr):
    return kr if ko else en


def details_html(finding, lang):
    d = finding['details']
    parts = []
    if 'weapons' in d:
        parts.append('<p>' + esc(' / '.join(d['weapons'])) + '</p>')
    if 'measurements' in d:
        parts.append('<div class="field-table"><table><thead><tr><th>' + text(lang == 'ko', 'Metric', '항목')
                     + '</th><th>' + text(lang == 'ko', 'Value', '수치') + '</th><th>'
                     + text(lang == 'ko', 'Conditions', '측정 조건') + '</th></tr></thead><tbody>')
        for m in d['measurements']:
            parts.append(f'<tr><td>{esc(m["metric"])}</td><td>{esc(m["value"])} {esc(m["unit"])}</td><td>{esc(m["conditions"][lang])}</td></tr>')
        parts.append('</tbody></table></div>')
    if 'location' in d:
        loc = d['location']
        parts.append(f'<p>{esc(loc["map_id"])} · {esc(loc["coordinate_system"])} · X {esc(loc["x"])} / Y {esc(loc["y"])}')
        if loc['coordinate_system'] == 'map_pixels':
            parts.append(f' · {esc(loc["reference_width"])} × {esc(loc["reference_height"])} px')
        parts.append('</p>')
    if 'boss_pattern' in d:
        b = d['boss_pattern']
        parts.append(f'<p>{esc(b["phase"])} · {esc(b["cue_seconds"])}–{esc(b["impact_seconds"])} s</p>'
                     f'<p>{esc(b["cue"][lang])}</p><p>{esc(b["response"][lang])}</p>')
    if 'prerequisite_ids' in d:
        parts.append('<p>' + text(lang == 'ko', 'Prerequisites: ', '선행 조건: ')
                     + esc(', '.join(d['prerequisite_ids']) or text(lang == 'ko', 'None observed', '관찰된 조건 없음')) + '</p>')
    if 'transition' in d:
        parts.append(f'<p>{esc(d["transition"]["from"])} → {esc(d["transition"]["to"])}</p>')
    return ''.join(parts)


def section(data, public, ko):
    lang = 'ko' if ko else 'en'
    out = ['<section class="playtest-section" id="playtest-findings" aria-labelledby="findings-title">',
           '<p class="eyebrow">PLAYTEST EVIDENCE</p><h2 id="findings-title">',
           text(ko, 'Reviewed gameplay findings', '증거 검토를 마친 플레이 기록'), '</h2><p>',
           text(ko, 'Only gameplay evidence with a current-build review appears here. Official announcements remain separate.',
                '현재 빌드의 실제 증거와 검토를 갖춘 기록만 표시합니다. 공식 개발사 발표는 별도로 유지됩니다.'), '</p>',
           f'<p class="stat">{len(public["findings"])} ', text(ko, 'verified findings', '검증 기록'), '</p>']
    if not public['findings']:
        out += ['<p class="field-empty">', text(ko, 'No verified gameplay findings yet. The checklist below remains unverified; no measured values or locations have been published as verified.',
                '아직 검증된 플레이 기록이 없습니다. 아래 확인 항목은 미검증이며 검증된 수치·좌표를 아직 공개하지 않았습니다.'), '</p>']
    for f in public['findings']:
        c = f['context']
        out += [f'<article class="field-finding" data-playtest-id="{esc(f["id"])}"><span class="field-status verified">',
                text(ko, 'Verified · ', '검증 완료 · '), esc(c['build']), '</span>',
                f'<h3>{esc(f["title"][lang])}</h3><p>{esc(f["claim"][lang])}</p>', details_html(f, lang),
                '<p class="field-meta">', esc(' · '.join(f'{k}: {v}' for k, v in c.items() if v is not None)), '</p>',
                '<p class="field-meta">', text(ko, 'Observed: ', '관찰: '), esc(f['observed_at']),
                ' · ', esc(f['recorded_by']), '<br>', text(ko, 'Reviewed: ', '검토: '), esc(f['reviewed_at']),
                ' · ', esc(f['reviewer']), '</p><ul class="field-sources">']
        for e in f['sources']:
            locator = f' · {e["start_seconds"]}–{e["end_seconds"]} s' if e['kind'] == 'video' else ''
            out += [f'<li><a href="{esc(e["url"])}" target="_blank" rel="noopener noreferrer">{esc(e["caption"][lang])} ↗</a>',
                    f' · {esc(e["creator"])}{esc(locator)} · {esc(e["captured_at"])}',
                    text(ko, ' · Build ', ' · 빌드 '), esc(e['build'])]
            if e['sha256']:
                out += [f'<small class="field-checksum">SHA-256: {esc(e["sha256"])}</small>']
            out += ['</li>']
        out += ['</ul></article>']
    out += ['<h3>', text(ko, 'Verification checklist', '플레이 검증 현황'), '</h3><div class="field-checks">']
    for target in data['checklist']:
        records = [r for r in data['records'] if r['target_id'] == target['id']]
        counts = {s: sum(effective_status(r, data['release']) == s for r in records)
                  for s in ('unverified', 'in_review', 'verified', 'needs_recheck', 'rejected')}
        labels = [('unverified', 'Unverified', '미검증'), ('in_review', 'In review', '검토 중'),
                  ('verified', 'Verified', '검증 완료'), ('needs_recheck', 'Build recheck', '빌드 재확인'), ('rejected', 'Rejected', '반려')]
        out += [f'<article class="field-check" data-target-id="{esc(target["id"])}"><span class="field-status">',
                text(ko, 'Unverified' if not counts['verified'] else 'Reviewed records available', '미검증' if not counts['verified'] else '검토된 기록 있음'),
                f'</span><h4>{esc(target["title"][lang])}</h4><p>{esc(target["prompt"][lang])}</p><p class="field-meta">',
                ' · '.join(f'{text(ko, en, kr)} {counts[s]}' for s, en, kr in labels), '</p></article>']
    out += ['</div>', notebook(ko), '</section>']
    return ''.join(out)


def notebook(ko):
    def field(name, en, kr, kind='text', extra=''):
        control = (f'<textarea name="{name}" rows="3" {extra}></textarea>' if kind == 'textarea' else
                   f'<input name="{name}" type="{kind}" {extra}>')
        return f'<label>{text(ko, en, kr)}{control}</label>'
    def select(name, en, kr, options):
        return f'<label>{text(ko, en, kr)}<select name="{name}">{options}</select></label>'
    def options(values):
        return ''.join(f'<option value="{value}">{text(ko, en, kr)}</option>' for value, en, kr in values)
    out = ['<details class="field-notebook" id="playtest-notebook"><summary>',
           text(ko, 'Record a playtest observation', '플레이 관찰 기록하기'), '</summary><p>',
           text(ko, 'Drafts stay in this browser. Export a file for repository review; saving here does not publish a guide. Use public media links with permission and remove personal information.',
                '초안은 이 브라우저에 보관됩니다. 파일로 내보내 저장소에서 검토한 후 반영하며, 여기서 저장해도 공략으로 공개되지는 않습니다. 공개 가능한 증거 링크를 사용하고 개인정보는 가려 주세요.'),
           '</p><noscript>', text(ko, 'Enable JavaScript to use the draft form, or use the repository documentation.', '기록 양식은 JavaScript가 필요합니다. 저장소 문서로도 작성할 수 있습니다.'),
           '</noscript><div id="notebook-app" hidden><p id="notebook-message" role="status" aria-live="polite"></p>',
           '<form id="playtest-form"><div class="field-form-grid">',
           select('target_id', 'Checklist target', '확인 항목', ''),
           select('kind', 'Record type', '기록 종류', ''),
           field('title_ko', 'Korean title', '한국어 제목', extra='maxlength="500"'),
           field('title_en', 'English title', '영어 제목', extra='maxlength="500"'),
           field('subject_id', 'Shared subject ID (English game name, lowercase)', '대상 공통 ID (게임 영문 이름, 소문자)', extra='required pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('fact_key', 'Observation key (e.g. cooldown)', '관찰 항목 ID (예: cooldown)', extra='required pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('claim_ko', 'Korean observation', '한국어 관찰 내용', 'textarea', 'maxlength="4000"'),
           field('claim_en', 'English observation', '영어 관찰 내용', 'textarea', 'maxlength="4000"'),
           field('recorded_by', 'Recorder display name', '기록자 표시 이름', extra='required maxlength="120"'),
           field('observed_at', 'Actual observation time (local timezone)', '실제 관찰 시각 (현재 기기 시간대)', 'datetime-local'),
           field('build', 'Actual game build', '실제 게임 빌드', extra='required pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('region', 'Server region', '서버 지역', extra='required pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           select('channel', 'Observed channel', '관찰 채널', options([('regular','Regular','일반'),('pvp','PvP','PvP')])),
           field('variant', 'Test setup ID', '테스트 조건 ID', extra='required pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('class_id', 'Class ID, if relevant', '클래스 ID (해당 시)', extra='pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('weapon_id', 'Weapon ID, if relevant', '무기 ID (해당 시)', extra='pattern="[a-z0-9][a-z0-9._-]{0,95}" maxlength="96"'),
           field('level', 'Character level, if relevant', '캐릭터 레벨 (해당 시)', 'number', 'min="1" max="1000" step="1"'),
           '</div><fieldset data-kinds="class"><legend>', text(ko,'Observed weapons','관찰한 무기'), '</legend>',
           field('weapons', 'Weapon IDs separated by commas', '무기 ID (쉼표로 구분)'), '</fieldset>',
           '<fieldset data-kinds="skill stat"><legend>',text(ko,'Measured value','측정 수치'),'</legend><div class="field-form-grid">',
           field('metric', 'Metric ID', '측정 항목 ID'), field('value', 'Measured value', '실측값', 'number', 'step="any"'),
           field('unit','Unit','단위'),field('conditions_ko','Conditions in Korean','측정 조건 (한국어)'),
           field('conditions_en','Conditions in English','측정 조건 (영어)'),'</div></fieldset>',
           '<fieldset data-kinds="trait"><legend>',text(ko,'Trait prerequisites','특성 선행 조건'),'</legend>',
           field('prerequisite_ids','Prerequisite IDs separated by commas; empty if none observed','선행 조건 ID (쉼표 구분, 관찰된 조건 없으면 비움)'),'</fieldset>',
           '<fieldset data-kinds="location collectible"><legend>',text(ko,'Map position','지도 위치'),'</legend><div class="field-form-grid">',
           field('map_id','Map ID','지도 ID'),
           select('coordinate_system','Coordinate basis','좌표 기준',options([('normalized_0_1','Normalized 0–1','정규화 0–1'),('game_xy','In-game XY','게임 내 XY'),('map_pixels','Map image pixels','지도 이미지 픽셀')])),
           field('x','X','X','number','step="any"'),field('y','Y','Y','number','step="any"'),
           field('reference_width','Map width in pixels (pixel basis only)','기준 지도 너비 (픽셀 기준만)','number','min="1"'),
           field('reference_height','Map height in pixels (pixel basis only)','기준 지도 높이 (픽셀 기준만)','number','min="1"'),'</div></fieldset>',
           '<fieldset data-kinds="boss_pattern"><legend>',text(ko,'Boss video timing','보스 영상 시점'),'</legend><div class="field-form-grid">',
           field('boss_id','Boss ID','보스 ID'),field('phase','Observed phase','관찰 페이즈'),
           field('cue_ko','Cue in Korean','텔레그래프 (한국어)'),field('cue_en','Cue in English','텔레그래프 (영어)'),
           field('response_ko','Observed response in Korean','실제 대응 (한국어)'),field('response_en','Observed response in English','실제 대응 (영어)'),
           field('cue_seconds','Cue timestamp in source video (seconds)','원본 영상 텔레그래프 시점 (초)','number','min="0" step="any"'),
           field('impact_seconds','Impact timestamp (seconds)','원본 영상 판정 시점 (초)','number','min="0" step="any"'),'</div></fieldset>',
           '<fieldset data-kinds="channel"><legend>',text(ko,'Channel switch','채널 전환'),'</legend>',
           select('channel_from','From','전환 전',options([('regular','Regular','일반'),('pvp','PvP','PvP')])),
           select('channel_to','To','전환 후',options([('pvp','PvP','PvP'),('regular','Regular','일반')])),'</fieldset>',
           '<fieldset><legend>',text(ko,'Evidence source (optional for an unverified draft)','증거 출처 (미검증 초안은 나중에 추가 가능)'),'</legend><div class="field-form-grid">',
           select('evidence_kind','Media type','미디어 종류',options([('screenshot','Screenshot','스크린샷'),('video','Video','영상')])),
           field('source_url','Public original HTTPS URL','공개 원본 HTTPS URL','url','maxlength="2000"'),
           field('creator','Source creator display name','출처 제작자 표시 이름',extra='maxlength="120"'),
           field('caption_ko','What the source shows (Korean)','증거가 보여주는 내용 (한국어)'),
           field('caption_en','What the source shows (English)','증거가 보여주는 내용 (영어)'),
           field('captured_at','Actual capture time (local timezone)','실제 촬영 시각 (현재 기기 시간대)','datetime-local'),
           field('sha256','SHA-256 of original screenshot file','원본 스크린샷 파일 SHA-256',extra='pattern="[a-f0-9]{64}" maxlength="64"'),
           field('start_seconds','Video clip start (seconds)','영상 구간 시작 (초)','number','min="0" step="any"'),
           field('end_seconds','Video clip end (seconds)','영상 구간 종료 (초)','number','min="0" step="any"'),
           '</div></fieldset><button class="btn primary" type="submit">',text(ko,'Save unverified draft','미검증 초안 저장'),'</button></form>',
           '<div class="actions"><button class="btn" type="button" id="export-drafts">',text(ko,'Export draft file','초안 파일 내보내기'),
           '</button><label class="btn field-import">',text(ko,'Import draft file','초안 파일 가져오기'),
           '<input type="file" id="import-drafts" accept="application/json,.json"></label></div>',
           '<button class="btn" type="button" id="restart-drafts" hidden>', text(ko, 'Start a new notebook draft', '이 기록장에 새 초안 시작'), '</button>',
           '<p id="draft-count"></p><ul id="draft-list"></ul></div></details>']
    return ''.join(out)


def outputs(data):
    public = project(data)
    result = {PUBLIC: json.dumps(public, ensure_ascii=False, indent=2) + '\n'}
    for ko in (False, True):
        path = GAME / ('demo/ko/index.html' if ko else 'demo/index.html')
        body = path.read_text(encoding='utf-8')
        require(body.count(BEGIN) == body.count(END) == 1 and body.index(BEGIN) < body.index(END), f'Invalid playtest markers in {path}')
        a, b = body.index(BEGIN) + len(BEGIN), body.index(END)
        result[path] = body[:a] + section(data, public, ko) + body[b:]
    return result


def merge_drafts(data, incoming):
    schema_check(incoming, load(SCHEMA))
    require(incoming['schema_version'] == data['schema_version'] and incoming['game'] == data['game']
            and incoming['release'] == data['release'] and incoming['checklist'] == data['checklist'],
            'Draft release/build/checklist differs; update the draft before importing')
    merged = copy.deepcopy(data)
    for key in ('evidence', 'records'):
        unique([i['id'] for i in incoming[key]], 'incoming ' + key + ' ID')
        existing = {i['id']: i for i in merged[key]}
        for item in incoming[key]:
            if item['id'] in existing:
                require(item == existing[item['id']], f'Import would overwrite existing {key} {item["id"]}; edit through a reviewed PR')
            else:
                if key == 'records':
                    require(item['verification'] == {'status': 'unverified', 'review': None}, 'Import accepts only unverified new drafts')
                merged[key].append(item)
    validate(merged)
    return merged


def load(path):
    def reject_duplicates(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, f'Duplicate JSON key: {key}')
            result[key] = value
        return result
    return json.loads(path.read_text(encoding='utf-8'), object_pairs_hook=reject_duplicates,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Non-finite JSON value: ' + value)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated files are stale; do not write')
    parser.add_argument('--import-drafts', type=Path, help='Merge an exported draft file without overwriting records')
    parser.add_argument('--revision', metavar='RECORD_ID', help='Print digest for a person who has inspected the evidence; does not approve')
    args = parser.parse_args()
    require(not (args.check and args.import_drafts), '--check cannot be combined with --import-drafts')
    data = load(DATA)
    validate(data)
    if args.import_drafts:
        data = merge_drafts(data, load(args.import_drafts))
    if args.revision:
        records = {r['id']: r for r in data['records']}
        require(args.revision in records, 'Unknown record ID')
        print(revision(records[args.revision], {e['id']: e for e in data['evidence']}))
        return
    generated = outputs(data)  # Validate and render everything before the first write.
    if args.import_drafts:
        generated[DATA] = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    for path, body in generated.items():
        if args.check:
            require(path.exists() and path.read_text(encoding='utf-8') == body, f'Stale generated file: {path}; run playtest.py')
        elif not path.exists() or path.read_text(encoding='utf-8') != body:
            path.write_text(body, encoding='utf-8')
    print(f'Playtest evidence OK: {len(data["records"])} records, {len(project(data)["findings"])} reviewed current-build findings. No approval was created.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, TypeError) as exc:
        print(f'Playtest validation failed; no publication: {exc}', file=sys.stderr)
        sys.exit(1)
