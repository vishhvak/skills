import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSceneSound, SOUND_KINDS, SOUND_VOICES} from '../sound.js';
import {createSoundEvents} from '../sound-events.js';
import {SYNTH_VOICES} from '../sfx-voices.js';

function rig({suspended = false} = {}) {
  const sources = [], notices = [], gains = [];
  let allocations = 0, resume;
  const context = {
    state: suspended ? 'suspended' : 'running', sampleRate: 48000, destination: {},
    resume: () => new Promise(resolve => { resume = () => { context.state = 'running'; resolve(); }; }),
    close: () => { context.state = 'closed'; return Promise.resolve(); },
    createGain: () => { const gain = {gain:{value:1},connect(){},disconnect(){}}; gains.push(gain); return gain; },
    createBuffer: (_channels, length) => ({length, copyToChannel(){}}),
    createBufferSource: () => {
      const source = {started:false,stopped:false,connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};
      sources.push(source); return source;
    },
  };
  const sound = createSceneSound({createContext:()=>{allocations++;return context;},notify:notice=>notices.push(notice)});
  return {sound,sources,notices,gains,context,resume:()=>resume(),allocations:()=>allocations};
}
const config = () => ({kind:'reference-effects',events:{arrival:SOUND_VOICES[0]}});

test('source soundtrack configurations are rejected instead of played', async () => {
  assert.deepEqual(SOUND_KINDS,['silent','reference-effects']);
  for (const value of [{kind:'reference-audio',track:'audio/nodes.m4a'}, {...config(),track:'clip.mp4'}, {...config(),cues:[]}, {kind:'reference-effects',events:{arrival:'unknown'}}]) {
    const r=rig(); r.sound.configure(value); r.sound.play(); await r.sound.effect('arrival');
    assert.equal(r.allocations(),0);
  }
});
test('silent scenes never allocate audio, including manual events and settings', async () => {
  for (const value of [{kind:'silent'}, {kind:'silent',events:{arrival:SOUND_VOICES[0]}}, {}]) {
    const r=rig();r.sound.configure(value);r.sound.play();r.sound.seek(8);r.sound.setEnabled(false);r.sound.setEnabled(true);r.sound.setVolume(1);
    await r.sound.effect('arrival');assert.equal(r.allocations(),0);
  }
});
test('configure, play and seek never emit sounds without scene events', () => {
  const r=rig();r.sound.configure(config());assert.equal(r.allocations(),0);r.sound.play();r.sound.seek(4);
  assert.equal(r.sources.length,0);
});
test('only mapped semantic events play, at the moment requested', async () => {
  const r=rig();r.sound.configure(config());await r.sound.prepare();await r.sound.effect('click');assert.equal(r.sources.length,0);
  await r.sound.effect('arrival');assert.equal(r.sources.length,1);assert.equal(r.sources[0].started,true);
  await r.sound.effect('arrival');assert.equal(r.sources.length,2);
});
test('pause, seek, scene switch and destroy cancel active sounds', async () => {
  for (const action of [sound=>sound.pause(),sound=>sound.seek(8),sound=>sound.configure({kind:'silent'}),sound=>sound.destroy()]) {
    const r=rig();r.sound.configure(config());await r.sound.prepare();await r.sound.effect('arrival');action(r.sound);
    assert.equal(r.sources[0].stopped,true);
  }
});
test('a delayed audio unlock cannot emit after cancellation', async () => {
  for (const action of [sound=>sound.pause(),sound=>sound.seek(8),sound=>sound.configure({kind:'silent'}),sound=>sound.setEnabled(false),sound=>sound.destroy()]) {
    const r=rig({suspended:true});r.sound.configure(config());const pending=r.sound.prepare();
    r.sound.effect('arrival');action(r.sound);r.resume();await pending;assert.equal(r.sources.length,0);
  }
});
test('mute stops ongoing effects and unmute does not replay them', async () => {
  const r=rig();r.sound.configure(config());await r.sound.prepare();await r.sound.effect('arrival');r.sound.setEnabled(false);
  await r.sound.effect('arrival');assert.equal(r.sources.length,1);assert.equal(r.sources[0].stopped,true);
  r.sound.setEnabled(true);assert.equal(r.sources.length,1);await r.sound.effect('arrival');assert.equal(r.sources.length,2);
});
test('volume changes apply to output and zero volume cancels sound', async () => {
  const r=rig();r.sound.configure(config());r.sound.setVolume(.3);await r.sound.prepare();await r.sound.effect('arrival');assert.equal(r.gains[0].gain.value,.3);
  r.sound.setVolume(0);assert.equal(r.sources[0].stopped,true);await r.sound.effect('arrival');assert.equal(r.sources.length,1);
});
test('destroy is final', async () => {
  const r=rig();r.sound.configure(config());await r.sound.prepare();await r.sound.effect('arrival');r.sound.destroy();
  r.sound.configure(config());await r.sound.prepare();await r.sound.effect('arrival');assert.equal(r.sources.length,1);assert.equal(r.context.state,'closed');
});
test('synthesized effects are deterministic finite quiet one-shots', () => {
  assert.ok(SOUND_VOICES.length>0);
  for (const voice of Object.values(SYNTH_VOICES)) {
    const samples=voice.render(48000), again=voice.render(48000);
    assert.deepEqual(samples,again);assert.ok(samples.length>0 && samples.length<48000);
    assert.ok(samples.every(Number.isFinite));
    const peak=samples.reduce((max,n)=>Math.max(max,Math.abs(n)),0);
    assert.ok(peak>0 && peak<.1,`Unexpected peak ${peak}`);
  }
});
test('rendering a state repeatedly produces one sound on entry', () => {
  const heard=[],events=createSoundEvents(event=>heard.push(event));
  events.sample(0,[]);events.sample(.1,[{key:'node:kit',event:'arrival'}],true);
  events.sample(.2,[{key:'node:kit',event:'arrival'}],true);assert.deepEqual(heard,['arrival']);
  events.sample(.3,[],true);events.sample(.4,[{key:'node:dax',event:'arrival'}],true);assert.deepEqual(heard,['arrival','arrival']);
});
test('scrubbing, backward seeking and long frame gaps do not burst old events', () => {
  const heard=[],events=createSoundEvents(event=>heard.push(event)),arrival=[{key:'arrival',event:'arrival'}];
  events.sample(0,[]);events.sample(4,arrival);events.sample(4.02,arrival,true);
  events.sample(2,[],true);events.sample(9,arrival,true);assert.deepEqual(heard,[]);
  events.reset();events.sample(0,[]);events.sample(.1,arrival,true);assert.deepEqual(heard,['arrival']);
});

test('a late successful unlock drops historical events even without cancellation', async () => {
  const r=rig({suspended:true});r.sound.configure(config());const pending=r.sound.prepare();
  r.sound.effect('arrival');r.sound.effect('arrival');r.resume();await pending;
  assert.equal(r.sources.length,0);r.sound.effect('arrival');assert.equal(r.sources.length,1);
});
test('blocked audio preparation returns so manual UI can proceed silently', async () => {
  const r=rig({suspended:true});r.sound.configure(config());assert.equal(await r.sound.prepare(),false);
  r.sound.effect('arrival');assert.equal(r.sources.length,0);r.resume();
});
