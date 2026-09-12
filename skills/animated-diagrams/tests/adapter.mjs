import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDiagramAdapter} from '../assets/diagram-adapter.mjs';

function fixture(){
 const calls=[];
 const scene={meta:{duration:12},mount:(host,controls)=>{calls.push(['mount',host,controls]);return {
  render:(...args)=>calls.push(['render',...args]),reset:()=>calls.push(['reset']),stop:()=>calls.push(['stop']),destroy:()=>calls.push(['destroy'])};}};
 return {calls,scene};
}
test('narrated-player options preserve active playback and silent seeking',()=>{
 const {calls,scene}=fixture(),adapter=createDiagramAdapter(scene,{});adapter.mount('host');
 adapter.paint(3,{playing:true,seeking:false,rate:1});adapter.paint(6,{playing:true,seeking:true});adapter.paint(6,{playing:false,seeking:false});
 assert.deepEqual(calls.slice(1),[['render',3,{playing:true}],['render',6,{playing:false}],['render',6,{playing:false}]]);
});
test('mapped time clamps to the scene and invalid mappings fail visibly',()=>{
 const {calls,scene}=fixture(),adapter=createDiagramAdapter(scene,{},time=>time*2);adapter.mount('host');adapter.paint(-2);adapter.paint(10);
 assert.deepEqual(calls.slice(1),[['render',0,{playing:false}],['render',12,{playing:false}]]);
 assert.throws(()=>createDiagramAdapter(scene,{},()=>NaN).paint(2),/finite/);
});
test('remount, pause, reset and disposal reach the owned scene instance',()=>{
 const {calls,scene}=fixture(),adapter=createDiagramAdapter(scene,{});adapter.mount('first');adapter.stop();adapter.reset();adapter.mount('second');adapter.destroy();adapter.destroy();adapter.paint(1);
 assert.deepEqual(calls.map(call=>call[0]),['mount','stop','reset','destroy','mount','destroy']);
});
