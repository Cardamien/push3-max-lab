// push-bank-probe.js (v8, ES2022). Probe: what can a Max for Live device learn, from inside Live, about the Push 3's
// current parameter page (bank), about whether this device is the one shown on the Push, and about the Push's view?
// Inlet 0: bang (live.thisdevice at load), "count n" (live.banks answer), "probe" (run the survey again), "dump".
// Outlet 0 -> [live.banks]; outlets 1-4 -> [live.comment] readout lines (set <text>); everything is also posted.
inlets = 1;
outlets = 5;

const TAG = '[bank-probe]';
const now = () => new Date().toISOString().slice(11, 23);
const BANKS = [
  ['Bank A', 'Probe 1', 'Probe 2', 'Probe 3', 'Probe 4', 'Probe 5', 'Probe 6', 'Probe 7', 'Probe 8'],
  ['Bank B', 'Probe 9', 'Probe 10', 'Probe 11', 'Probe 12', 'Probe 13', 'Probe 14', 'Probe 15', 'Probe 16'],
  ['Bank C', 'Probe 17', 'Probe 18', 'Probe 19', 'Probe 20', '-', '-', '-', '-'],
];

// folder of this device: in Live, patcher.filepath is the device's folder (no file name); elsewhere it ends with the file
const FP = String(this.patcher?.filepath ?? '');
const HERE = !FP ? '' : /\.[^/]*$/.test(FP) ? FP.replace(/[^/]+$/, '') : FP.replace(/\/?$/, '/');
const LOG_PATH = HERE + 'probe-log.txt';
const log = (...a) => {
  const text = a.join(' ');
  post(TAG, text, '\n');
  try {                                   // also append to a file, so the run can be read without the Max window
    const f = new File(LOG_PATH, 'readwrite', 'TEXT');
    if (!f.isopen) f.open();
    if (f.isopen) { f.position = f.eof; f.writeline(`${now()} ${text}`); f.close(); }
  } catch (e) { /* no file logging in this host */ }
};
const line = (n, text) => outlet(n, 'set', String(text).slice(0, 120));

const state = { thisId: null, pushId: null, selectedId: null, observers: [], changes: 0, bankSlots: [], lastEncoder: null, lastParam: null, armedAt: 0, paramIndex: new Map(), page: null };

// ---------------------------------------------------------------- banks (rebuilt at every load: Live only has the parameter hub)
function bang() {
  outlet(0, 'getcount');
  new Task(probe, this).schedule(1500);
}

function count(n) {
  BANKS.forEach((bank, i) => outlet(0, [n > i ? 'edit' : 'new', i, ...bank]));
  log(`banks: ${n} existed, ${BANKS.length} written`);
}

// ---------------------------------------------------------------- LiveAPI helpers
const api = (path, cb = null) => {
  try { return new LiveAPI(cb, path); } catch (e) { log(`LiveAPI(${path}) failed: ${e.message}`); return null; }
};
const byId = (id, cb = null) => { const o = api('live_app', cb); if (o) o.id = id; return o; };
const idOf = (o) => (o ? Number(String(o.id).replace(/\D/g, '')) : null);
const ids = (list) => { const out = []; for (let i = 0; i < list.length; i += 1) if (list[i] === 'id') out.push(Number(list[i + 1])); return out; };
const infoLines = (o) => String(o.info ?? '').split('\n').filter((l) => l.trim());

function describe(label, o) {
  if (!o) return { props: [], children: [], funcs: [] };
  const lines = infoLines(o);
  const props = [], children = [], funcs = [];
  for (const l of lines) {
    const [kind, name, ...rest] = l.trim().split(/\s+/);
    if (kind === 'property') props.push({ name, rest: rest.join(' ') });
    else if (kind === 'child' || kind === 'children') children.push({ name, rest: rest.join(' ') });
    else if (kind === 'function') funcs.push(name);
  }
  log(`${label}: id ${o.id} type ${o.type} path ${o.path}`);
  log(`${label} properties: ${props.map((p) => `${p.name}(${p.rest})`).join(', ')}`);
  log(`${label} children: ${children.map((c) => `${c.name}(${c.rest})`).join(', ')}`);
  log(`${label} functions: ${funcs.join(', ')}`);
  return { props, children, funcs };
}

// observe every observable property of an object and log each change
function watchAll(label, o, d) {
  for (const p of d.props) {
    const w = byId(idOf(o), (args) => onChange(label, p.name, args));
    if (!w) continue;
    try { w.property = p.name; state.observers.push(w); } catch (e) { log(`${label}.${p.name}: observe failed ${e.message}`); }
  }
}

function onChange(label, prop, args) {
  const a = Array.isArray(args) ? args : [args];
  if (a[0] === 'id' || a[0] === prop) a.shift();               // observer callbacks start with the property name
  state.changes += 1;
  const text = `${now()} ${label}.${prop} = ${a.join(' ')}`;
  log('CHANGE', text);
  line(3, text);
  // pairing window: Live may deliver the parameter change before or after the encoder event
  const enc = /^ctl:Track_Control_(\d)$/.exec(label);
  if (enc) {
    state.lastEncoder = { k: Number(enc[1]), t: Date.now() };
    if (state.lastParam && Date.now() - state.lastParam.t < 300) infer(state.lastEncoder.k, state.lastParam.p);
  }
  const par = /^param:(\d+)$/.exec(label);
  if (par && Date.now() - state.armedAt > 1000) {            // skip the callback every observer fires when armed
    state.lastParam = { p: Number(par[1]), t: Date.now() };
    if (state.lastEncoder && Date.now() - state.lastEncoder.t < 300) infer(state.lastEncoder.k, state.lastParam.p);
  }
  if (label === 'songview' && prop === 'selected_track') {
    const tid = Number(a.find((x) => typeof x === 'number' || /^\d+$/.test(String(x))));
    const t = tid ? byId(tid) : null; log(`selected track ${tid}: name "${t?.get('name')}" path ${t?.path}`);
  }
  if (label === 'trackview' && prop === 'selected_device') {
    const selId = Number(a.find((x) => typeof x === 'number' || /^\d+$/.test(String(x))));
    if (selId && selId !== state.thisId) { const d = byId(selId); log(`selected device ${selId}: name "${d?.get('name')}" class ${d?.get('class_name')} path ${d?.path}`); }
    state.selectedId = selId;
    const selected = selId === state.thisId;
    line(2, `${selected ? 'THIS device is selected' : `other device selected (id ${selId})`} at ${now()}`);
  }
}

// ---------------------------------------------------------------- the survey
function probe() {
  state.observers = [];
  const me = api('this_device');
  state.thisId = idOf(me);
  removeOlderInstances(me);
  log(`this_device id ${state.thisId}, name ${me?.get('name')}, class ${me?.get('class_name')}`);
  const meInfo = describe('this_device', me);
  watchAll('this_device', me, meInfo);
  const meView = api('this_device view');
  if (meView && idOf(meView)) watchAll('this_device.view', meView, describe('this_device.view', meView));

  // control surfaces
  const app = api('live_app');
  const csIds = ids(app.get('control_surfaces'));
  log(`control_surfaces: ${csIds.length} entries, ids ${csIds.join(' ')}`);
  let pushLabel = 'no Push found';
  csIds.forEach((id, i) => {
    if (!id) { log(`control_surfaces ${i}: empty slot`); return; }
    const cs = byId(id);
    const d = describe(`cs${i}`, cs);
    let names = [];
    try { names = cs.call('get_control_names') ?? []; } catch (e) { log(`cs${i} get_control_names failed ${e.message}`); }
    log(`cs${i} control names (${names.length}): ${names.slice(0, 40).join(' ')}${names.length > 40 ? ' ...' : ''}`);
    if (/push/i.test(cs.type) || names.some((n) => /Push|Encoder|Pad/.test(n))) {
      state.pushId = id;
      pushLabel = `${cs.type} id ${id}, ${names.length} controls, ${d.props.length} props, ${d.children.length} children`;
      watchAll(`cs${i}`, cs, d);
      for (const c of d.children) {                           // one level down: components, controls, whatever is listed
        const child = api(`${cs.path.replace(/"/g, '')} ${c.name}`);
        if (child && idOf(child)) watchAll(`cs${i}.${c.name}`, child, describe(`cs${i}.${c.name}`, child));
      }
    }
  });
  line(1, `Push: ${pushLabel}`);

  // selection: Live's selected device on the selected track (the Push's device selection follows it)
  const songView = api('live_set view', (args) => { onChange('songview', 'selected_track', args); rewatchTrackView(); });
  songView.property = 'selected_track';
  state.observers.push(songView);
  rewatchTrackView();
  const appView = api('live_app view');
  if (appView) watchAll('app.view', appView, describe('app.view', appView));
  banks();
  cs();
  controls();
  watchParams();
  log(`survey done: ${state.observers.length} observers armed; page banks on the Push now`);
  new Task(select, this).schedule(500);
  new Task(() => {                           // what did the selection do, and what does the Push show
    const sel = ids(api('live_set view selected_track view').get('selected_device'))[0];
    log(`after select: selected_device ${sel} (${sel === state.thisId ? 'THIS' : 'other'}), pad_layout "${byId(state.pushId)?.get('pad_layout')}"`);
    banks();
  }, this).schedule(1500);
  line(4, `${state.observers.length} observers armed ${now()}; page the Push banks`);
}

let trackViewWatcher = null;
function rewatchTrackView() {
  trackViewWatcher = api('live_set view selected_track view', (args) => onChange('trackview', 'selected_device', args));
  if (!trackViewWatcher) return;
  trackViewWatcher.property = 'selected_device';
  const sel = ids(trackViewWatcher.get('selected_device'))[0];
  state.selectedId = sel ?? null;
  line(2, `${sel === state.thisId ? 'THIS device is selected' : `other device selected (id ${sel})`} at ${now()}`);
}

function removeOlderInstances(me) {       // keep one probe per track: delete earlier PushBankProbe instances
  const track = api(String(me.path).replace(/"/g, '').replace(/ devices \d+$/, ''));
  if (!track) return;
  const devs = ids(track.get('devices'));
  for (let i = devs.length - 1; i >= 0; i -= 1) {
    if (devs[i] === state.thisId) continue;
    const d = byId(devs[i]);
    if (d && String(d.get('name')) === 'PushBankProbe') { track.call('delete_device', i); log(`deleted older instance id ${devs[i]} at index ${i}`); }
  }
}

function select() {                         // make Live (and so the Push) show this device
  const v = api('live_set view');
  if (v && state.thisId) { v.call('select_device', 'id', state.thisId); log('select_device called'); }
}

function banks() {                          // the static bank definitions Live exposes
  const me = api('this_device');
  const n = Number(me.call('get_bank_count'));
  log(`get_bank_count ${n}`);
  state.bankSlots = [];
  for (let i = 0; i < n; i += 1) {
    const slots = [].concat(me.call('get_bank_parameters', i)).map(Number);
    state.bankSlots.push({ name: String(me.call('get_bank_name', i)), slots });
    log(`bank ${i}: name "${state.bankSlots[i].name}" params ${JSON.stringify(slots)}`);
  }
  log(`parameters: ${JSON.stringify(me.get('parameters')).slice(0, 300)}`);
}

function cs() {                             // the Push 3 control surface's own readable properties
  if (!state.pushId) { log('no Push id'); return; }
  const p = byId(state.pushId);
  log(`cs pad_layout="${p.get('pad_layout')}" type_name="${p.get('type_name')}" timer_instance=${p.get('timer_instance')} mxd_midi_scheduler=${p.get('mxd_midi_scheduler')}`);
}

function controls() {                      // every Push control name, then observe the encoder and touch controls
  if (!state.pushId) { log('no Push id'); return; }
  const p = byId(state.pushId);
  const names = (p.call('get_control_names') ?? []).filter((n) => n !== 'control' && n !== 'control_names' && !/^\d+$/.test(String(n)));
  log(`all control names (${names.length}): ${names.join(' ')}`);
  const wanted = names.filter((n) => /Encoder|Touch|Knob|Track_Control|Track_Select_Button|Track_State_Button|Page_|Device_Mode|Tempo|Volume/i.test(n));
  log(`observing ${wanted.length}: ${wanted.join(' ')}`);
  for (const n of wanted) {
    const r = p.call('get_control_by_name', n);
    const cid = ids(Array.isArray(r) ? r : [r])[0];
    if (!cid) { log(`${n}: no id (${r})`); continue; }
    const c = byId(cid, (args) => onChange(`ctl:${n}`, 'value', args));
    try { c.property = 'value'; state.observers.push(c); } catch (e) { log(`${n}: observe failed ${e.message}`); }
    if (n === wanted[0]) describe(`ctl:${n}`, c);
  }
  log(`observers now ${state.observers.length}`);
}

function infer(k, p) {
  if (state.lastInfer && state.lastInfer.k === k && state.lastInfer.p === p && Date.now() - state.lastInfer.t < 300) return;
  state.lastInfer = { k, p, t: Date.now() };                     // encoder k turned and parameter p moved: the bank whose slot k holds p is on screen
  const hits = state.bankSlots.map((b, i) => ({ i, b })).filter(({ b }) => b.slots[k] === p);
  const text = hits.length ? `page ${hits.map(({ i, b }) => `${i} "${b.name}"`).join(' or ')} (encoder ${k + 1} moved parameter ${p})` : `no bank has parameter ${p} in slot ${k + 1}`;
  if (hits.length === 1) state.page = hits[0].i;
  log('INFER', text);
  line(4, `${now()} ${text}`);
}

function watchParams() {                   // observe every parameter of this device (index = position in device.parameters)
  const me = api('this_device');
  ids(me.get('parameters')).forEach((pid, idx) => {
    const w = byId(pid, (args) => onChange(`param:${idx}`, 'value', args));
    if (w) { w.property = 'value'; state.observers.push(w); }
  });
  state.armedAt = Date.now();
  log(`parameter observers armed, observers now ${state.observers.length}`);
}

// NOT CALLED: store_chosen_bank(6, 2) from this device crashed Live 12.4.15 (SIGSEGV at 0x38 on the main thread,
// mfl_device_api_dohandlemessage -> Live's Python binding), 2026-10-30, virtual Push. Kept as a record only.
function chosenBankTest() {                 // does Device.store_chosen_bank(script_index, bank) move the Push page?
  const me = api('this_device');
  const csIds = ids(api('live_app').get('control_surfaces'));
  const slot = csIds.findIndex((id) => id && byId(id).type === 'Push3');
  const steps = [[slot, 2], [slot, 1], [slot, 0], [0, 2]];   // script index = control-surface slot; then slot 0 as a control
  steps.forEach(([script, bank], i) => new Task(() => {
    try { me.call('store_chosen_bank', script, bank); log(`CHOSEN store_chosen_bank(${script}, ${bank}) called`); }
    catch (e) { log(`CHOSEN store_chosen_bank(${script}, ${bank}) failed ${e.message}`); }
  }, this).schedule(4000 + i * 4000));
}

function dump() {
  log(`this ${state.thisId}, push ${state.pushId}, selected ${state.selectedId}, changes ${state.changes}, observers ${state.observers.length}`);
}
