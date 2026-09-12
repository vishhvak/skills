import {test} from 'node:test';
import assert from 'node:assert/strict';
import {replayState, rowEntrance, timerValue, timerReels, timerRate} from '../scenes/registry-motion.js';
import {distortionState, displacementMap} from '../scenes/registry-distortion.js';

test('request holds at lower port then travels upward once',()=>{
 assert.equal(replayState(.7).input,1);
 assert.ok(replayState(1.08).input<replayState(1.01).input);
 assert.equal(replayState(1.3).input,null);
});
test('delivery and row reveal are distinct phases',()=>{
 assert.equal(replayState(2.6).dev,null);
 assert.ok(replayState(3.2).dev>0&&replayState(3.2).dev<1);
 assert.equal(replayState(3.6).present,false);
 assert.equal(replayState(3.8).present,true);
 assert.ok(rowEntrance(4.1,3.72,0).opacity>rowEntrance(4.1,3.72,5).opacity);
});
test('policy travels to table before status finishes',()=>{
 assert.ok(replayState(5.7).policyPulse>0);
 assert.equal(replayState(6.17).policyStatus.busy,true);
 assert.equal(replayState(6.65).policyStatus.check,true);
});
test('availability stays filtered until delivered refresh and returns on new reveal',()=>{
 assert.deepEqual(replayState(7).targets,[0,0,0,0,1,1]);
 assert.deepEqual(replayState(10).targets,[0,0,0,0,1,1]);
 assert.deepEqual(replayState(13).targets,[1,1,1,1,1,1]);
 assert.deepEqual(replayState(21).targets,[1,1,1,1,1,1]);
});
test('countdown holds then drains linearly',()=>{
 assert.equal(timerValue(8.24),3596);
 assert.equal(timerValue(9),1798);
 assert.equal(timerValue(9.75),0);
 assert.equal(timerValue(10),null);
});
test('wave persists beyond rows disappearing and repeats',()=>{
 assert.equal(replayState(15.95).present,false);
 assert.ok(distortionState(16.15).amount>0);
 assert.equal(distortionState(16.38).amount,0);
 for(const time of [15.25,15.55,15.9,16.2]){
  const a=distortionState(time),b=distortionState(time+16.75);
  assert.ok(Math.abs(a.amount-b.amount)<1e-10);
  assert.ok(Math.abs(a.offsetY-b.offsetY)<1e-9);
 }
 assert.ok(displacementMap().startsWith('data:image/svg+xml,'));
});
test('sampling remains deterministic and finite throughout the clip',()=>{
 for(let time=0;time<=33.92;time+=1/60){
  const first=replayState(time);replayState(2);assert.deepEqual(replayState(time),first);
  for(const [key,value]of Object.entries(first))if(typeof value==='number')assert.ok(Number.isFinite(value),key);
  assert.ok(first.weights.every(value=>value>=0&&value<=1));
 }
});

test('accelerated countdown moves each reel from its own continuous place value',()=>{
 const a=timerReels(timerValue(8.5),timerRate(8.5)),b=timerReels(timerValue(8.5+1/60),timerRate(8.5+1/60));
 assert.notEqual(a[3].offset,b[3].offset);
 assert.equal(a[2].from,':');assert.equal(a[2].offset,0);
 assert.ok(timerReels(0,2397).every(reel=>reel.to==='0'||reel.to===':'));
});
