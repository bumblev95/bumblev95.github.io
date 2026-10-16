/* Browser drafts are always unverified. Repository validation is authoritative. */
export const storageKey = 'players-codex:archeage:playtest-drafts:v1';
export const stable = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const fail = message => { throw new Error(message); };
export function safeURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password && (!u.port || u.port === '443') && !/[\s\\<>"\x00-\x1f]/.test(value);
  } catch { return false; }
}
export function canonicalURL(value) {
  const u = new URL(value);
  if (['youtu.be','www.youtu.be'].includes(u.hostname)) return 'https://youtube.com/watch?v=' + u.pathname.replace(/^\/|\/$/g,'');
  if (['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)) {
    const id = u.pathname === '/watch' ? u.searchParams.get('v') : u.pathname.match(/^\/(?:shorts|embed)\/([\w-]+)\/?$/)?.[1];
    if (id) return 'https://youtube.com/watch?v=' + id;
  }
  u.hash = '';
  const tracking = ['si','feature','ref','fbclid','gclid'];
  for (const key of [...u.searchParams.keys()]) if (key.toLowerCase().startsWith('utm_') || tracking.includes(key.toLowerCase())) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString();
}
export const mediaKey = e => stable([canonicalURL(e.url), e.start_seconds, e.end_seconds]);
export const factKey = r => stable([r.release_id, r.kind, r.subject_id, r.fact_key,
  ...['build','region','channel','class_id','weapon_id','level','variant'].map(k => r.context[k])]);
export const emptyBundle = meta => ({schema_version:meta.schema_version,game:meta.game,
  release:structuredClone(meta.release),checklist:structuredClone(meta.checklist),evidence:[],records:[]});

export function checkSchema(value, spec, root = spec, path = '$') {
  if (spec.$ref) return checkSchema(value, root.$defs[spec.$ref.replace('#/$defs/','')],root,path);
  if (spec.anyOf) {
    if (spec.anyOf.some(s => {try {checkSchema(value,s,root,path); return true;} catch {return false;}})) return;
    fail(`${path}: invalid value`);
  }
  const types = {object:v=>v!==null && typeof v==='object' && !Array.isArray(v),array:Array.isArray,
    string:v=>typeof v==='string',null:v=>v===null,number:v=>typeof v==='number' && Number.isFinite(v),integer:Number.isInteger};
  if (spec.type && !types[spec.type](value)) fail(`${path}: expected ${spec.type}`);
  if ('const' in spec && value !== spec.const) fail(`${path}: wrong constant`);
  if (spec.enum && !spec.enum.includes(value)) fail(`${path}: unsupported value`);
  if (spec.type === 'object') {
    for (const key of spec.required || []) if (!Object.hasOwn(value,key)) fail(`${path}.${key}: missing field`);
    for (const [key,v] of Object.entries(value)) {
      if (spec.additionalProperties === false && !Object.hasOwn(spec.properties,key)) fail(`${path}.${key}: unknown field`);
      if (Object.hasOwn(spec.properties || {},key)) checkSchema(v,spec.properties[key],root,`${path}.${key}`);
    }
  }
  if (Array.isArray(value)) {
    if (value.length > (spec.maxItems ?? Infinity)) fail(`${path}: too many items`);
    value.forEach((v,i)=>checkSchema(v,spec.items,root,`${path}[${i}]`));
  }
  if (typeof value === 'string') {
    if (value.length > (spec.maxLength ?? Infinity)) fail(`${path}: too long`);
    if (spec.pattern && !new RegExp(spec.pattern).test(value)) fail(`${path}: invalid ID or hash`);
    if (spec.format === 'date-time' && (!/T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)))) fail(`${path}: invalid timestamp`);
    if (spec.format === 'https-url' && !safeURL(value)) fail(`${path}: public HTTPS source required`);
  }
  if (typeof value === 'number' && (value < (spec.minimum ?? -Infinity) || value > (spec.maximum ?? Infinity))) fail(`${path}: out of bounds`);
}

export function validateDrafts(bundle, schema, meta, now = Date.now()) {
  checkSchema(bundle,schema);
  for (const k of ['schema_version','game','release','checklist']) if (stable(bundle[k]) !== stable(meta[k])) fail('Draft metadata differs from the current demo. Export the old draft and update it in the repository.');
  const unique = (xs,label) => {if(new Set(xs).size!==xs.length) fail(`Duplicate ${label}`);};
  unique(bundle.records.map(r=>r.id),'record ID'); unique(bundle.evidence.map(e=>e.id),'evidence ID');
  unique(bundle.records.map(factKey),'fact for this build/context'); unique(bundle.evidence.map(mediaKey),'media source/clip');
  unique(bundle.evidence.filter(e=>e.sha256).map(e=>stable([e.sha256,e.start_seconds,e.end_seconds])),'media checksum/clip');
  const sources = new Map(bundle.evidence.map(e=>[e.id,e]));
  const inWindow = t => t === null || (Date.parse(t)>=Date.parse(bundle.release.starts_at) && Date.parse(t)<=Math.min(Date.parse(bundle.release.ends_at),now));
  for (const e of bundle.evidence) {
    if (e.origin !== 'gameplay') fail('Draft form accepts gameplay evidence only.');
    if (!inWindow(e.captured_at)) fail('Capture must be within the demo and cannot be in the future.');
    if (e.kind==='video' && (e.start_seconds===null || e.end_seconds===null || e.end_seconds<=e.start_seconds)) fail('Video clip start/end required.');
    if (e.kind==='screenshot' && (e.start_seconds!==null || e.end_seconds!==null)) fail('Screenshot cannot have video timestamps.');
  }
  for (const r of bundle.records) {
    if (stable(r.verification)!==stable({status:'unverified',review:null})) fail('Browser imports accept unverified drafts only.');
    if (r.release_id!==bundle.release.id || !bundle.checklist.find(t=>t.id===r.target_id)?.kinds.includes(r.kind)) fail('Invalid checklist target/type.');
    if (!inWindow(r.observed_at)) fail('Observation must be within the demo and cannot be in the future.');
    unique(r.evidence_ids,'evidence reference');
    for (const id of r.evidence_ids) if (!sources.has(id)) fail('Missing evidence reference.');
    const allowed={class:['weapons'],skill:['measurements'],stat:['measurements'],trait:['prerequisite_ids'],location:['location'],collectible:['location'],boss_pattern:['boss_pattern'],channel:['transition']}[r.kind];
    if(Object.keys(r.details).some(k=>!allowed.includes(k))) fail('Details do not match the observation type.');
    for(const key of ['weapons','prerequisite_ids']) if(r.details[key]) unique(r.details[key],key);
    if(r.details.measurements) unique(r.details.measurements.map(m=>m.metric),'measurement metric');
    if(r.details.boss_pattern && r.details.boss_pattern.impact_seconds<=r.details.boss_pattern.cue_seconds) fail('Boss impact must follow the cue.');
    if(r.details.transition && r.details.transition.from===r.details.transition.to) fail('Channel switch needs two different channels.');
    const loc = r.details.location;
    if (loc) {
      if (!r.evidence_ids.includes(loc.reference_evidence_id) || sources.get(loc.reference_evidence_id)?.kind!=='screenshot') fail('A map position needs its reference screenshot.');
      if (loc.coordinate_system==='normalized_0_1' && (loc.x<0 || loc.x>1 || loc.y<0 || loc.y>1)) fail('Normalized coordinates must be between 0 and 1.');
      if(loc.coordinate_system!=='map_pixels' && (loc.reference_width!==null || loc.reference_height!==null)) fail('Pixel dimensions belong only to map pixel coordinates.');
      if (loc.coordinate_system==='map_pixels' && (!(loc.reference_width>0 && loc.reference_height>0) || loc.x<0 || loc.x>loc.reference_width || loc.y<0 || loc.y>loc.reference_height)) fail('Map pixel coordinates need dimensions and valid bounds.');
    }
  }
  return bundle;
}

export function mergeDrafts(current, incoming, schema, meta) {
  validateDrafts(incoming,schema,meta);
  const result = structuredClone(current);
  for (const key of ['evidence','records']) {
    const byId = new Map(result[key].map(i=>[i.id,i]));
    for (const item of incoming[key]) {
      if (byId.has(item.id) && stable(byId.get(item.id))!==stable(item)) fail('Conflicting draft ID; existing draft was kept.');
      if (!byId.has(item.id)) result[key].push(structuredClone(item));
    }
  }
  return validateDrafts(result,schema,meta);
}

export function observation(values, meta, bundle, id = () => crypto.randomUUID()) {
  const v = key => String(values[key] ?? '').trim();
  const num = key => v(key)==='' ? null : Number(v(key));
  const date = key => v(key) ? new Date(v(key)).toISOString() : null;
  const pair = key => ({en:v(key+'_en'),ko:v(key+'_ko')});
  const list = key => v(key) ? v(key).split(',').map(s=>s.trim()).filter(Boolean) : [];
  if (!Object.values(pair('title')).some(Boolean) || !Object.values(pair('claim')).some(Boolean)) fail('Enter a title and an actual observation in at least one language.');
  const record = {id:'r-'+id(),release_id:meta.release.id,target_id:v('target_id'),kind:v('kind'),
    subject_id:v('subject_id'),fact_key:v('fact_key'),title:pair('title'),claim:pair('claim'),
    recorded_by:v('recorded_by'),observed_at:date('observed_at'),
    context:{build:v('build'),region:v('region'),channel:v('channel'),class_id:v('class_id')||null,
      weapon_id:v('weapon_id')||null,level:num('level'),variant:v('variant')},
    details:{},evidence_ids:[],verification:{status:'unverified',review:null}};
  let evidence;
  if (v('source_url')) {
    if (!safeURL(v('source_url'))) fail('Use a public HTTPS media source.');
    evidence = {id:'e-'+id(),kind:v('evidence_kind'),origin:'gameplay',url:v('source_url'),creator:v('creator'),
      caption:pair('caption'),captured_at:date('captured_at'),build:v('build'),sha256:v('sha256')||null,
      start_seconds:v('evidence_kind')==='video'?num('start_seconds'):null,
      end_seconds:v('evidence_kind')==='video'?num('end_seconds'):null};
    const existing = [...bundle.evidence,...meta.evidence].find(e=>mediaKey(e)===mediaKey(evidence) || (e.sha256 && e.sha256===evidence.sha256 && e.start_seconds===evidence.start_seconds && e.end_seconds===evidence.end_seconds));
    if (existing) {
      if (existing.kind!==evidence.kind || existing.build!==evidence.build ||
          (existing.sha256 && evidence.sha256 && existing.sha256!==evidence.sha256) ||
          (existing.captured_at && evidence.captured_at && existing.captured_at!==evidence.captured_at)) fail('Source already exists with different media/build information.');
      evidence=existing;
    }
    record.evidence_ids=[evidence.id];
  }
  const d=record.details;
  if(record.kind==='class' && v('weapons')) d.weapons=list('weapons');
  if(['skill','stat'].includes(record.kind) && ['metric','value','unit','conditions_en','conditions_ko'].some(k=>v(k))) {
    if(!v('metric') || num('value')===null || !v('unit')) fail('Complete the measurement metric, value and unit.');
    d.measurements=[{metric:v('metric'),value:num('value'),unit:v('unit'),conditions:pair('conditions')}];
  }
  if(record.kind==='trait') d.prerequisite_ids=list('prerequisite_ids');
  if(['location','collectible'].includes(record.kind) && ['map_id','x','y'].some(k=>v(k))) {
    if(!v('map_id') || num('x')===null || num('y')===null || evidence?.kind!=='screenshot') fail('Complete map ID, X/Y and the reference screenshot.');
    d.location={map_id:v('map_id'),coordinate_system:v('coordinate_system'),x:num('x'),y:num('y'),reference_evidence_id:evidence.id,
      reference_width:v('coordinate_system')==='map_pixels'?num('reference_width'):null,
      reference_height:v('coordinate_system')==='map_pixels'?num('reference_height'):null};
  }
  if(record.kind==='boss_pattern' && ['boss_id','phase','cue_seconds','impact_seconds','cue_ko','cue_en','response_ko','response_en'].some(k=>v(k))) {
    if(!v('boss_id') || num('cue_seconds')===null || num('impact_seconds')===null) fail('Complete boss ID and cue/impact timestamps.');
    d.boss_pattern={boss_id:v('boss_id'),phase:v('phase'),cue:pair('cue'),response:pair('response'),cue_seconds:num('cue_seconds'),impact_seconds:num('impact_seconds')};
  }
  if(record.kind==='channel') d.transition={from:v('channel_from'),to:v('channel_to')};
  const result=structuredClone(bundle);
  if (meta.records.some(r=>factKey(r)===factKey(record))) fail('This observation already exists in the repository. Add evidence to that record through a reviewed PR.');
  result.records.push(record);
  if(evidence && !result.evidence.some(e=>e.id===evidence.id)) result.evidence.push(evidence);
  return result;
}
