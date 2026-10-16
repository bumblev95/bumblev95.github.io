"""Synthetic regression fixtures ONLY; never imported into production gameplay data."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import playtest as p


def pair(value='SYNTHETIC TEST ONLY'):
    return {'en': value, 'ko': '합성 테스트 전용: ' + value}


def fixture(kind='skill', approved=False):
    d = p.load(p.DATA)
    # This closed, historical synthetic test window cannot become demo evidence.
    d['release'] = {'id': 'synthetic-test-only', 'starts_at': '2026-09-20T17:00:00Z',
                    'ends_at': '2026-09-26T17:00:00Z', 'active_build': 'synthetic-build'}
    e = {'id': 'synthetic-source', 'kind': 'screenshot', 'origin': 'gameplay',
         'url': 'https://example.com/synthetic-only.png', 'creator': 'synthetic-recorder',
         'caption': pair(), 'captured_at': '2026-09-21T18:00:00Z', 'build': 'synthetic-build',
         'sha256': hashlib.sha256(b'SYNTHETIC IMAGE BYTES ONLY').hexdigest(),
         'start_seconds': None, 'end_seconds': None}
    target = next(t['id'] for t in d['checklist'] if kind in t['kinds'])
    r = {'id': 'synthetic-record', 'release_id': d['release']['id'], 'target_id': target,
         'kind': kind, 'subject_id': 'synthetic-subject', 'fact_key': 'synthetic-fact',
         'title': pair(), 'claim': pair(), 'recorded_by': 'synthetic-recorder',
         'observed_at': '2026-09-21T18:00:00Z',
         'context': {'build': 'synthetic-build', 'region': 'synthetic-region', 'channel': 'regular',
                     'class_id': 'synthetic-class', 'weapon_id': 'synthetic-weapon',
                     'level': 1, 'variant': 'synthetic-setup'},
         'details': {}, 'evidence_ids': [e['id']], 'verification': {'status': 'unverified', 'review': None}}
    details = {'class': {'weapons': ['synthetic-one', 'synthetic-two']},
               'skill': {'measurements': [{'metric': 'synthetic-value', 'value': 1, 'unit': 'test-unit', 'conditions': pair()}]},
               'stat': {'measurements': [{'metric': 'synthetic-value', 'value': 1, 'unit': 'test-unit', 'conditions': pair()}]},
               'trait': {'prerequisite_ids': []},
               'location': {'location': {'map_id': 'synthetic-map', 'coordinate_system': 'normalized_0_1',
                             'x': 0.5, 'y': 0.5, 'reference_evidence_id': e['id'],
                             'reference_width': None, 'reference_height': None}},
               'channel': {'transition': {'from': 'regular', 'to': 'pvp'}},
               'boss_pattern': {'boss_pattern': {'boss_id': 'synthetic-boss', 'phase': 'synthetic-phase',
                                  'cue': pair(), 'response': pair(), 'cue_seconds': 2, 'impact_seconds': 3}}}
    details['collectible'] = details['location']
    r['details'] = details[kind]
    if kind == 'boss_pattern':
        e.update(kind='video', url='https://www.youtube.com/watch?v=synthetic-only',
                 start_seconds=0, end_seconds=4, sha256=None)
    d['records'], d['evidence'] = [r], [e]
    if approved:
        approve(d)
    return d


def approve(d):
    r = d['records'][0]
    r['verification'] = {'status': 'verified', 'review': {
        'reviewer': 'synthetic-reviewer', 'reviewed_at': '2026-09-22T18:00:00Z', 'decision': 'approve',
        'revision_sha256': p.revision(r, {e['id']: e for e in d['evidence']}),
        'evidence_ids': list(r['evidence_ids']), 'notes': pair('SYNTHETIC REVIEW')}}


class PlaytestTests(unittest.TestCase):
    def test_current_dataset_cannot_claim_play_before_demo_begins(self):
        d = p.load(p.DATA)
        if p.datetime.now(p.timezone.utc) < p.when(d['release']['starts_at']):
            self.assertTrue(all(r['observed_at'] is None for r in d['records']))
            self.assertTrue(all(e['captured_at'] is None for e in d['evidence'] if e['origin'] == 'gameplay'))
            self.assertEqual(p.project(d)['findings'], [])
        self.assertTrue(set(p.EXPECTED_TARGETS) <= {t['id'] for t in d['checklist']})
        p.validate(d)
        self.assertEqual(p.when(d['release']['starts_at']).hour, 17)

    def test_every_record_type_can_pass_only_after_review(self):
        for kind in ('class','skill','stat','trait','location','collectible','boss_pattern','channel'):
            with self.subTest(kind=kind):
                d=fixture(kind)
                self.assertEqual(p.project(d)['findings'], [])
                d['records'][0]['verification']['status']='in_review'
                self.assertEqual(p.project(d)['findings'], [])
                approve(d)
                self.assertEqual(len(p.project(d)['findings']), 1)

    def test_status_cannot_bypass_missing_review(self):
        d=fixture(); d['records'][0]['verification']['status']='verified'
        with self.assertRaisesRegex(ValueError, 'review required'): p.validate(d)

    def test_approval_binds_claim_and_evidence_even_when_other_fields_unchanged(self):
        for mutate in (lambda d: d['records'][0]['claim'].update(en='CHANGED'),
                       lambda d: d['evidence'][0].update(url='https://example.com/replaced.png'),
                       lambda d: d['evidence'][0].update(sha256='f'*64),
                       lambda d: d['records'][0]['context'].update(variant='changed')):
            with self.subTest(mutate=mutate):
                d=fixture(approved=True); mutate(d)
                with self.assertRaisesRegex(ValueError, 'stale review'): p.validate(d)

    def test_stale_build_is_not_a_current_guide(self):
        d=fixture(approved=True); d['release']['active_build']='new-synthetic-build'
        self.assertEqual(p.effective_status(d['records'][0],d['release']), 'needs_recheck')
        self.assertEqual(p.project(d)['findings'], [])

    def test_pending_and_rejected_material_never_leaks_into_guide(self):
        d=fixture(approved=True)
        r=d['records'][0]
        r['verification']['status']='rejected'; r['verification']['review']['decision']='reject'
        self.assertEqual(p.project(d)['findings'], [])
        rendered=p.section(d,p.project(d),True)
        self.assertNotIn('data-playtest-id=',rendered)
        self.assertNotIn('SYNTHETIC TEST ONLY',rendered)

    def test_future_pre_demo_and_wrong_release_times_rejected(self):
        for timestamp in ('2026-09-19T18:00:00Z','2026-09-27T18:00:00Z','2099-01-01T00:00:00Z'):
            d=fixture();d['records'][0]['observed_at']=timestamp
            with self.assertRaisesRegex(ValueError,'outside the demo'):p.validate(d)
        d=fixture();d['evidence'][0]['captured_at']='2099-01-01T00:00:00Z'
        with self.assertRaisesRegex(ValueError,'Future evidence'):p.validate(d)
        d=fixture(approved=True);d['records'][0]['verification']['review']['reviewed_at']='2026-09-21T17:00:00Z'
        with self.assertRaisesRegex(ValueError,'review must follow'):p.validate(d)

    def test_source_and_build_provenance_are_required(self):
        for field,value in [('origin','official_promo'),('origin','community_claim'),('build','wrong-build'),
                            ('creator',''),('captured_at',None),('sha256',None)]:
            d=fixture(approved=True);d['evidence'][0][field]=value
            with self.assertRaises(ValueError):p.validate(d)

    def test_bilingual_publication_is_all_or_nothing(self):
        for obj,key in [('claim','en'),('title','ko')]:
            d=fixture();d['records'][0][obj][key]='';approve(d)
            with self.assertRaisesRegex(ValueError,'EN and KO'):p.validate(d)
        d=fixture();d['evidence'][0]['caption']['ko']='';approve(d)
        with self.assertRaisesRegex(ValueError,'bilingual source'):p.validate(d)

    def test_reviews_must_cover_exactly_the_linked_evidence(self):
        d=fixture(approved=True);d['records'][0]['verification']['review']['evidence_ids']=[]
        with self.assertRaisesRegex(ValueError,'all linked evidence'):p.validate(d)

    def test_structural_unknown_fields_and_bad_numbers_fail_closed(self):
        for mutate in (lambda d:d.update(unexpected='ignored?'),
                       lambda d:d['records'][0]['verification'].update(status='approved'),
                       lambda d:d['records'][0]['details']['measurements'][0].update(value=float('nan')),
                       lambda d:d['records'][0]['details']['measurements'][0].update(value=True)):
            d=fixture();mutate(d)
            with self.assertRaises(ValueError):p.validate(d)

    def test_broken_references_and_mismatched_kind_rejected(self):
        d=fixture();d['records'][0]['evidence_ids']=['not-present']
        with self.assertRaisesRegex(ValueError,'missing evidence'):p.validate(d)
        d=fixture();d['records'][0]['target_id']='collectibles'
        with self.assertRaisesRegex(ValueError,'invalid checklist'):p.validate(d)

    def test_duplicate_records_and_contradictory_same_context_rejected(self):
        d=fixture();r=copy.deepcopy(d['records'][0]);r['id']='second-record';r['claim']=pair('DIFFERENT CLAIM')
        d['records'].append(r)
        with self.assertRaisesRegex(ValueError,'Duplicate fact'):p.validate(d)
        d=fixture();d['records'].append(copy.deepcopy(d['records'][0]))
        with self.assertRaisesRegex(ValueError,'Duplicate records ID'):p.validate(d)

    def test_tracking_and_youtube_aliases_cannot_create_duplicate_sources(self):
        d=fixture('boss_pattern')
        e=copy.deepcopy(d['evidence'][0]);e['id']='second-source';e['url']='https://youtu.be/synthetic-only?si=tracking'
        d['evidence'].append(e)
        with self.assertRaisesRegex(ValueError,'Duplicate source'):p.validate(d)
        self.assertEqual(p.canonical_url('https://example.com/map.png?utm_source=foo'),p.canonical_url('https://example.com/map.png'))

    def test_duplicate_bytes_at_different_urls_rejected_but_clips_can_share_video(self):
        d=fixture();e=copy.deepcopy(d['evidence'][0]);e['id']='second-source';e['url']='https://example.com/copy.png';d['evidence'].append(e)
        with self.assertRaisesRegex(ValueError,'Duplicate media checksum'):p.validate(d)
        d=fixture('boss_pattern');e=copy.deepcopy(d['evidence'][0]);e.update(id='later-clip',start_seconds=10,end_seconds=15)
        d['evidence'].append(e);p.validate(d)

    def test_map_coordinate_basis_bounds_and_reference(self):
        d=fixture('location');d['records'][0]['details']['location']['x']=1.01
        with self.assertRaisesRegex(ValueError,'0..1'):p.validate(d)
        d=fixture('location');loc=d['records'][0]['details']['location'];loc.update(coordinate_system='map_pixels',x=0,y=0)
        with self.assertRaisesRegex(ValueError,'dimensions'):p.validate(d)
        loc.update(reference_width=100,reference_height=200);p.validate(d)
        loc['x']=101
        with self.assertRaisesRegex(ValueError,'bounds'):p.validate(d)
        d=fixture('location');d['records'][0]['details']['location']['reference_evidence_id']='missing-map'
        with self.assertRaisesRegex(ValueError,'linked screenshot'):p.validate(d)
        d=fixture('location');d['records'][0]['details']['location'].update(coordinate_system='game_xy',x=-25,y=500)
        p.validate(d) # In-game XY does not pretend to be normalized or pixel data.

    def test_boss_pattern_needs_video_covering_actual_cue_and_impact(self):
        d=fixture('boss_pattern');d['records'][0]['verification']['status']='in_review'
        d['evidence'][0]['end_seconds']=2.5
        with self.assertRaisesRegex(ValueError,'covering cue through impact'):p.validate(d)
        d=fixture('boss_pattern');d['records'][0]['details']['boss_pattern']['impact_seconds']=1
        with self.assertRaisesRegex(ValueError,'impact must follow'):p.validate(d)

    def test_https_links_and_escaping_on_both_languages(self):
        for url in ('javascript:alert(1)','http://example.com/x','https://user:secret@example.com/x','https://example.com/"x','https://example.com/\\x'):
            d=fixture();d['evidence'][0]['url']=url
            with self.assertRaises(ValueError):p.validate(d)
        d=fixture();d['records'][0]['claim']=pair('<script>alert("XSS")</script>');approve(d)
        for ko in (False,True):
            markup=p.section(d,p.project(d),ko)
            self.assertNotIn('<script>alert',markup)
            self.assertIn('&lt;script&gt;',markup)
            self.assertIn('rel="noopener noreferrer"',markup)
            self.assertIn('data-playtest-id="synthetic-record"',markup)

    def test_import_is_idempotent_and_cannot_overwrite_or_approve(self):
        incoming=fixture();base=copy.deepcopy(incoming);base['records']=[];base['evidence']=[]
        merged=p.merge_drafts(base,incoming)
        self.assertEqual(p.merge_drafts(merged,incoming),merged)
        changed=copy.deepcopy(incoming);changed['records'][0]['claim']=pair('CHANGED')
        with self.assertRaisesRegex(ValueError,'overwrite'):p.merge_drafts(merged,changed)
        approve(incoming)
        with self.assertRaisesRegex(ValueError,'only unverified'):p.merge_drafts(base,incoming)
        self.assertEqual(base['records'],[])

    def test_import_requires_matching_release_build_and_checklist(self):
        d=fixture();other=copy.deepcopy(d);other['release']['active_build']='changed'
        with self.assertRaisesRegex(ValueError,'differs'):p.merge_drafts(d,other)

    def test_json_parser_rejects_ambiguous_duplicate_keys_and_nan(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'input.json'
            for content in ('{"records":[],"records":[1]}','{"value":NaN}'):
                path.write_text(content)
                with self.assertRaises(ValueError):p.load(path)

    def test_generation_is_idempotent_and_leaves_news_files_untouched(self):
        d=p.load(p.DATA)
        one=p.outputs(d);self.assertEqual(one,p.outputs(d))
        self.assertEqual(set(one),{p.PUBLIC,p.GAME/'demo/index.html',p.GAME/'demo/ko/index.html'})
        for path,body in one.items():self.assertEqual(path.read_text(),body)
        with tempfile.TemporaryDirectory() as directory:
            game=Path(directory);(game/'demo/ko').mkdir(parents=True)
            for name in ('demo/index.html','demo/ko/index.html'):(game/name).write_text(p.BEGIN+p.END)
            (game/'demo/ko/index.html').write_text('BROKEN MARKER')
            before=(game/'demo/index.html').read_text()
            with patch.object(p,'GAME',game):
                with self.assertRaisesRegex(ValueError,'markers'):p.outputs(d)
            self.assertEqual((game/'demo/index.html').read_text(),before)


if __name__=='__main__': unittest.main()
