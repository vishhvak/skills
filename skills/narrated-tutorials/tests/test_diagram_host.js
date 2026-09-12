const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createHost} = require('../assets/player/diagram-host.js');
function surface(){return {style:{},textContent:'',setAttribute(){},replaceChildren(){},remove(){this.removed=true;}};}
function host(){return {ownerDocument:{createElement:surface},replaceChildren(node){this.child=node;}};}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function scene(log){return {meta:{duration:20},mount:(surface,context)=>{log.push(['mount',context]);return {render:(...args)=>log.push(['render',...args]),stop:()=>log.push(['stop']),reset:()=>log.push(['reset']),destroy:()=>log.push(['destroy'])};}};}
const data = {diagramData:{module:'/scene.js',cues:[{id:'arrive',time:4}]}};
test('latest audio time sampled silently after import; subsequent frames run live',async()=>{
 const pending=deferred(),log=[],player=createHost({loadModule:()=>pending.promise});
 const mounted=player.mount(host(),data);player.paint(7,{playing:true,seeking:false});pending.resolve(scene(log));await mounted;
 assert.equal(log[0][1].cues[0].time,4);assert.deepEqual(log[1],['render',7,{playing:false,seeking:false}]);
 player.paint(7.1,{playing:true});assert.deepEqual(log.at(-1),['render',7.1,{playing:true}]);
 player.paint(3,{playing:true,seeking:true});assert.equal(log.at(-1)[2].playing,false);
});
test('old imports and old callbacks cannot affect a newly mounted section',async()=>{
 const old=deferred(),log=[],newlog=[],calls=[];let count=0;
 const player=createHost({loadModule:()=>++count===1?old.promise:Promise.resolve(scene(newlog))});
 const stale=player.mount(host(),data,{pause:()=>calls.push('old')});await player.mount(host(),data,{pause:()=>calls.push('new')});old.resolve(scene(log));await stale;assert.deepEqual(log,[]);
 const oldContext=newlog[0][1];player.destroy();oldContext.pause();assert.deepEqual(calls,[]);
});
test('stop/reset/disposal forward and late paint remains inert',async()=>{
 const log=[],player=createHost({loadModule:async()=>scene(log)});await player.mount(host(),data);player.stop();player.reset();player.destroy();const n=log.length;player.paint(9,{playing:true});assert.equal(log.length,n);assert.ok(log.some(x=>x[0]==='stop'));assert.ok(log.some(x=>x[0]==='reset'));assert.equal(log.at(-1)[0],'destroy');
});
test('failed module visibly fails instead of falling back to basic boxes',async()=>{
 const root=host(),errors=[],player=createHost({loadModule:async()=>({}),report:msg=>errors.push(msg)});await player.mount(root,data);assert.match(root.child.textContent,/Diagram unavailable/);assert.equal(errors.length,1);
});

test('invalid instance cleanup still displays the contract failure',async()=>{
 const root=host(),errors=[],player=createHost({loadModule:async()=>({meta:{duration:1},mount:()=>({render(){}})}),report:msg=>errors.push(msg)});
 await player.mount(root,data);assert.match(root.child.textContent,/must return render/);assert.equal(errors.length,1);player.destroy();
});
