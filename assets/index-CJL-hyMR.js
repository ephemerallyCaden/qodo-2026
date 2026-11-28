const Ke={snapshot:"/api/snapshot",layout:"/api/layout",fog:"/api/fog",drones:"/api/drones",droneDetail:"/api/drone-detail",beacons:"/api/beacons",cochange:"/api/cochange",crew:"/api/crew",crewDetail:"/api/crew-detail",unseen:"/api/unseen",diff:"/api/diff"},t0="star",ao=n=>typeof n=="object"&&n!==null&&!Array.isArray(n),Xh=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,n0=/^f_[0-9a-f]{12,64}$/,i0=/^d_[0-9a-f]{12,64}$/,za=8,s0=4096,qh=2e5,Yh=n=>typeof n=="number"&&Number.isInteger(n)&&n>=0&&n<=1e3,Kh=n=>typeof n=="string"&&n0.test(n);function Md(n){const e=[],t=a=>{e.length<=za&&e.push(a)};if(!ao(n))return{ok:!1,errors:["the co-change view must be an object"]};n.schemaVersion!=="cochange.1"&&t('schemaVersion must be "cochange.1"'),(typeof n.head!="string"||!Xh.test(n.head))&&t("head must be a full commit SHA"),typeof n.needsRescan!="boolean"&&t("needsRescan must be true or false");const i=n.dismissed;(typeof i!="number"||!Number.isInteger(i)||i<0)&&t("dismissed must be a whole number");const s=a=>{const c=n[a];return Array.isArray(c)&&c.length<=qh?c:(t(`${a} must be an array of at most ${qh}`),[])},r=new Set;s("files").forEach((a,c)=>{const l=`files[${c}]`;if(!ao(a)||!Kh(a.fileId)){t(`${l}.fileId must be a file id`);return}r.has(a.fileId)&&t(`${l}.fileId is listed twice`),r.add(a.fileId);const h=a.path;(typeof h!="string"||h.length===0||h.length>s0)&&t(`${l}.path must be a repo path`),a.home!=="star"&&(typeof a.home!="string"||!i0.test(a.home))&&t(`${l}.home must be a planet id or "star"`)});const o=(a,c)=>{(!Kh(a)||!r.has(a))&&t(`${c} must name a file in files`)};return s("links").forEach((a,c)=>{const l=`links[${c}]`;if(!ao(a)){t(`${l} must be an object`);return}o(a.a,`${l}.a`),o(a.b,`${l}.b`),a.a===a.b&&t(`${l} must link two files`),Yh(a.strengthMilli)||t(`${l}.strengthMilli must be 0..1000`)}),s("flags").forEach((a,c)=>{const l=`flags[${c}]`;if(!ao(a)){t(`${l} must be an object`);return}o(a.fileId,`${l}.fileId`),o(a.with,`${l}.with`),Yh(a.strengthMilli)||t(`${l}.strengthMilli must be 0..1000`),(typeof a.at!="string"||!Xh.test(a.at))&&t(`${l}.at must be a full commit SHA`)}),e.length===0?{ok:!0,value:n}:(e.length>za&&e.splice(za,1/0,"…and more"),{ok:!1,errors:e})}function ds(n,e){const t=Math.min(n.length,e.length);for(let i=0;i<t;i++){const s=n.charCodeAt(i),r=e.charCodeAt(i);if(s!==r)return Zh(s)-Zh(r)}return n.length-e.length}function Zh(n){return n>=55296&&n<=57343?n+8192:n>=57344?n-2048:n}const Jh=24,Qh=n=>typeof n=="object"&&n!==null&&!Array.isArray(n),ls=(n,e=0)=>typeof n=="number"&&Number.isInteger(n)&&n>=e&&n<=Number.MAX_SAFE_INTEGER,r0=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,o0=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,a0=/^s_.+/,l0=/^f_[0-9a-f]{12,64}$/,or={text:200,path:4096,files:2e4},jh=n=>typeof n=="string"&&o0.test(n)&&Number.isFinite(Date.parse(n))?Date.parse(n):null;function c0(n,e){const t=jh(n.startedAt),i=jh(n.endedAt);return t===null&&e.push("startedAt must be a UTC time"),i===null&&e.push("endedAt must be a UTC time"),t===null||i===null?null:i<t?(e.push("endedAt must not be before startedAt"),null):[t,i]}function h0(n,e,t,i){ls(n)?e!==null&&Math.abs(n-(e[1]-e[0]))>=1e3&&i.push(`${t} must match startedAt and endedAt to the second`):i.push(`${t} must be a whole number of milliseconds`)}function u0(n,e,t,i){ls(n)||i.push(`${t[0]} must be a whole number`),ls(e)?ls(n)&&(e<n||n===0!=(e===0))&&i.push(`${t[1]} must be at least ${t[0]}, and 0 exactly when it is`):i.push(`${t[1]} must be a whole number`)}function f0(n,e,t,i){if(!Array.isArray(n)||n.length!==Jh){i.push(`${t} must hold exactly ${Jh} slices`);return}if(!n.every(s=>ls(s))){i.push(`${t} must be whole numbers`);return}e!==null&&n.reduce((s,r)=>s+r,0)!==e&&i.push(`${t} must add up to every edit`)}function d0(n){if(!Qh(n))return["the session detail must be an object"];const e=[];n.ok!==!0&&e.push("ok must be true"),n.schemaVersion!=="drone-detail.1"&&e.push('schemaVersion must be "drone-detail.1"'),(typeof n.head!="string"||!r0.test(n.head))&&e.push("head must be a full commit SHA"),(typeof n.key!="string"||!a0.test(n.key)||n.key.length>or.text)&&e.push("key must be a session key (s_…)");const t=Array.isArray(n.files)?n.files:(e.push("files must be an array"),[]);t.length>or.files&&e.push(`files must hold at most ${or.files} entries`);let i=0;const s=new Set;t.forEach((o,a)=>{const c=`files[${a}]`;if(!Qh(o)){e.push(`${c} must be an object`),i=null;return}(typeof o.fileId!="string"||!l0.test(o.fileId))&&e.push(`${c}.fileId must be a file id (f_…)`),(typeof o.path!="string"||o.path.length===0||o.path.length>or.path)&&e.push(`${c}.path must be a non-empty string of at most ${or.path} characters`),ls(o.edits,1)?i!==null&&(i+=o.edits):(e.push(`${c}.edits must be a whole number of at least 1`),i=null),s.add(o.fileId)}),s.size!==t.length&&e.push("file ids must be unique (1eabd165)"),u0(n.otherFiles,n.otherEdits,["otherFiles","otherEdits"],e);const r=c0(n,e);return typeof n.needsRescan!="boolean"?e.push("needsRescan must be a boolean"):n.needsRescan?(t.length>0||!Array.isArray(n.buckets)||n.buckets.length>0||n.otherFiles!==0||n.otherEdits!==0||n.spanMs!==0)&&e.push("needsRescan means no files, counts, buckets or span"):(f0(n.buckets,i!==null&&ls(n.otherEdits)?i+n.otherEdits:null,"buckets",e),h0(n.spanMs,r,"spanMs",e)),e}function eu(n){const e=n.lastIndexOf("/");return e<0?["",n]:[n.slice(0,e),n.slice(e+1)]}function oh(n,e){const[t,i]=eu(n),[s,r]=eu(e);return ds(t,s)||ds(i,r)}const ci=n=>typeof n=="object"&&n!==null&&!Array.isArray(n),wr=(n,e=0)=>typeof n=="number"&&Number.isInteger(n)&&n>=e&&n<=Number.MAX_SAFE_INTEGER,Jl=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,p0=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,yd=/^p_[0-9a-f]{12,64}$/,m0=/^f_[0-9a-f]{12,64}$/,g0=/^d_[0-9a-f]{12,64}$/,v0=8,tu=["captain","displayName","person","seed"];function Sd(n){const e=n.slice(0,v0);return n.length>e.length&&e.push(`…and ${n.length-e.length} more`),{ok:!1,errors:e}}const bd=n=>typeof n=="string",nu=n=>n==="star"||typeof n=="string"&&g0.test(n);function wd(n){if(!ci(n))return{ok:!1,errors:["the crew view must be an object"]};const e=[];n.schemaVersion!=="crew.1"&&e.push('schemaVersion must be "crew.1"'),(typeof n.head!="string"||!Jl.test(n.head))&&e.push("head must be a full commit SHA");const t=Array.isArray(n.members)?n.members:(e.push("members must be an array"),[]);t.forEach((s,r)=>{const o=`members[${r}]`;if(!ci(s)){e.push(`${o} must be an object`);return}Object.keys(s).sort(ds).join()!==tu.join()&&e.push(`${o} must have exactly ${tu.join(", ")}`),(typeof s.person!="string"||!yd.test(s.person))&&e.push(`${o}.person must be a person id (p_…)`),bd(s.displayName)||e.push(`${o}.displayName must be a string`),(!wr(s.seed)||s.seed>4294967295)&&e.push(`${o}.seed must be a uint32`),typeof s.captain!="boolean"&&e.push(`${o}.captain must be a boolean`)});const i=t.flatMap(s=>ci(s)&&typeof s.person=="string"?[s.person]:[]);return new Set(i).size!==i.length&&e.push("person ids must be unique"),i.some((s,r)=>r>0&&ds(i[r-1],s)>0)&&e.push("members must be in person-id order"),t.filter(s=>ci(s)&&s.captain===!0).length>1&&e.push("there is at most one captain"),n.total!==t.length&&e.push("total must be the number of members"),wr(n.bots)||e.push("bots must be a count"),typeof n.needsRescan!="boolean"?e.push("needsRescan must be a boolean"):n.needsRescan&&(t.length>0||n.bots!==0)&&e.push("needsRescan means no members and no bots"),e.length===0?{ok:!0,value:n}:Sd(e)}function _0(n){if(!ci(n))return{ok:!1,errors:["the crew detail must be an object"]};if(n.ok!==!0)return n.error==="no-such-person"&&n.head===void 0?{ok:!0,value:n}:n.error==="unknown-head"&&typeof n.head=="string"&&Jl.test(n.head)?{ok:!0,value:n}:{ok:!1,errors:["a refusal must be no-such-person, or unknown-head with the current head"]};const e=[];n.schemaVersion!=="crew-detail.1"&&e.push('schemaVersion must be "crew-detail.1"'),(typeof n.head!="string"||!Jl.test(n.head))&&e.push("head must be a full commit SHA"),(typeof n.person!="string"||!yd.test(n.person))&&e.push("person must be a person id (p_…)"),bd(n.displayName)||e.push("displayName must be a string"),typeof n.captain!="boolean"&&e.push("captain must be a boolean");const t=n.lastActive;t!==null&&(typeof t!="string"||!p0.test(t)||!Number.isFinite(Date.parse(t)))&&e.push("lastActive must be a UTC time or null");const i=Array.isArray(n.planets)?n.planets:(e.push("planets must be an array"),[]);i.forEach((a,c)=>{(!ci(a)||!nu(a.home)||!wr(a.touches,1))&&e.push(`planets[${c}] must be a body (a DirId or "star") with touches ≥ 1`)});const s=i.flatMap(a=>ci(a)&&typeof a.home=="string"?[a.home]:[]);(new Set(s).size!==s.length||s.some((a,c)=>c>0&&ds(s[c-1],a)>0))&&e.push("planets must be unique and sorted by home");const r=Array.isArray(n.files)?n.files:(e.push("files must be an array"),[]);r.forEach((a,c)=>{const l=`files[${c}]`;if(!ci(a)){e.push(`${l} must be an object`);return}(typeof a.fileId!="string"||!m0.test(a.fileId))&&e.push(`${l}.fileId must be a file id`),(typeof a.path!="string"||a.path.length===0)&&e.push(`${l}.path must be a non-empty string`),nu(a.home)||e.push(`${l}.home must be a DirId or "star"`),wr(a.touches,1)||e.push(`${l}.touches must be at least 1`)});const o=r.flatMap(a=>ci(a)&&typeof a.path=="string"?[a.path]:[]);return o.some((a,c)=>c>0&&oh(o[c-1],a)>=0)&&e.push("files must be unique and in folder-then-name order"),wr(n.otherFiles)||e.push("otherFiles must be a count"),typeof n.needsRescan!="boolean"?e.push("needsRescan must be a boolean"):n.needsRescan&&(t!==null||i.length>0||r.length>0)?e.push("needsRescan means no lastActive, planets or files"):!n.needsRescan&&t===null&&e.push("lastActive is null only when needsRescan"),e.length===0?{ok:!0,value:n}:Sd(e)}const Er=n=>typeof n=="object"&&n!==null&&!Array.isArray(n),Ed=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,x0=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/,iu=/^s_.+/,M0=8,lo=200;function y0(n,e,t){if(!Er(n)){t.push(`${e} must be an object`);return}const i=(o,a)=>t.push(`${e}.${o} ${a}`),s=(o,a)=>{const c=n[o];c===null&&a||(typeof c!="string"||c.length===0||c.length>lo)&&i(o,`must be a non-empty string of at most ${lo} characters${a?" or null":""}`)};(typeof n.key!="string"||!iu.test(n.key)||n.key.length>lo)&&i("key","must be a session key (s_…)");const r=n.seed;(typeof r!="number"||!Number.isInteger(r)||r<0||r>4294967295)&&i("seed","must be a uint32"),s("tool",!1),n.kind!=="main"&&n.kind!=="subagent"&&i("kind","must be main or subagent"),n.parentKey!==null&&(typeof n.parentKey!="string"||!iu.test(n.parentKey))&&i("parentKey","must be a session key or null"),s("agentType",!0);for(const o of["startedAt","endedAt"])(typeof n[o]!="string"||!x0.test(n[o])||!Number.isFinite(Date.parse(n[o])))&&i(o,"must be a UTC time");s("branch",!0),s("model",!0),typeof n.inferred!="boolean"&&i("inferred","must be a boolean"),n.home!==null&&(typeof n.home!="string"||n.home.length===0||n.home.length>lo)&&i("home",'must be a body id, "star" or null')}function Ad(n){const e=n.slice(0,M0);return n.length>e.length&&e.push(`…and ${n.length-e.length} more`),{ok:!1,errors:e}}function S0(n){if(!Er(n))return{ok:!1,errors:["the session detail must be an object"]};if(n.ok!==!0)return n.error==="no-such-session"&&n.head===void 0?{ok:!0,value:n}:n.error==="unknown-head"&&typeof n.head=="string"&&Ed.test(n.head)?{ok:!0,value:n}:{ok:!1,errors:["a refusal must be no-such-session, or unknown-head with the current head"]};const e=d0(n);return e.length===0?{ok:!0,value:n}:Ad(e)}function Td(n){const e=[];if(!Er(n))return{ok:!1,errors:["the drone view must be an object"]};n.schemaVersion!=="drones.1"&&e.push('schemaVersion must be "drones.1"'),(typeof n.head!="string"||!Ed.test(n.head))&&e.push("head must be a full commit SHA");const t=Array.isArray(n.sessions)?n.sessions:(e.push("sessions must be an array"),[]);t.forEach((r,o)=>y0(r,`sessions[${o}]`,e));const i=t.flatMap(r=>Er(r)&&typeof r.key=="string"?[r.key]:[]);new Set(i).size!==i.length&&e.push("session keys must be unique");const s=t.filter(r=>Er(r)&&r.home!==null).length;return n.total!==t.length&&e.push("total must be the number of sessions"),n.placed!==s&&e.push("placed must be the number of sessions with a home"),typeof n.needsRescan!="boolean"?e.push("needsRescan must be a boolean"):n.needsRescan&&s>0&&e.push("needsRescan means no session has a home"),e.length===0?{ok:!0,value:n}:Ad(e)}const Ql=120,su=1e3,b0=/[\p{Cc}\p{Zl}\p{Zp}\p{Cs}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u,w0=n=>n.trim();function ah(n){return typeof n!="string"?"the note must be text":n.trim()===""?"the note is empty":b0.test(n)?"the note must be one line of plain text, without control characters":n!==n.trim()?"the note must not start or end with spaces":[...n].length>Ql?`the note is longer than ${Ql} characters`:null}const ru=1.13,ou=.1,au=.04,Yn={halo:ru,lump:ou,grain:au,reach:ru+ou+au};function Rd(n,e){const t=e===1?0:1-2*n/(e-1),i=Math.sqrt(Math.max(0,1-t*t)),s=n*Math.PI*(3-Math.sqrt(5));return[Math.cos(s)*i,t,Math.sin(s)*i]}const zt=30,gi=48,_r=zt*gi,Ni={surface:2,clouds:3,moons:2,lava:2,starSpin:1,starChurn:1},E0=720,co=zt*E0,A0=0;function vi(n){return(Math.floor(n)%_r+_r)%_r/_r}function fi(n,e){return vi(n)*Math.PI*2*e}function lh(n){return(Math.floor(n)%co+co)%co/co*Math.PI*2}function T0(n,e){return e?A0:Math.floor(n)}function Zr(n){let e=n|0;return()=>{e=e+1831565813|0;let t=Math.imul(e^e>>>15,1|e);return t=t+Math.imul(t^t>>>7,61|t)^t,((t^t>>>14)>>>0)/4294967296}}const Ar=n=>n-Math.floor(n),jl=(Math.sqrt(5)-1)/2,lu=[.7548776662466927,.5698402909980532],R0=1e4,cu=["lush","ocean","ice"];function C0(n,e){switch(n){case"lava":return"lava";case"toxic":return"toxic";case"ash":return"desert";case"healthy":return cu[(e>>>0)%cu.length]}}const Jr=.06,Tr=.07,hu={first:1.36,step:.05},fa=n=>n/R0;function P0(n,e,t,i){return{fileId:e,testOf:t,slot:i,orbit:n*(hu.first+hu.step*i)+Jr,incl:.2+.3*Ar(i*jl),yaw:Ar(.5+i*lu[1])*Math.PI*2,offset:Ar(.15+i*lu[0])}}function L0(n){const e=fa(n.radiusMilli);return{dirId:n.dirId,path:n.path,band:n.health.band,look:C0(n.health.band,n.biomeSeed),seed:n.biomeSeed,radius:e,orbit:fa(n.slot.radiusMilli),phase:n.slot.phaseMilliturn/1e3,slot:n.slot.index,moons:n.moons.map(t=>P0(e,t.fileId,t.testOf,t.slot)),surface:{cells:n.surface.grid.cells,settlements:n.surface.settlements.map(t=>({fileId:t.fileId,cell:t.cell}))},counts:{loc:n.loc,moons:n.moons.length,moonOverflow:n.moonOverflow,settlements:n.surface.settlements.length,surfaceOverflow:n.surface.overflow,debtUnknownFiles:n.health.debtUnknownFiles,markersPerKlocMilli:n.health.markersPerKlocMilli,qodoOpen:n.health.qodoOpen,qodoUnknown:n.health.qodoUnknown}}}function Ta(n){return Math.max(n.radius*1.15,...n.moons.map(e=>e.orbit+Jr))}function I0(n){const e=n.planets.map(L0),t=fa(n.constants.maxPlanetRadiusMilli),i=e.length?Math.min(...e.map(l=>l.orbit)):fa(n.constants.slotSpacingMilli)+t,s=Math.max(.6,i-t),r=Math.min(t,Math.max(.3,s*.5)),o=r+(s-r)*.5,a=n.star.moonlets.map(l=>({fileId:l.fileId,slot:l.slot,orbit:o,incl:.15*(Ar(l.slot*jl)-.5),offset:Ar(l.slot*jl)})),c=Math.max(r,a.length?o+Tr:0,...e.map(l=>l.orbit+Ta(l)));return{star:{radius:r,moonlets:a,moonletOverflow:n.star.moonletOverflow,testData:n.star.testData},planets:e,extent:c}}function Kn(n,e){const t=n.phase*Math.PI*2+lh(e);return[Math.cos(t)*n.orbit,0,-Math.sin(t)*n.orbit]}function Ra(n,e){const t=fi(e,Ni.moons)+n.offset*Math.PI*2,i=Math.cos(t)*n.orbit,s=-Math.sin(t)*n.orbit*Math.sin(n.incl),r=Math.sin(t)*n.orbit*Math.cos(n.incl),o=Math.cos(n.yaw),a=Math.sin(n.yaw);return[i*o+r*a,s,-i*a+r*o]}function D0(n,e,t){const[i,s,r]=Rd(e,n.surface.cells),o=fi(t,Ni.surface),a=Math.cos(o),c=Math.sin(o);return[i*a-r*c,s,i*c+r*a]}function uu(n,e){return Ra({orbit:n.orbit,incl:n.incl,yaw:0,offset:n.offset},e)}const fu=n=>typeof n=="object"&&n!==null&&!Array.isArray(n),du=/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,N0=/^f_[0-9a-f]{12,64}$/,F0=/^d_[0-9a-f]{12,64}$/,U0=8,O0=4096,k0=(n,e)=>{if(e.length===0)return{ok:!0,value:n};const t=e.slice(0,U0);return e.length>t.length&&t.push(`…and ${e.length-t.length} more`),{ok:!1,errors:t}};function B0(n,e){if(!fu(n)){e.push("the beacon view must be an object");return}n.schemaVersion!=="beacons.1"&&e.push('schemaVersion must be "beacons.1"'),(typeof n.head!="string"||!du.test(n.head))&&e.push("head must be a full commit SHA");const t=n.unplaced;(typeof t!="number"||!Number.isInteger(t)||t<0)&&e.push("unplaced must be a whole number");const i=n.beacons;if(!Array.isArray(i)||i.length>su){e.push(`beacons must be an array of at most ${su}`);return}i.forEach((s,r)=>{const o=`beacons[${r}]`;if(!fu(s)){e.push(`${o} must be an object`);return}(typeof s.fileId!="string"||!N0.test(s.fileId))&&e.push(`${o}.fileId must be a file id`);const a=s.path;(typeof a!="string"||a.length===0||a.length>O0)&&e.push(`${o}.path must be a repo path`),s.home!=="star"&&(typeof s.home!="string"||!F0.test(s.home))&&e.push(`${o}.home must be a planet id or "star"`),(typeof s.at!="string"||!du.test(s.at))&&e.push(`${o}.at must be a full commit SHA`),ah(s.text)!==null&&e.push(`${o}.text must be one plain line of at most 120 characters`)})}function Cd(n){const e=[];return B0(n,e),k0(n,e)}function Ga(n,e){if(!n)return{spots:[],unplaced:0};const t=new Map(e.planets.map((o,a)=>[o.dirId,a])),i=new Map;let s=n.unplaced;for(const o of n.beacons){const a=o.home==="star"?-1:t.get(o.home);if(a===void 0){s++;continue}const c=i.get(a);c?c.unshift(o.text):i.set(a,[o.text])}return{spots:[...i.keys()].sort((o,a)=>o<0?1:a<0?-1:o-a).map(o=>({planet:o,notes:i.get(o)})),unplaced:s}}function Pd(n,e,t){const i=e.planet>=0?n.planets[e.planet]:void 0;return i?{centre:Kn(i,t),radius:i.radius}:{centre:[0,0,0],radius:n.star.radius*Yn.reach}}const z0=(n,e,t)=>`${n} ${n===1?e:t}`;function pu(n,e){if(n===0&&e===0)return null;const t=n>0?z0(n,"beacon","beacons"):"no beacons";return e>0?`${t} (+${e} not placed)`:t}const G0=["fogged","haze","clear"],H0=["lava","toxic","ash","healthy"],V0=["root-file","unmatched-test"],W0=["content","outer"],$0=[...G0],Ld=["agent","mixed","self-committed-agent-written","teammate","unknown","lineage-unknown"],Ha=8,X0=4096,q0=n=>typeof n=="object"&&n!==null&&!Array.isArray(n);class Qr{errors=[];fail(e,t){this.errors.push(`${e} ${t}`)}obj(e,t){return q0(e)?e:(this.fail(t,"must be an object"),null)}arr(e,t){return Array.isArray(e)?e:(this.fail(t,"must be an array"),[])}int(e,t,i=0,s=Number.MAX_SAFE_INTEGER){typeof e!="number"||!Number.isInteger(e)?this.fail(t,"must be an integer"):(e<i||e>s)&&this.fail(t,`must be between ${i} and ${s}`)}str(e,t,i=""){typeof e!="string"||e.length===0?this.fail(t,"must be a non-empty string"):i&&!e.startsWith(i)&&this.fail(t,`must start with "${i}"`)}oneOf(e,t,i){(typeof e!="string"||!i.includes(e))&&this.fail(t,`must be one of ${i.join(", ")}`)}nullableInt(e,t){e!==null&&this.int(e,t)}nullableStr(e,t){e!==null&&this.str(e,t)}counts(e,t){const i=["total","fogged","haze","clear"];for(const c of i)this.int(e[c],`${t}.${c}`);const[s,r,o,a]=i.map(c=>e[c]);[s,r,o,a].every(c=>typeof c=="number")&&r+o+a!==s&&this.fail(`${t}`,"fogged, haze and clear must add up to total")}result(e){if(this.errors.length===0)return{ok:!0,value:e};const t=this.errors.slice(0,Ha);return this.errors.length>Ha&&t.push(`…and ${this.errors.length-Ha} more`),{ok:!1,errors:t}}}function Id(n,e,t){const i=n.obj(e,t);i&&(n.oneOf(i.band,`${t}.band`,H0),n.int(i.markersPerKlocMilli,`${t}.markersPerKlocMilli`),n.int(i.debtUnknownFiles,`${t}.debtUnknownFiles`),n.nullableInt(i.qodoOpen,`${t}.qodoOpen`),typeof i.qodoUnknown!="boolean"&&n.fail(`${t}.qodoUnknown`,"must be a boolean"))}function Y0(n,e,t){const i=n.obj(e,t);i&&(n.str(i.fileId,`${t}.fileId`,"f_"),n.str(i.dirId,`${t}.dirId`,"d_"),n.int(i.cell,`${t}.cell`),n.int(i.loc,`${t}.loc`),n.int(i.size,`${t}.size`,1,4),Id(n,i.health,`${t}.health`))}function K0(n,e,t){const i=n.obj(e,t);if(!i)return;n.str(i.dirId,`${t}.dirId`,"d_"),n.str(i.path,`${t}.path`),n.oneOf(i.zone,`${t}.zone`,W0),n.int(i.bornSeq,`${t}.bornSeq`);const s=n.obj(i.slot,`${t}.slot`);s&&(n.int(s.index,`${t}.slot.index`),n.int(s.radiusMilli,`${t}.slot.radiusMilli`,1),n.int(s.phaseMilliturn,`${t}.slot.phaseMilliturn`,0,999)),n.int(i.radiusMilli,`${t}.radiusMilli`,1),n.int(i.loc,`${t}.loc`),n.int(i.biomeSeed,`${t}.biomeSeed`,-2147483648,2**32-1),Id(n,i.health,`${t}.health`);const r=n.obj(i.surface,`${t}.surface`);if(r){const o=n.obj(r.grid,`${t}.surface.grid`);o&&(o.kind!=="fibonacci"&&n.fail(`${t}.surface.grid.kind`,'must be "fibonacci"'),n.int(o.cells,`${t}.surface.grid.cells`,1,X0)),n.arr(r.continents,`${t}.surface.continents`).forEach((a,c)=>{const l=n.obj(a,`${t}.surface.continents[${c}]`);l&&(n.str(l.dirId,`${t}.surface.continents[${c}].dirId`,"d_"),n.int(l.seedCell,`${t}.surface.continents[${c}].seedCell`))}),n.arr(r.settlements,`${t}.surface.settlements`).forEach((a,c)=>Y0(n,a,`${t}.surface.settlements[${c}]`)),n.int(r.overflow,`${t}.surface.overflow`)}n.arr(i.moons,`${t}.moons`).forEach((o,a)=>{const c=n.obj(o,`${t}.moons[${a}]`);c&&(n.str(c.fileId,`${t}.moons[${a}].fileId`,"f_"),n.int(c.slot,`${t}.moons[${a}].slot`))}),n.int(i.moonOverflow,`${t}.moonOverflow`)}function Dd(n){const e=new Qr,t=e.obj(n,"layout");if(!t)return e.result(n);if(t.schemaVersion!=="layout.1")return e.fail("layout.schemaVersion",`must be "layout.1" (got ${JSON.stringify(t.schemaVersion)})`),e.result(n);const i=e.obj(t.source,"layout.source");i&&(e.str(i.repoId,"layout.source.repoId"),e.str(i.head,"layout.source.head"),e.arr(i.roots,"layout.source.roots").forEach((o,a)=>e.str(o,`layout.source.roots[${a}]`)));const s=e.obj(t.constants,"layout.constants");s&&(e.int(s.slotSpacingMilli,"layout.constants.slotSpacingMilli",1),e.int(s.maxPlanetRadiusMilli,"layout.constants.maxPlanetRadiusMilli",1),e.int(s.moonCap,"layout.constants.moonCap"));const r=e.obj(t.star,"layout.star");return r&&(e.str(r.repoId,"layout.star.repoId"),e.arr(r.moonlets,"layout.star.moonlets").forEach((o,a)=>{const c=e.obj(o,`layout.star.moonlets[${a}]`);c&&(e.str(c.fileId,`layout.star.moonlets[${a}].fileId`,"f_"),e.oneOf(c.kind,`layout.star.moonlets[${a}].kind`,V0),e.int(c.slot,`layout.star.moonlets[${a}].slot`))}),e.int(r.moonletOverflow,"layout.star.moonletOverflow"),e.int(r.testData,"layout.star.testData")),e.arr(t.planets,"layout.planets").forEach((o,a)=>K0(e,o,`layout.planets[${a}]`)),e.result(n)}function Z0(n){const e=new Qr,t=e.obj(n,"fog");if(!t)return e.result(n);if(t.schemaVersion!=="fog.2")return e.fail("fog.schemaVersion",`must be "fog.2" (got ${JSON.stringify(t.schemaVersion)})`),e.result(n);e.str(t.head,"fog.head"),e.nullableStr(t.baseline,"fog.baseline"),typeof t.charted!="boolean"&&e.fail("fog.charted","must be a boolean"),e.arr(t.files,"fog.files").forEach((s,r)=>{const o=`fog.files[${r}]`,a=e.obj(s,o);a&&(e.str(a.fileId,`${o}.fileId`,"f_"),e.oneOf(a.state,`${o}.state`,$0),e.arr(a.reasons,`${o}.reasons`).forEach((c,l)=>e.oneOf(c,`${o}.reasons[${l}]`,Ld)),e.nullableStr(a.since,`${o}.since`))}),e.arr(t.planets,"fog.planets").forEach((s,r)=>{const o=e.obj(s,`fog.planets[${r}]`);o&&(e.str(o.dirId,`fog.planets[${r}].dirId`,"d_"),e.counts(o,`fog.planets[${r}]`))});const i=e.obj(t.star,"fog.star");return i&&e.counts(i,"fog.star"),e.result(n)}const J0=["modified","added","deleted","renamed","mode"],Q0=[" ","+","-","\\"];function Nd(n,e,t){n.str(e.error,`${t}.error`),e.head!==void 0&&n.str(e.head,`${t}.head`)}function j0(n){const e=new Qr,t=e.obj(n,"unseen");return t?t.ok!==!0?(Nd(e,t,"unseen"),e.result(n)):(e.str(t.at,"unseen.at"),e.nullableStr(t.home,"unseen.home"),e.arr(t.files,"unseen.files").forEach((i,s)=>{const r=`unseen.files[${s}]`,o=e.obj(i,r);o&&(e.str(o.fileId,`${r}.fileId`,"f_"),e.str(o.path,`${r}.path`),e.str(o.since,`${r}.since`),e.arr(o.reasons,`${r}.reasons`).forEach((a,c)=>e.oneOf(a,`${r}.reasons[${c}]`,Ld)))}),e.result(n)):e.result(n)}function eg(n){const e=new Qr,t=e.obj(n,"diff");return t?t.ok!==!0?(Nd(e,t,"diff"),e.result(n)):(e.str(t.fileId,"diff.fileId","f_"),e.str(t.at,"diff.at"),e.nullableStr(t.since,"diff.since"),e.nullableStr(t.base,"diff.base"),typeof t.truncated!="boolean"&&e.fail("diff.truncated","must be a boolean"),e.int(t.shownLines,"diff.shownLines"),e.arr(t.sections,"diff.sections").forEach((i,s)=>{const r=`diff.sections[${s}]`,o=e.obj(i,r);o&&(e.oneOf(o.status,`${r}.status`,J0),e.str(o.path,`${r}.path`),e.nullableStr(o.oldPath,`${r}.oldPath`),typeof o.binary!="boolean"&&e.fail(`${r}.binary`,"must be a boolean"),e.arr(o.hunks,`${r}.hunks`).forEach((a,c)=>{const l=e.obj(a,`${r}.hunks[${c}]`);l&&(e.str(l.header,`${r}.hunks[${c}].header`,"@@"),e.arr(l.lines,`${r}.hunks[${c}].lines`).forEach((h,u)=>{(typeof h!="string"||!Q0.includes(h[0]??""))&&e.fail(`${r}.hunks[${c}].lines[${u}]`,"must start with a diff mark")}))}))}),e.result(n)):e.result(n)}function tg(n,e,t){n.str(e,t),typeof e=="string"&&e.length>0&&e.split("/").some(i=>i===""||i==="."||i==="..")&&n.fail(t,"must be a repository-relative path")}function ng(n){const e=new Qr,t=e.obj(n,"snapshot");if(!t)return e.result(n);if(t.schemaVersion!=="0.2")return e.fail("snapshot.schemaVersion",`must be "0.2" (got ${JSON.stringify(t.schemaVersion)})`),e.result(n);const i=e.obj(t.repo,"snapshot.repo");e.str(i?.head,"snapshot.repo.head");const s=(a,c)=>{const l=new Set,h=new Set;return e.arr(t[a],`snapshot.${a}`).flatMap((u,f)=>{const d=`snapshot.${a}[${f}]`,p=e.obj(u,d);return p?(e.str(p.id,`${d}.id`,c),tg(e,p.path,`${d}.path`),l.has(p.id)&&e.fail(`${d}.id`,"is repeated"),h.has(p.path)&&e.fail(`${d}.path`,"is repeated"),l.add(p.id),h.add(p.path),[{id:p.id,path:p.path}]):[]})},r=s("dirs","d_"),o=s("files","f_");return e.result({head:i?.head,dirs:r,files:o})}class At extends Error{constructor(e,t=[]){super([e,...t].join(`
`)),this.title=e,this.detail=t}title;detail}function Nn(n,e,t,i){let s;try{s=JSON.parse(n)}catch{throw new At(`The ${e} from ${t} is not JSON.`)}const r=i(s);if(!r.ok)throw new At(`The ${e} from ${t} is invalid.`,r.errors);return r.value}const ig=(n,e)=>Nn(n,"layout",e,Dd),sg=(n,e)=>Nn(n,"fog view",e,Z0),rg=(n,e)=>Nn(n,"drone view",e,Td),og=(n,e)=>Nn(n,"crew view",e,wd),ag=(n,e)=>Nn(n,"beacon view",e,Cd),lg=(n,e)=>Nn(n,"co-change view",e,Md),cg=(n,e)=>Nn(n,"file list",e,ng),Fd={world:{space:"#0d0b16",stars:["#3b3866","#9a90e0","#fff8ff"],ocean:["#141d5c","#1d3fa6","#2b6ee0","#4ea3f7","#94dcff"],land:["#123d33","#1d7350","#38a85a","#7cd65a","#d0f56c"],cap:["#3f4590","#98a3e8","#dfe5ff","#ffffff"],cloud:["#30285a","#f2d8b8","#f2d8b8","#fffaf0"],ring:["#141d5c","#f2d8b8","#4ea3f7","#94dcff"],water:["#0f1a4e","#18378f","#2560c8","#3f92ec","#86ccff"],ice:["#5a78ac","#93b6dc","#c6e0f4","#e6f4ff","#ffffff"],crevasse:["#16234e","#24407e","#3a64b0","#6a96d6"],sand:["#6a3a1e","#a8602c","#d8944a","#f0c27a","#fff0b8"],rock:["#2e1c14","#4e3020","#7a4c30","#a4744c"],crust:["#0b0a10","#0b0a10","#17151d","#262129","#382c30"],glow:["#c9361a","#ff761a","#ffc93c"],starDisc:["#c9361a","#ff761a","#ffc93c","#fff0b8","#fffaf0"],starCorona:["#c9361a","#481a18"],ash:["#1a1719","#332e30","#565052","#827b7c"],gasA:["#5a2e1c","#9c5a30","#d89a5a","#f2cc94","#fff0d0"],gasB:["#481a18","#883422","#c25e38","#e69068","#ffc6a0"],moon:["#26262c","#4a4a54","#76767f","#a4a4ac","#d2d2d6"],sludge:["#150e0e","#22140f","#341c12","#4a2614","#643218"],toxic:["#3a1c12","#642c16","#8e421c","#b85e26","#e88a34"],fungus:["#7a4a1e","#a66a2a","#cc8e3c","#e8b45c"],spore:["#2a2022","#6a5048","#8e705e","#b49680"],moonBody:["#a8602c","#d8944a","#f0c27a","#f2d8b8"],haze:{ocean:"#86ccff",ice:"#ffffff",toxic:"#e07a48"},halo:"#30285a",depth:[{tint:"#1b1f4a",strength:0},{tint:"#1b1f4a",strength:.38},{tint:"#1b1f4a",strength:.72},{tint:"#17172f",strength:.88}]},crew:{suit:["#4185d8","#5ab9e5","#c1d9f2","#ffffff"],gear:["#293268","#464b8c","#6b74b2","#909edd"],visor:["#12173d","#29174c"],glint:"#ffffff",contributors:{coral:["#3f233c","#872a38","#cc5250","#ff6866"],mint:["#14665b","#22896e","#42bc7f","#8cff9b"],lilac:["#643499","#8c51cc","#b991f2","#a5e6ff"]}},drone:{generic:{shell:["#293268","#464b8c","#6b74b2","#909edd"],trim:["#6b74b2","#909edd","#c1d9f2","#ffffff"],accent:["#36277f","#354ab2","#4185d8","#5ab9e5"],smoke:["#909edd","#c1d9f2","#ffffff"]},claude:{shell:["#3f233c","#872a38","#cc5250","#ff965f"],trim:["#3f233c","#872a38","#cc5250","#ff6866"],accent:["#3f233c","#872a38","#cc5250","#ff965f"],smoke:["#ff965f","#ffe091","#ffffff"],trimB:["#3f233c","#872a38","#cc5250","#ff965f"],trimC:["#872a38","#cc5250","#ff965f","#ffe091"]}},ship:{hull:{shell:["#464b8c","#6b74b2","#c1d9f2","#ffffff"],trim:["#3f233c","#872a38","#d83843","#ff6866"],metal:["#293268","#464b8c","#6b74b2","#909edd"],gold:["#872a38","#cc5250","#ff965f","#ffe091"],interior:["#36277f"],flame:["#d83843","#ff965f","#ffe091","#ffffff"],lights:["#66334b","#ff6866"]},cap:{shell:["#12173d","#293268","#354ab2","#4185d8"],gold:["#872a38","#cc5250","#ff965f","#ffe091"]}},accent:{teal:["#004538","#007c66","#00bc9c","#00ffd5"]}};function Ud(n){if(typeof n!="object"||n===null)return n;for(const e of Object.values(n))Ud(e);return Object.freeze(n)}const ho=Fd.world.cloud,hg={mist:[ho[1],ho[3],ho[3],ho[3]]},we=Ud({...Fd,fog:hg}),Ws={near:5,far:44},Od=Math.log(Ws.far/Ws.near),ug=Ws.near*Math.exp(2*Od/3);we.world.depth.map(n=>n.strength);const fg=8.4,mu={squeeze:1,shift:0};function dg(n,e=0){const t=(r,o)=>Number.isFinite(r)?r/o:0,i=Math.log(Math.max(1,t(n,fg),t(e,ug))),s=Od/3;return{squeeze:s/(s+i),shift:i/s}}const Kt=(n,e)=>[n[0]+e[0],n[1]+e[1],n[2]+e[2]],sn=(n,e)=>[n[0]-e[0],n[1]-e[1],n[2]-e[2]],Et=(n,e)=>[n[0]*e,n[1]*e,n[2]*e],Yt=(n,e)=>n[0]*e[0]+n[1]*e[1]+n[2]*e[2],Li=n=>Math.hypot(n[0],n[1],n[2]),ch=(n,e)=>[n[1]*e[2]-n[2]*e[1],n[2]*e[0]-n[0]*e[2],n[0]*e[1]-n[1]*e[0]],Rr=n=>{const e=Li(n);return[n[0]/e,n[1]/e,n[2]/e]},hn=(n,e,t)=>n+(e-n)*t,jr=35,Ca=16/9,kd=.45,Ks=.05,pg=1200,gu=Math.PI/2-.05,nr=(n=jr)=>Math.tan(n*Math.PI/360),Gt=n=>n.fovDeg??jr,ec=n=>Math.max(-gu,Math.min(gu,n));function Bd(n,e){const t=Li(n);return t>1e-9?{yaw:Math.atan2(n[0],n[2]),pitch:ec(Math.asin(n[1]/t)),dist:t}:{...e,dist:0}}const mg={target:[0,0,0],yaw:0,pitch:.4,dist:20};function _i(n,e){const t=Math.cos(e),i=[Math.sin(n)*t,Math.sin(e),Math.cos(n)*t],s=Et(i,-1),r=[Math.cos(n),0,-Math.sin(n)];return{fwd:s,right:r,up:ch(r,s),back:i}}const Gi=n=>Kt(n.target,Et(_i(n.yaw,n.pitch).back,n.dist));function gg(n){const e=Bd(sn(n.position,n.target),{yaw:0,pitch:0});return{target:[...n.target],yaw:e.yaw,pitch:e.pitch,dist:e.dist>0?e.dist:1,fovDeg:n.fovDeg}}const zd=(n,e,t=jr)=>n/(e*nr(t)),Ko={yaw:.35,pitch:28*Math.PI/180},vu={x:.92,y:.85};function Pa(n,e=[]){const t=[],i=(a,c)=>{for(const l of[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])t.push(Kt(a,Et(l,c)))},s=a=>{for(let c=0;c<24;c++){const l=c/24*Math.PI*2;t.push([Math.cos(l)*a,0,Math.sin(l)*a])}};i([0,0,0],n.star.radius),n.star.moonlets.length&&s(n.star.moonlets[0].orbit);for(const a of n.planets)i(Kn(a,0),Ta(a));t.push(...e);let r={target:[0,0,0],...Ko,dist:1};if(n.planets.length===0&&e.length===0)return{...r,dist:zd(n.star.radius,kd)};const o=a=>{const c=u=>t.every(f=>{const d=jt({...a,dist:u},f);return d!==null&&Math.abs(d.x)<=vu.x&&Math.abs(d.y)<=vu.y});let l=0,h=Math.max(1,n.extent)*64;for(let u=0;u<48;u++){const f=(l+h)/2;c(f)?h=f:l=f}return{...a,dist:h}};for(let a=0;a<4;a++){r=o(r);const c=t.map(f=>jt(r,f)).filter(f=>f!==null),l=f=>(Math.min(...c.map(d=>d[f]))+Math.max(...c.map(d=>d[f])))/2,h=_i(r.yaw,r.pitch),u=nr(Gt(r))*r.dist;r={...r,target:Kt(r.target,Kt(Et(h.right,l("x")*u*Ca),Et(h.up,l("y")*u)))}}return o(r)}function vg(n,e,t=[]){const i=Pa(n,t),s=lh(e),r=Math.cos(s),o=Math.sin(s),[a,c,l]=i.target;return{...i,target:[a*r+l*o,c,l*r-a*o],yaw:i.yaw+s}}function _u(n,e=Pa(n)){const t=Gi(e);return dg(n.extent,Math.max(0,...n.planets.map(i=>Li(sn(Kn(i,0),t)))))}const Gd=(n,e)=>zd(e,kd,Gt(n));function _g(n,e,t,i){const{yaw:s,pitch:r}=Bd(i??sn(Gi(n),e),n);return{...n,target:[...e],yaw:s,pitch:r,dist:Gd(n,t)}}function xg(n,e,t){let i=(e.yaw-n.yaw)%(Math.PI*2);return i>Math.PI&&(i-=Math.PI*2),i<-Math.PI&&(i+=Math.PI*2),{target:[hn(n.target[0],e.target[0],t),hn(n.target[1],e.target[1],t),hn(n.target[2],e.target[2],t)],yaw:n.yaw+i*t,pitch:hn(n.pitch,e.pitch,t),dist:Math.exp(hn(Math.log(n.dist),Math.log(e.dist),t)),fovDeg:hn(Gt(n),Gt(e),t)}}function jt(n,e){const t=_i(n.yaw,n.pitch),i=sn(e,Gi(n)),s=Yt(i,t.fwd);if(s<=Ks)return null;const r=nr(Gt(n));return{x:Yt(i,t.right)/(s*r*Ca),y:Yt(i,t.up)/(s*r),depth:s}}const Fi=(n,e,t=jr)=>n/(e*nr(t));function Hd(n,e){const t=_i(n.yaw,n.pitch),i=nr(Gt(n)),s=Kt(t.fwd,Kt(Et(t.right,e.x*i*Ca),Et(t.up,e.y*i)));return Et(s,1/Li(s))}function tc(n,e,t){const i=Gi(n),s=Hd(n,e),r=sn(t.centre,i),o=Yt(r,s);if(o<=0)return 1/0;const a=Yt(r,r)/o,c=sn(Kt(i,Et(s,a)),t.centre),l=Li(c);if(a<=Ks||l>t.radius)return 1/0;if(!t.edge||l===0)return a;const h=_i(n.yaw,n.pitch),u=Et(r,-1/Li(r)),f=sn(h.up,Et(u,Yt(h.up,u))),d=Yt(f,f)<1e-6?h.right:Et(f,1/Li(f)),p=ch(d,u),x=Et(p,1/Li(p));return l<=t.edge([Yt(c,x)/l,Yt(c,d)/l])?a:1/0}function Cr(n,e,t,i=[],s=.04){const r=nr(Gt(n)),o=Gi(n),a=Hd(n,e),c=(u,f)=>{const d=sn(u.centre,o),p=Yt(d,a);if(p<=Ks)return 1/0;const x=f?Math.max(u.radius,s*p*r):u.radius,m=Yt(d,d)-p*p;return m>x*x?1/0:p-Math.sqrt(x*x-m)};let l=null,h=1/0;return t.forEach((u,f)=>{const d=c(u,!0);d<h&&(h=d,l=f)}),i.some(u=>(u.flat?tc(n,e,u):c(u,!1))<h)?null:l}const Un=.6,hh=8,Mg=2,uh=hh*Mg,yg=.709,rn=12,cs={bob:2,sway:1,flame:3,flicker:48,blink:6},fh=n=>(n%rn+rn)%rn;function Va(n,e=0){let t=Math.imul(n^2654435769,2246822507)^Math.imul(e+1663821227,3266489909);return t^=t>>>15,t=Math.imul(t,739982445),t^=t>>>12,t=Math.imul(t,695872825),t^=t>>>15,(t>>>0)/4294967296}function Vd(n){const e=fh(n)/rn*Math.PI*2;return{bob:.07*Math.sin(e*cs.bob),roll:.035*Math.sin(e*cs.sway+.8),pitch:.02*Math.sin(e*cs.sway+2.3)}}function Sg(n,e=0){const t=fh(n),i=t/rn*Math.PI*2,s=Math.floor(t/rn*cs.flicker)%cs.flicker;return{len:1+.12*Math.sin(i*cs.flame+e)+.22*(Va(s,11+e)-.5),dx:.07*(Va(s,29+e)-.5),dz:.07*(Va(s,47+e)-.5)}}const bg=(n,e)=>(fh(e)/rn*cs.blink+n.phase)%1<.5,Wa=(n,e,t,i,s,r,o=0)=>({id:n,kind:"cone",a:e,b:t,r1:i,r2:s,slot:r,k:o}),Wd=(n,e,t,i,s,r,o=0,a=.02)=>({id:n,kind:"capcone",c:e,h:t,r1:i,r2:s,round:a,slot:r,k:o}),xu=(n,e,t,i,s=0)=>({id:n,kind:"sphere",c:e,r:t,slot:i,k:s}),wg=(n,e,t,i,s=0)=>({id:n,kind:"ellipsoid",c:e,r:t,slot:i,k:s}),Eg=(n,e,t)=>[n*Math.sin(e),t,n*Math.cos(e)];function $d(n){const e=Math.max(0,Math.min(n,uh));return{n,drawn:e,decks:e>hh?2:1,extra:Math.max(0,n-e)}}const Mu={parts:[Wd("crown",[0,.995,-.01],.07,.17,.215,"gold",0,.025),wg("peak",[0,.94,.17],[.17,.03,.11],"shell",.015)],bands:[{part:"crown",y0:.9,y1:.955,slot:"shell"}],windows:[],lights:[],flames:[],seats:[],rims:[],plan:$d(0),tilt:-.12},Ag=.08,Tg=(n,e)=>[Math.sin(n)*Math.cos(e),Math.sin(e),Math.cos(n)*Math.cos(e)],$a=(n,e,t)=>[n[0]+t*e[0],n[1]+t*e[1],n[2]+t*e[2]];function Rg(n,e,t,i,s,r,o,a,c,l){const h=Math.asin(Math.max(-.95,Math.min(.95,(s-e[1])/t))),u=Tg(i,h),f=Math.asin(r/t),d=Math.asin(Math.min(.98,(r+.8*o)/t)),p={c:e,n:u,angle:f,frame:d-f+o/t,frameSlot:a,hosts:["body"]},x=$a(e,u,t*Math.cos(d)),m=t*Math.sin(d),g={id:n,kind:"ring",c:x,n:u,R:m,r:o,slot:a,k:.025},M=$a($a(e,u,t),[Math.sin(i),0,Math.cos(i)],-.31),E={p:[M[0],M[1]-c-yg,M[2]],yaw:i,captain:l};return{window:p,rim:g,seat:E,circle:{c:x,n:u,R:m+o}}}const Vn={rw:.24,tube:.05,pitch:.66,above:.42,low:.17,col:.54},Cg=n=>Math.ceil((hh*n-1)/3),Pg={1:[0],2:[-.54,Vn.col],3:[-.54,0,Vn.col]},Lg={stretch:n=>Cg(n)*Vn.pitch-Vn.above+Ag,port:(n,e,t)=>{const i={rw:Vn.rw,tube:Vn.tube,slot:"metal"};if(n===0)return{...i,y:t.top+Vn.above,yaw:0,low:Vn.low};const s=Math.floor((n-1)/3),r=1+3*s,o=Math.min(3,e.drawn-r);return{...i,y:t.top+Vn.above-(s+1)*Vn.pitch,yaw:Pg[o][n-r],low:0}},bands:n=>[{part:"body",y0:n.cy-.3,y1:n.top+.12,slot:"trim"}]},Ig={R:1.28,cy:1.45,stance:1.22};function Xd(n,e=Lg){const t=$d(n),{R:i,cy:s,stance:r}=Ig,o=s+e.stretch(t.decks),a={R:i,cy:s,top:o},c=[Wd("nozzle",[0,s-i+.05,0],.24,.5,.36,"metal",0,.06),Wa("body",[0,s,0],[0,o,0],i,i,"shell",0),{id:"fins",kind:"fin",n:4,yaw0:Math.PI/4,pts:[[.85,s-.15],[.6,s-.95],[1.75*r,s-1.62],[1.65*r,s-1]],t:.11,round:.06,slot:"trim",k:.03},Wa("nose",[0,o+.85,0],[0,o+1.2,0],.82,.5,"shell",.2),Wa("mast",[0,o+1.5,0],[0,o+1.72,0],.075,.055,"metal",.03)],l=[{c:[0,o+1.8,0],r:.15,phase:0}];c.push(xu("beacon",l[0].c,l[0].r,"trim",.02));for(let p=0;p<4;p++)c.push(xu(`foot${p}`,Eg(1.72*r,Math.PI/4+p*Math.PI/2,s-1.58),.15,"metal",.04));const h=[{part:"*",y0:o+1.02,y1:o+1.62,slot:"trim"},...e.bands(a)],u=[],f=[],d=[];for(let p=0;p<t.drawn;p++){const x=e.port(p,t,a),m=Rg(`port${p}`,[0,Math.min(Math.max(x.y,s),o),0],i,x.yaw,x.y,x.rw,x.tube,x.slot,x.low,p===0);c.push(m.rim),u.push(m.window),f.push(m.seat),d.push(m.circle)}return{parts:c,bands:h,windows:u,lights:l,flames:[{a:[0,s-i-.2,0],r:.4,len:.52}],seats:f,plan:t,rims:d}}const Dg=16;function qd(n,e,t=Dg){const i=n.needsRescan?[]:n.sessions.filter(o=>o.home!==null&&e(o.home)),r=[...i].sort((o,a)=>Date.parse(a.endedAt)-Date.parse(o.endedAt)||ds(o.key,a.key)).slice(0,Math.max(0,t));return{shown:r,hidden:i.length-r.length,unplaced:n.sessions.length-i.length,total:n.sessions.length,needsRescan:n.needsRescan,cap:t}}const uo=(n,e,t)=>`${n} ${n===1?e:t}`;function Ng(n){return n.needsRescan?`rescan to place drones (${uo(n.total,"session","sessions")} not placed)`:`${uo(n.shown.length,"drone","drones")} shown, ${uo(n.hidden,"placed session","placed sessions")} hidden by the cap of ${n.cap}, ${uo(n.unplaced,"session","sessions")} could not be placed`}function ss(n,e=60){const t=n.replace(/[\p{Cc}\p{Cf}]/gu," ").trim();return t.length>e?`${t.slice(0,e-1)}…`:t}function Fg(n){const e=ss(n.tool,24),t=[];return n.tool!=="claude-code"&&t.push(e),n.inferred&&t.push("inferred"),{label:t.length>0?t.join(" "):null,selectedLabel:[e,...n.inferred?["inferred"]:[]].join(" ")}}const Yd=n=>({key:n.key,seed:n.seed,tool:n.tool,home:n.home,...Fg(n)});function Ug(n,e,t){const i=n.filter(e).slice(0,Math.max(0,t));for(const s of n)i.length<t&&!e(s)&&i.push(s);return n.filter(s=>i.includes(s))}const Ui=n=>n.replace("T"," ").replace(/\.\d+Z$|Z$/,"")+" UTC";function Og(n,e){const t=[["tool",ss(n.tool)],["kind",n.kind==="subagent"?`subagent (${ss(n.agentType??"unknown type")})`:"main"],["started",Ui(n.startedAt)],["ended",Ui(n.endedAt)],["branch",n.branch===null?"unknown":ss(n.branch)],["model",n.model===null?"unknown":ss(n.model)]];return n.inferred&&t.push(["source","inferred"]),t.push(["home",ss(e,120)]),t}function Kd(n){const e=n.needsRescan?[]:n.members,t={total:n.total,bots:n.bots,needsRescan:n.needsRescan};if(e.length===0)return{seats:[],extra:0,...t};const i=e.find(o=>o.captain)??null,s=e.filter(o=>!o.captain),r=s.slice(0,uh-1);return{seats:[i,...r],extra:s.length-r.length,...t}}const Zd=n=>n?{person:n.person,seed:n.seed,captain:n.captain}:null,yu=(n,e,t)=>`${n} ${n===1?e:t}`;function kg(n){if(n.needsRescan)return"rescan to see your crew";if(n.total===0)return`crew: nobody in the scan window${n.bots>0?`, ${yu(n.bots,"bot or agent author","bot or agent authors")} left out`:""}`;const t=[`crew: ${n.seats.filter(i=>i!==null).length} aboard`];return n.extra>0&&t.push(`${n.extra} more not seated (shown as +${n.extra})`),n.seats[0]||t.push("captain's seat empty (none of your commits are in the scan window)"),n.bots>0&&t.push(`${yu(n.bots,"bot or agent author","bot or agent authors")} left out`),t.join(", ")}const kr=(n,e=60)=>ss(n.displayName,e)||"unnamed",di={min:120,max:480,default:180},Jd=n=>n!==void 0&&Number.isFinite(n)?Math.min(di.max,Math.max(di.min,Math.round(n))):di.default,da=n=>Math.floor(n*16/9),Bg=(n,e,t,i)=>Math.max(1,Math.floor(Math.min(t/n,i/e)));function zg(n,e){let t=null,i=null,s=null;return{ready:document.fonts.ready.then(()=>{}),async load(r){const o=Dd(r.layout);if(!o.ok)throw new Error(`invalid layout: ${o.errors.join("; ")}`);const a=r.camera?.fovDeg;if(a!==void 0&&!(a>0&&a<180))throw new Error(`invalid camera.fovDeg ${a}: must be between 0 and 180`);let c=[];if(r.drones){const d=Td(r.drones);if(!d.ok)throw new Error(`invalid drones: ${d.errors.join("; ")}`);if(d.value.head!==o.value.source.head)throw new Error(`drones are of ${d.value.head.slice(0,7)} but the layout of ${o.value.source.head.slice(0,7)} (different scans)`);const p=new Set(o.value.planets.map(x=>x.dirId));c=qd(d.value,x=>x==="star"||p.has(x)).shown}const l=o.value.source.head;if(r.beacons){const d=Cd(r.beacons);if(!d.ok)throw new Error(`invalid beacons: ${d.errors.join("; ")}`);if(d.value.head!==l)throw new Error(`beacons are of ${d.value.head.slice(0,7)} but the layout of ${l.slice(0,7)} (different scans)`)}if(r.cochange){const d=Md(r.cochange);if(!d.ok)throw new Error(`invalid cochange: ${d.errors.join("; ")}`);if(d.value.head!==l)throw new Error(`cochange is of ${d.value.head.slice(0,7)} but the layout of ${l.slice(0,7)} (different scans)`)}let h=null;if(r.crew){const d=wd(r.crew);if(!d.ok)throw new Error(`invalid crew: ${d.errors.join("; ")}`);if(d.value.head!==l)throw new Error(`crew is of ${d.value.head.slice(0,7)} but the layout of ${l.slice(0,7)} (different scans)`);h=Kd(d.value)}const u=r.focus?o.value.planets.findIndex(d=>d.dirId===r.focus.dirId):-1;if(r.focus&&u<0)throw new Error("invalid focus: dirId is not a planet of the layout");await n.load(o.value,r.fog??null,{animate:!1}),await n.setDrones(c.map(Yd),l),await n.setCrew(h?h.seats.map(Zd):[],h?.extra??0,l),n.setBeacons(r.beacons??null,l),n.setCoChange(r.cochange??null,l),n.reducedMotion=r.reducedMotion??!1,s=r.focus?u:null,n.focusFile=r.focus?.fileId??null,n.focusSince=0;const f=e();n.showHelp=!1,n.depthFade=r.depthFade??!0,n.resize(Jd(r.pixelHeight),f.w,f.h,f.dpr),i=r.camera?gg(r.camera):n.homePose(0),t=r},async renderFrame(r){if(!t||!i)throw new Error("renderFrame before load");return n.draw(T0(r,t.reducedMotion??!1),i,s)},lowResPixels(){if(!t)throw new Error("lowResPixels before load");return n.pixels()}}}const Su=n=>n.slice(0,7),Gg=n=>n instanceof At?n.title:"something went wrong";class Hg{constructor(e){this.host=e}host;gen=0;async refresh(e){if(e===null)return;const t=++this.gen;let i;try{i=await this.host.client.beacons()}catch(s){t===this.gen&&this.host.announce(`beacons unavailable: ${Gg(s)}`);return}t===this.gen&&this.show(i,e)}ticket(){return this.gen}apply(e,t,i){i!==this.gen||t===null||this.show(e,t)&&this.gen++}show(e,t){return e.head!==t||!this.host.view.setBeacons(e,t)?(this.host.announce(`beacons not applied: they are of ${Su(e.head)} but the layout of ${Su(t)} (different scans); waiting for the next update`),!1):(this.host.changed(),!0)}}const bu=n=>n.slice(0,7),Vg=n=>n instanceof At?n.title:"something went wrong";class Wg{constructor(e){this.host=e}host;gen=0;told=null;async refresh(e){if(e===null)return;const t=++this.gen;let i;try{i=await this.host.client.cochange()}catch(s){t===this.gen&&this.host.announce(`co-change unavailable: ${Vg(s)}`);return}if(t===this.gen){if(i.head!==e||!this.host.view.setCoChange(i,e)){this.host.announce(`co-change not applied: it is of ${bu(i.head)} but the layout of ${bu(e)} (different scans); waiting for the next update`);return}i.needsRescan&&this.told!==e&&(this.told=e,this.host.announce("co-change links need a rescan: run `commet scan`")),this.host.changed()}}}const Qd=700,fo=.005,wu=.0015,$g=.6,Xg=.5,qg=1.35,Eu=n=>n*qg,Yg=n=>{const e=Math.min(1,Math.max(0,n));return e*e*(3-2*e)};class Kg{current;target=null;glide=null;constructor(e){this.current=e}pose(){return this.current}focused(){return this.target!==null}moving(){return this.glide!==null}settle(){this.finishGlide()}reset(e){this.current=e,this.target=null,this.glide=null}focus(e,t,i){if(this.target=e,!e){this.glide=null;return}const s=_g(this.current,e.centre,e.radius,i);if(t){this.glide=null,this.current=s;return}this.glide={from:this.current,to:s,ms:0}}track(e){if(!this.target)return!1;const t=sn(e.centre,this.target.centre),i=e.radius!==this.target.radius;this.target={centre:e.centre,radius:e.radius};const s=this.glide?this.glide.to:this.current,r=i?this.glide?Gd(s,e.radius):Math.max(Eu(e.radius),s.dist):s.dist;if(t[0]===0&&t[1]===0&&t[2]===0&&r===s.dist)return!1;const o={...s,target:Kt(s.target,t),dist:r};return this.glide?this.glide.to=o:this.current=o,!0}step(e,t){const i=e.keys??new Set,s=e.drag??[0,0],r=e.wheel??0,o=i.size>0||s[0]!==0||s[1]!==0||r!==0;if(this.glide)if(o)this.finishGlide();else{this.glide.ms+=t;const c=this.glide.ms/Qd;return this.current=xg(this.glide.from,this.glide.to,Yg(c)),c>=1&&this.finishGlide(),!0}if(!o)return!1;i.size>0&&this.target&&(this.target=null);let a=this.current;if(this.target)a={...a,yaw:a.yaw-s[0]*fo,pitch:ec(a.pitch+s[1]*fo)},a={...a,dist:Math.max(Eu(this.target.radius),a.dist*Math.exp(r*wu))};else{if(s[0]!==0||s[1]!==0){const f=Gi(a),d=a.yaw-s[0]*fo,p=ec(a.pitch+s[1]*fo);a={yaw:d,pitch:p,dist:a.dist,target:Kt(f,Et(_i(d,p).fwd,a.dist))}}const c=_i(a.yaw,a.pitch),l=Math.max(Xg,a.dist*$g)*(t/1e3);let h=Et(c.fwd,-r*wu*a.dist);const u=(f,d,p)=>{i.has(f)&&(h=Kt(h,Et(d,p)))};u("forward",c.fwd,l),u("back",c.fwd,-l),u("right",c.right,l),u("left",c.right,-l),u("up",[0,1,0],l),u("down",[0,1,0],-l),a={...a,target:Kt(a.target,h)}}return this.current=a,!0}finishGlide(){this.glide&&(this.current=this.glide.to),this.glide=null}}const rt=Math.fround,Zg=rt(1/289),Zo=n=>rt(n-rt(Math.floor(rt(n*Zg))*289)),Xa=n=>Zo(rt(rt(rt(n*34)+1)*n)),qi=[rt(2/7),rt(rt(.5/7)-1),rt(1/7)];function dh(n,e,t){const i=(n+e+t)/3;let s=Math.floor(n+i),r=Math.floor(e+i),o=Math.floor(t+i);const a=(s+r+o)/6,c=[n-s+a,e-r+a,t-o+a],l=[c[0]>=c[1]?1:0,c[1]>=c[2]?1:0,c[2]>=c[0]?1:0],h=[1-l[0],1-l[1],1-l[2]],u=[h[2],h[0],h[1]],f=[Math.min(l[0],u[0]),Math.min(l[1],u[1]),Math.min(l[2],u[2])],d=[Math.max(l[0],u[0]),Math.max(l[1],u[1]),Math.max(l[2],u[2])],p=[[0,0,0],f,d,[1,1,1]],x=[0,1/6,1/3,.5];s=Zo(s),r=Zo(r),o=Zo(o);let m=0;for(let g=0;g<4;g++){const M=p[g],E=x[g],y=[c[0]-M[0]+E,c[1]-M[1]+E,c[2]-M[2]+E],T=Xa(Xa(Xa(o+M[2])+r+M[1])+s+M[0]),b=rt(T-rt(49*Math.floor(rt(rt(T*qi[2])*qi[2])))),v=Math.floor(rt(b*qi[2])),_=Math.floor(rt(b-rt(7*v)));let R=v*qi[0]+qi[1],C=_*qi[0]+qi[1];const L=1-Math.abs(R)-Math.abs(C);L<=0&&(R-=Math.floor(R)*2+1,C-=Math.floor(C)*2+1);const B=1.79284291400159-.85373472095314*(R*R+C*C+L*L);let A=Math.max(.6-(y[0]*y[0]+y[1]*y[1]+y[2]*y[2]),0);A*=A,m+=A*A*B*(R*y[0]+C*y[1]+L*y[2])}return 42*m}function Au(n,e,t){let i=0,s=.5;for(let r=0;r<4;r++)i+=s*dh(n,e,t),n=n*2.03+11.7,e=e*2.03+11.7,t=t*2.03+11.7,s*=.5;return i/.9375*.5+.5}const vn=n=>n>>>0;function Jg(n,e,t){return n=vn(Math.imul(n,1664525)+1013904223),e=vn(Math.imul(e,1664525)+1013904223),t=vn(Math.imul(t,1664525)+1013904223),n=vn(n+Math.imul(e,t)),e=vn(e+Math.imul(t,n)),t=vn(t+Math.imul(n,e)),n=vn(n^n>>>16),e=vn(e^e>>>16),t=vn(t^t>>>16),n=vn(n+Math.imul(e,t)),e=vn(e+Math.imul(t,n)),t=vn(t+Math.imul(n,e)),[n,e,t]}const qa=rt(1/4294967296),pa=(n,e,t)=>{const i=Jg(n+4096,e+4096,t+4096);return[rt(rt(i[0])*qa),rt(rt(i[1])*qa),rt(rt(i[2])*qa)]};function jd(n,e,t){const i=Math.floor(n),s=Math.floor(e),r=Math.floor(t),o=n-i,a=e-s,c=t-r;let l=9,h=[0,0,0],u=[0,0,0];for(let f=-1;f<=1;f++)for(let d=-1;d<=1;d++)for(let p=-1;p<=1;p++){const x=pa(i+p,s+d,r+f),m=[p+x[0]-o,d+x[1]-a,f+x[2]-c],g=m[0]*m[0]+m[1]*m[1]+m[2]*m[2];g<l&&(l=g,h=m,u=[p,d,f])}return{r1:h,c1:u}}function Qg(n,e,t){const{c1:i}=jd(n,e,t);return[Math.floor(n)+i[0],Math.floor(e)+i[1],Math.floor(t)+i[2]]}function jg(n,e,t){const i=Math.floor(n),s=Math.floor(e),r=Math.floor(t),o=n-i,a=e-s,c=t-r,{r1:l,c1:h}=jd(n,e,t);let u=9,f=h;for(let d=-2;d<=2;d++)for(let p=-2;p<=2;p++)for(let x=-2;x<=2;x++){const m=[h[0]+x,h[1]+p,h[2]+d],g=pa(i+m[0],s+m[1],r+m[2]),M=[m[0]+g[0]-o-l[0],m[1]+g[1]-a-l[1],m[2]+g[2]-c-l[2]],E=Math.hypot(M[0],M[1],M[2]);if(E*E>1e-5){const y=((l[0]+M[0]/2)*M[0]+(l[1]+M[1]/2)*M[1]+(l[2]+M[2]/2)*M[2])/E;y<u&&(u=y,f=m)}}return{edge:u,own:[i+h[0],s+h[1],r+h[2]],across:[i+f[0],s+f[1],r+f[2]]}}function ev(n,e,t){const i=pa(n[0],n[1],n[2]);return dh(rt(n[0]+i[0])*t+e[2],rt(n[1]+i[1])*t+e[0],rt(n[2]+i[2])*t+e[1])+(pa(n[0]+31,n[1]+31,n[2]+31)[0]-.5)*.5}const tv=(n,e,t)=>dh(n[0]*e*.35+t[1],n[1]*e*.35+t[2],n[2]*e*.35+t[0])*.5+.5;function nv(n,e,t){const i=Math.min(1,Math.max(0,(n-e-t)/.25));return i*i*(3-2*i)}function Ci(n){const e=(s,r,o)=>{let a=Math.imul(s,374761393)^Math.imul(r,668265263)^Math.imul(o,1440662683)^Math.imul(n,2246822519);return a=Math.imul(a^a>>>13,1274126177),((a^a>>>16)>>>0)/4294967296},t=s=>s*s*s*(s*(s*6-15)+10),i=(s,r,o)=>{const a=Math.floor(s),c=Math.floor(r),l=Math.floor(o),h=t(s-a),u=t(r-c),f=t(o-l);return hn(hn(hn(e(a,c,l),e(a+1,c,l),h),hn(e(a,c+1,l),e(a+1,c+1,l),h),u),hn(hn(e(a,c,l+1),e(a+1,c,l+1),h),hn(e(a,c+1,l+1),e(a+1,c+1,l+1),h),u),f)};return(s,r,o)=>{let a=0,c=.5,l=1;for(let h=0;h<4;h++)a+=c*i(s*l+31.7*h,r*l,o*l),l*=2.03,c*=.5;return a/.9375}}function Jo(n){const e=[-n[2],0,n[0]],t=Rr(e[0]*e[0]+e[2]*e[2]<1e-10?[1,0,0]:e);return{east:t,north:Rr(ch(t,n))}}const Tu=new Map;function ps(n){let e=Tu.get(n);if(!e){e=new Float64Array(3*n);for(let t=0;t<n;t++)e.set(Rd(t,n),3*t);Tu.set(n,e)}return e}const rs=(n,e,t)=>n[3*e]*n[3*t]+n[3*e+1]*n[3*t+1]+n[3*e+2]*n[3*t+2],Ru=new Map;function nc(n){let e=Ru.get(n);if(e)return e;const t=ps(n),i=Array.from({length:n},()=>new Set),s=r=>{for(let o=Math.ceil(Math.sqrt(4*Math.PI*n));;o*=2){const a=Math.max(0,r-o),c=Math.min(n-1,r+o),l=Array.from({length:c-a+1},(u,f)=>a+f).filter(u=>u!==r).sort((u,f)=>rs(t,r,f)-rs(t,r,u)||u-f).slice(0,6),h=l.length===6?Math.acos(Math.min(1,rs(t,r,l[5]))):1/0;if(a===0&&c===n-1||h<2*o/(n-1)-1e-9)return l}};for(let r=0;r<n;r++)for(const o of s(r))i[r].add(o),i[o].add(r);return e=i.map(r=>[...r].sort((o,a)=>o-a)),Ru.set(n,e),e}const Cu=new Map;function ep(n){let e=Cu.get(n);if(e!==void 0)return e;const t=ps(n),i=2e4;e=0;for(let s=0;s<i;s++){const r=1-2*(s+.5)/i,o=Math.sqrt(1-r*r),a=s*2.399963229728653,c=Math.cos(a)*o,l=Math.sin(a)*o;let h=-2;for(let u=0;u<n;u++)h=Math.max(h,c*t[3*u]+r*t[3*u+1]+l*t[3*u+2]);e=Math.max(e,Math.acos(Math.min(1,h)))}return Cu.set(n,e),e}const iv=1.7,sv=n=>n<=1?0:Math.ceil(iv*ep(n)*(n-1)/2)+1;function rv(n,e){const t=ps(e),i=n.length,s=new Int32Array(e).fill(-1),r=[];n.forEach((u,f)=>{Number.isInteger(u)&&u>=0&&u<e&&s[u]===-1&&(s[u]=f,r.push(f))});const o=new Int32Array(i),a=Array.from({length:i},()=>[]);for(const u of r)o[u]=1,a[u].push(n[u]);if(r.length>0){const u=nc(e),f=[...r].sort((p,x)=>n[p]-n[x]),d=new Int32Array(i);f.forEach((p,x)=>{d[p]=Math.floor(e/r.length)+(x<e%r.length?1:0)});for(let p=!0;p;){p=!1;for(const x of f){if(o[x]>=d[x])continue;let m=-1,g=-1/0;for(const M of a[x])for(const E of u[M]){if(s[E]!==-1)continue;const y=rs(t,E,n[x]);(y>g||y===g&&E<m)&&(m=E,g=y)}m<0||(s[m]=x,o[x]++,a[x].push(m),p=!0)}}for(let p=!0,x=!0;p&&x;){p=!1,x=!1;for(let m=0;m<e;m++){if(s[m]!==-1)continue;let g=-1;for(const M of u[m]){const E=s[M];E!==-1&&(g<0||o[E]<o[g]||o[E]===o[g]&&E<g)&&(g=E)}if(g<0){p=!0;continue}s[m]=g,o[g]++,a[g].push(m),x=!0}}for(let p=0;p<e;p++){if(s[p]!==-1)continue;let x=r[0];for(const m of r)rs(t,p,n[m])>rs(t,p,n[x])&&(x=m);s[p]=x,o[x]++,a[x].push(p)}}const c=new Int32Array(i).fill(-1);for(const u of r){if(o[u]===e){c[u]=n[u];continue}let f=0,d=0,p=0;for(const m of a[u])f+=t[3*m],d+=t[3*m+1],p+=t[3*m+2];let x=-1/0;for(const m of[...a[u]].sort((g,M)=>g-M)){const g=t[3*m]*f+t[3*m+1]*d+t[3*m+2]*p;g>x&&(x=g,c[u]=m)}}const l=ep(e),h=new Float64Array(i);for(const u of r)for(const f of a[u])h[u]=Math.max(h[u],Math.acos(Math.min(1,Math.max(-1,rs(t,f,c[u]))))+l);return{cells:e,owner:s,anchor:c,reach:h,size:o}}const tp={clear:0,haze:1,fogged:2},Ya={clear:1,refog:2.4,pulse:.9},Br={clear:Math.round(Ya.clear*zt),refog:Math.round(Ya.refog*zt),pulse:Math.round(Ya.pulse*zt)};function ma(n){if(!n)return()=>2;const e=new Map(n.files.map(t=>[t.fileId,tp[t.state]]));return t=>e.get(t)??2}const Pr=n=>n.start+Br[n.kind],np=n=>Pr(n)+(n.kind==="clear"?Br.pulse:0);function ov(n,e,t,i){if(!n||!e)return[];const s=ma(n),r=ma(e),o=[];for(const a of t){const c=s(a),l=r(a);l<c?o.push({fileId:a,kind:"clear",from:c,start:i}):l>c&&o.push({fileId:a,kind:"refog",from:c,start:i})}return o}function av(n,e,t){const i=new Map;for(const s of[...n,...e])i.set(s.fileId,s);return[...i.values()].filter(s=>np(s)>t).sort((s,r)=>s.fileId<r.fileId?-1:s.fileId>r.fileId?1:0)}function lv(n,e,t){if(!e||t>=Pr(e))return{level:n,from:n,kind:0,progress:0};const i=Math.max(0,(t-e.start)/Br[e.kind]);return{level:n,from:e.from,kind:e.kind==="clear"?1:2,progress:i}}function Ka(n){let e=2166136261;for(let t=0;t<n.length;t++)e=Math.imul(e^n.charCodeAt(t),16777619);return e^=e>>>15,e=Math.imul(e,2246822507),e^=e>>>13,(e>>>0)/4294967296}function cv(n){const e=n.cells;return{fileIds:n.settlements.map(t=>t.fileId),territory:rv(n.settlements.map(t=>t.cell),e),window:sv(e)}}const ip=n=>n.reduce((e,t)=>t.level>e?t.level:e,0),ga=3;function hv(n,e,t){const{territory:i}=n,s=i.cells,r=t??new Float32Array(s*ga*4),o=ps(s),a=ip(e);for(let c=0;c<s;c++){const l=i.owner[c],h=l>=0?e[l]:null;r.set([h?h.level:a,l>=0?i.anchor[l]:c,l>=0?i.reach[l]:0,0],c*4),r.set([h?h.kind:0,h?h.progress:0,h?h.from:a,0],(s+c)*4),r.set([o[3*c],o[3*c+1],o[3*c+2],l>=0?1:0],(2*s+c)*4)}return r}function uv(n,e,t,i,s){if(i!==0)return null;let r=-1/0,o=-1,a=-1/0;for(const c of[...n.fileIds,...t]){const l=e.get(c);if(l?.kind!=="clear"||l.from!==tp.fogged)continue;r=Math.max(r,Pr(l));const h=n.fileIds.indexOf(c);h>=0&&n.territory.anchor[h]>=0&&Pr(l)>=a&&(a=Pr(l),o=n.territory.anchor[h])}return o<0||s<r||s>=r+Br.pulse?null:{cell:o,progress:(s-r)/Br.pulse}}const fv=n=>({fogged:n.fogged,haze:n.haze,clear:n.clear,total:n.total});function ph(n,e){const t=n?.planets.find(i=>i.dirId===e);return t?fv(t):null}function dv(n){return n?[...n.planets,n.star].reduce((e,t)=>({fogged:e.fogged+t.fogged,haze:e.haze+t.haze,clear:e.clear+t.clear,total:e.total+t.total}),{fogged:0,haze:0,clear:0,total:0}):null}class pv{tickets=0;applied=0;layoutHead=null;fog=null;events=[];mismatch=!1;prior=null;change={cleared:0,refogged:0};ticket(){return++this.tickets}apply(e,t,i,s,r){if(t<=this.applied)return!1;this.applied=t,this.mismatch=e!==null&&e.head!==this.layoutHead;const o=this.mismatch?null:e,a=ov(this.fog??this.prior,o,i,s);return this.prior=null,this.change={cleared:a.filter(c=>c.kind==="clear").length,refogged:a.filter(c=>c.kind==="refog").length},this.events=av(this.events,r?a:[],s),this.fog=o,!0}setLayout(e,t){return this.layoutHead=e,t||(this.events=[]),!this.fog||this.fog.head===e?!1:(this.prior=this.fog,this.fog=null,this.mismatch=!0,this.events=[],this.change={cleared:0,refogged:0},!0)}prune(e){const t=this.events.filter(i=>np(i)>e);return t.length===this.events.length?!1:(this.events=t,!0)}settle(){return this.events.length===0?!1:(this.events=[],!0)}}const Lr={id:"cloud",density:.35,size:1,lift:1,float:.055,flat:.6,stretch:1},sp={id:"thin",density:.07,size:.7,lift:.5,float:.05,flat:.4,stretch:1},mv=1500,Za=2,$n={size:.058,sizeCore:.04,sizeJitter:.01,lift:.2,liftCore:.9},ai={edge:.35,off:.9,offJitter:.5,size:.5,sizeJitter:.25,lift:.5},gv=7,Pu=3,Ja=.05,Lu=28,Qa=.4,po={amp:.6,freq:2.5},vv=1,ys=.1,ja=.15;function rp(n){return 1+n.float+n.size*n.flat*(.75+n.lift*.5)}function Iu(n){const e=rp(n),t=n.size*Math.max(n.stretch,1),i=n.size*n.flat,s=t>i?Math.min(1,e*i/(t*t-i*i)):1;return Math.sqrt(t*t*(1-s*s)+(e+i*s)**2)}function Du(n){const e=n.size*($n.size+$n.sizeCore+$n.sizeJitter),t=n.lift*($n.lift+$n.liftCore),i={flat:n.flat,stretch:n.stretch,float:n.float};return Math.max(Iu({...i,size:e,lift:t}),Iu({...i,size:e*(ai.size+ai.sizeJitter),lift:t*ai.lift}))}const _v=Math.max(Du(Lr),Du(sp)),Nu={0:[0,0],1:[0,1],2:[1,0]},el=n=>Math.min(1,Math.max(0,n));function xv(n,e,t,i){const[s,r]=Nu[n.level];if(n.kind===0)return{cloud:s,mist:r,teal:!1};const[o,a]=Nu[n.from];let c;return n.kind===1?c=el(o===0&&s===0?(ja/2+i*(1-ja)-n.progress)/ja+.5:(e-(n.progress*(t+ys)-ys/2))/ys+.5):c=1-el((e-((1-n.progress)*(t+ys)-ys/2))/ys+.5),{cloud:o*c+s*(1-c),mist:a*c+r*(1-c),teal:n.kind===1&&o>0&&c>0}}class Fu{constructor(e,t,i){this.layer=i;const s=e.territory,r=s.cells,o=this.n=Math.max(r,Math.round(mv/i.size**2)),a=ps(r),c=this.centres=ps(o),l=(b,v)=>c[3*b]*a[3*v]+c[3*b+1]*a[3*v+1]+c[3*b+2]*a[3*v+2],h=b=>{if(o===r)return b;let v=0;for(let _=1;_<r;_++)l(b,_)>l(b,v)&&(v=_);return v};this.owner=new Int32Array(o),this.fromAnchor=new Float64Array(o),this.fade=new Float64Array(o);for(let b=0;b<o;b++){const v=this.owner[b]=r>0?s.owner[h(b)]:-1;this.fromAnchor[b]=v>=0?Math.acos(Math.min(1,Math.max(-1,l(b,s.anchor[v])))):0,this.fade[b]=Ka(`${i.id}|fade|${v>=0?e.fileIds[v]:""}|${b}`)}const u=Ci(t*31+5),f=Ci(t*17+9),d=Float64Array.from({length:o},(b,v)=>{const[_,R,C]=[c[3*v],c[3*v+1],c[3*v+2]];return Math.max(u(_*Za+4,R*Za,C*Za),f(_*.9,R*6+2,C*.9))}),p=(b,v)=>d[b]-d[v]||b-v,x=Array.from({length:o},(b,v)=>v).sort(p),m=d[x[Math.min(o-1,Math.round(o*(1-i.density)))]];this.gap=Uint8Array.from(d,b=>b<m?1:0);const g=new Map;for(let b=0;b<o;b++){const v=g.get(this.owner[b]);v?v.push(b):g.set(this.owner[b],[b])}for(const b of g.values()){const v=[...b].sort(p).reverse(),_=b.length*Lr.density*vv,R=i.id===Lr.id?_:b.length*i.density;for(let C=0;C<Math.min(Math.max(1,Math.ceil(R-1e-9)),v.length);C++)this.gap[v[C]]=0;if(i.id!==Lr.id)for(let C=Math.floor(_+1e-9);C<v.length;C++)this.gap[v[C]]=1}this.noiseCore=d.map(b=>Math.min(1,Math.max(0,(b-m+.012)*gv)));const M=Array.from({length:Lu},(b,v)=>{const _=D=>Ka(`sky|mass|${D}|${t}|${v}`)-.5,R=1-2*(v+.5)/Lu,C=Math.sqrt(1-R*R),L=v*Math.PI*(3-Math.sqrt(5));return[Math.cos(L)*C+_("x")*Qa,R+_("y")*Qa,Math.sin(L)*C+_("z")*Qa]}),E=Ci(t*13+1),y=Ci(t*19+2),T=Ci(t*23+3);this.massCell=Int32Array.from({length:o},(b,v)=>{const[_,R,C]=[c[3*v],c[3*v+1],c[3*v+2]],L=po.freq,D=[_+(E(_*L,R*L,C*L)-.5)*po.amp,R+(y(_*L,R*L,C*L)-.5)*po.amp,C+(T(_*L,R*L,C*L)-.5)*po.amp];let B=0,A=-1/0;return M.forEach((F,O)=>{const N=(D[0]*F[0]+D[1]*F[1]+D[2]*F[2])/Math.hypot(F[0],F[1],F[2]);N>A&&(A=N,B=O)}),B}),this.clumps=Array.from({length:o},(b,v)=>{const _=q=>Ka(`${i.id}|${q}|${t}|${v}`),R=[c[3*v]+(_("x")-.5)*Ja,c[3*v+1]+(_("y")-.5)*Ja,c[3*v+2]+(_("z")-.5)*Ja],C=Math.hypot(R[0],R[1],R[2]),[L,D,B]=[R[0]/C,R[1]/C,R[2]/C],A=Math.hypot(B,L),F=A>1e-9?[B/A,0,-L/A]:[1,0,0],O=[D*F[2]-B*F[1],B*F[0]-L*F[2],L*F[1]-D*F[0]],N=[0,1,2].map(q=>({ang:_(`a${q}`)*Math.PI*2,off:_(`o${q}`),size:_(`z${q}`)}));return{dir:R,east:F,north:O,size:_("s"),count:_("n"),sats:N}})}layer;n;centres;owner;fromAnchor;fade;gap;noiseCore;massCell;clumps;covers(e,t,i){const s=e.territory;return Array.from({length:this.n},(r,o)=>{const a=this.owner[o],c=a>=0?t[a]:{level:i,from:i,kind:0,progress:0},l=xv(c,this.fromAnchor[o],a>=0?s.reach[a]:0,this.fade[o]);return this.gap[o]&&(l.cloud=0,l.mist=0),l.cloud<=0&&(l.teal=!1),l})}puffs(e,t){const i=this.layer,s=this.anchors(e),r=this.edgeDistance(e),o={flat:i.flat,stretch:i.stretch,float:i.float};for(let a=0;a<this.n;a++){const c=e[a];if(c<=0)continue;const l=this.clumps[a],h=s[a],u=Math.min(this.noiseCore[a],(r[a]-1)/Pu),f=i.size*($n.size+u*$n.sizeCore+l.size*$n.sizeJitter)*(.4+.6*c),d=i.lift*($n.lift+u*$n.liftCore)*(.7+.3*c),p=t(a);p.push({dir:l.dir,size:f,lift:d,...o,anchor:h});const x=u<ai.edge?2+Math.floor(l.count*2):1;for(const m of l.sats.slice(0,x)){const g=f*(ai.off+m.off*ai.offJitter),M=Math.cos(m.ang)*g*1.4*i.stretch,E=Math.sin(m.ang)*g*.7,y=[l.dir[0]+l.east[0]*M+l.north[0]*E,l.dir[1]+l.east[1]*M+l.north[1]*E,l.dir[2]+l.east[2]*M+l.north[2]*E];p.push({dir:y,size:f*(ai.size+m.size*ai.sizeJitter),lift:d*ai.lift,...o,anchor:h})}}}edgeDistance(e){const t=nc(this.n),i=Pu+1,s=new Int32Array(this.n).fill(i);let r=[];for(let o=0;o<this.n;o++)e[o]<=0&&(s[o]=0,r.push(o));for(let o=1;o<i&&r.length>0;o++){const a=[];for(const c of r)for(const l of t[c])s[l]>o&&(s[l]=o,a.push(l));r=a}return s}anchors(e){const t=this.centres,i=nc(this.n),s=new Int32Array(this.n).fill(-1),r=new Array(this.n).fill(null);for(let o=0;o<this.n;o++){if(e[o]<=0||s[o]>=0)continue;const a=[],c=[o];for(s[o]=o;c.length;){const x=c.pop();a.push(x);for(const m of i[x])e[m]>0&&s[m]<0&&this.massCell[m]===this.massCell[o]&&(s[m]=o,c.push(m))}const l=[0,0,0];for(const x of a)l[0]+=t[3*x],l[1]+=t[3*x+1],l[2]+=t[3*x+2];const h=Math.hypot(l[0],l[1],l[2])||1,u=[l[0]/h,l[1]/h,l[2]/h];let f=1;for(const x of a)f=Math.min(f,u[0]*t[3*x]+u[1]*t[3*x+1]+u[2]*t[3*x+2]);const d=1+this.layer.float-Math.min(.5,Math.max(.06,Math.acos(Math.min(1,f))*1.1)),p=[u[0]*d,u[1]*d,u[2]*d];for(const x of a)r[x]=p}return r}}class Mv{constructor(e,t){this.plan=e,this.seed=t,this.grids={cloud:new Fu(e,t,Lr),mist:new Fu(e,t,sp)}}plan;seed;grids;sites(e){return this.grids[e].n}owners(e){return this.grids[e].owner}covers(e,t){return this.grids[t].covers(this.plan,e,ip(e))}at(e){const t=this.covers(e,"cloud"),i=this.covers(e,"mist").map(l=>l.mist),s=[],r=[],o=[],a=t.map(l=>l.cloud);this.grids.cloud.puffs(a,l=>t[l].teal?r:s),this.grids.mist.puffs(i,()=>o);const c=l=>l.filter(h=>h>0).length/l.length;return{cloud:s,teal:r,mist:o,cloudCover:c(a),mistCover:c(i)}}}const op=2,ap=.8,lp=.35,cp=.15,yv=.35,Uu=lp+cp,va=.35*ap;function zr(n,e,t){if(e==="star"){const s=n.star.moonlets;return{centre:[0,0,0],reach:s.length>0?s[0].orbit+Tr:n.star.radius}}const i=n.planets.find(s=>s.dirId===e);return i?{centre:Kn(i,t),reach:Math.max(Ta(i),i.radius*_v)}:null}function ic(n,e,t,i){const s=zr(n,e,i);if(!s)return null;const r=Zr((t^1540483477)>>>0),o=r(),a=r()*Math.PI*2,c=(r()*2-1)*yv,l=r(),h=s.reach+lp+cp*l,u=o*Math.PI*2+fi(i,op),f=[Math.cos(a),0,-Math.sin(a)],d=[Math.sin(a)*Math.cos(c),Math.sin(c),Math.cos(a)*Math.cos(c)],p=[0,1,2].map(x=>h*(Math.cos(u)*f[x]+Math.sin(u)*d[x]));return{centre:[s.centre[0]+p[0],s.centre[1]+p[1],s.centre[2]+p[2]],yaw:Math.atan2(p[0],p[2])}}const mo=["bottom-left","bottom-right","top-left","top-right"],tn={side:8,bottom:40,top:56},Ou=48,Sv=.5,bv=.1;function wv(n,e,t,i,s,r){const o=zr(n,e,i);if(!o)return[];const a=_r/op;return[i,...Array.from({length:Ou},(l,h)=>h*a/Ou)].flatMap(l=>{const h=ic(n,e,t,l),u=zr(n,e,l),f=jt(s,[0,1,2].map(m=>o.centre[m]+h.centre[m]-u.centre[m]));if(!f)return[];const d=Fi(va,f.depth,Gt(s))*(r.h/2),p=r.x+(f.x+1)/2*r.w,x=r.y+(1-f.y)/2*r.h;return[{x:p-d,y:x-d,w:2*d,h:2*d}]})}function Ev(n,e){const{w:t,h:i}=e.panel,s=n.endsWith("left")?tn.side:e.window.w-tn.side-t,r=n.startsWith("bottom")?e.window.h-tn.bottom-i:n==="top-left"?e.topLeft:tn.top;return{x:s,y:r,w:t,h:i}}const tl=(n,e)=>Math.max(0,Math.min(n.x+n.w,e.x+e.w)-Math.max(n.x,e.x))*Math.max(0,Math.min(n.y+n.h,e.y+e.h)-Math.max(n.y,e.y));function Av(n,e){const t=Ev(n,e),i=e.track.reduce((o,a)=>a.w>0&&a.h>0?Math.max(o,tl(a,t)/(a.w*a.h)):o,0),s=tl(t,{x:0,y:0,w:e.window.w,h:e.window.h}),r=e.others.reduce((o,a)=>o+tl(t,a),t.w*t.h-s);return{worst:i,clash:r}}const Ss=n=>(n.worst>Sv?2:0)+(n.clash>0?1:0);function hp(n,e){const t=new Map(mo.map(c=>[c,Av(c,n)])),i=c=>t.get(c);if(e!==null&&i(e).worst===0&&i(e).clash===0)return e;const s=(c,l)=>Ss(i(c))-Ss(i(l))||i(c).worst-i(l).worst||i(c).clash-i(l).clash||mo.indexOf(c)-mo.indexOf(l),r=[...mo].sort(s)[0];if(e===null)return r;const o=i(r),a=i(e);return Ss(o)<Ss(a)||Ss(o)===Ss(a)&&o.worst+bv<=a.worst?r:e}function We(n){const e=document.getElementById(n);if(!e)throw new Error(`#${n} missing from index.html`);return e}const nl={kind:"loading"},Tv="file detail is for agent sessions only",mh=(n,e,t)=>`${n} ${n===1?e:t}`,Zs=n=>mh(n,"edit","edits"),Rv=/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]|(?! )\p{Zs}/gu;function Gr(n){return n.replace(/\\/g,"\\\\").replace(Rv,e=>`\\u{${e.codePointAt(0).toString(16)}}`)}function Cv(n){const e=[];for(const t of[...n].sort((i,s)=>oh(i.path,s.path))){const i=t.path.lastIndexOf("/"),s=i<0?"":t.path.slice(0,i),r={name:Gr(t.path.slice(i+1)),edits:Zs(t.edits)},o=e.at(-1);o&&o.raw===s?o.files.push(r):e.push({raw:s,folder:s===""?"top level":Gr(`${s}/`),files:[r]})}return e.map(({folder:t,files:i})=>({folder:t,files:i}))}function Pv(n){return n.otherFiles===0?null:`${mh(n.otherFiles,"other file","other files")} not at HEAD (deleted, renamed, excluded, on another branch or in a removed worktree): ${Zs(n.otherEdits)}`}function Lv(n,e){const t=Math.max(0,...n);return n.map(i=>i<=0||t===0?0:Math.max(1,Math.ceil(i*e/t)))}function Iv(n){if(n.kind==="loading")return null;if(n.kind==="failed")return`session files unavailable: ${n.text}`;if(n.kind==="note")return n.text;const e=n.detail;if(e.files.length===0&&e.otherFiles===0)return"this session edited no files";const t=e.files.reduce((s,r)=>s+r.edits,0),i=[`${e.files.length} at HEAD with ${Zs(t)}`];return e.otherFiles>0&&i.push(`${mh(e.otherFiles,"other file","other files")} with ${Zs(e.otherEdits)}`),`this session's files: ${i.join(", ")}`}function il(n,e){const t=Math.floor(n),i=Math.floor(t/1e3),s=o=>String(o).padStart(2,"0"),r=`${Math.floor(i/3600)}:${s(Math.floor(i%3600/60))}:${s(i%60)}`;return e?`${r}.${String(t%1e3).padStart(3,"0")}`:r}function Dv(n){const e=n.buckets.reduce((c,l)=>c+l,0),t=Ui(n.startedAt);if(e===0)return`no edits from ${t} to ${Ui(n.endedAt)}`;if(n.spanMs===0)return e===1?`1 edit, at ${t}`:`${Zs(e)}, all at ${t}`;const i=n.buckets.length,s=(n.spanMs+1)/i,r=s<1e3,o=c=>Math.ceil(c*(n.spanMs+1)/i),a=n.buckets.flatMap((c,l)=>c>0?[`${c} in ${il(o(l),r)}–${il(o(l+1),r)}`]:[]);return`${Zs(e)} from ${t} to ${Ui(n.endedAt)}, in ${i} slices of ${il(s,r)}: ${a.join(", ")} after the start`}function Nv(n,e,t){return n instanceof Error?{kind:"failed",text:n instanceof At?n.title:"something went wrong"}:n.ok?n.key!==e||n.head!==t?{kind:"failed",text:"the answer was for another session or scan"}:n.needsRescan?{kind:"note",text:"rescan to see this session's files"}:{kind:"ready",detail:n}:n.error==="unknown-head"?{kind:"failed",text:"the repository was rescanned; the drones will follow the next update"}:{kind:"note",text:"no file detail for this session"}}const sl={kind:"loading"},Fv="rescan to see this crew member's planets and files",Uv="a touch is one of their commits in the scan window that changed it",up=n=>`${n} ${n===1?"touch":"touches"}`;function Ov(n,e){const t=[["name",kr(n,120)],["role",n.captain?"captain: you":"teammate"]];return t.push(["last active",e?.lastActive?Ui(e.lastActive):e?.needsRescan?"rescan to see":"…"]),t}function kv(n,e){const t=n.planets.map(i=>({star:i.home==="star",name:i.home==="star"?"the star (root files)":e(i.home)??"a body not on this map",n:i.touches}));return t.sort((i,s)=>Number(s.star)-Number(i.star)||ds(i.name,s.name)),t.map(i=>({name:i.star?i.name:Gr(i.name),touches:up(i.n)}))}function Bv(n){const e=[];for(const t of[...n].sort((i,s)=>oh(i.path,s.path))){const i=t.path.lastIndexOf("/"),s=i<0?"":t.path.slice(0,i),r={name:Gr(t.path.slice(i+1)),edits:up(t.touches)},o=e.at(-1);o&&o.raw===s?o.files.push(r):e.push({raw:s,folder:s===""?"top level":Gr(`${s}/`),files:[r]})}return e.map(({folder:t,files:i})=>({folder:t,files:i}))}function zv(n){return n.otherFiles===0?null:`${n.otherFiles} other ${n.otherFiles===1?"path":"paths"} they changed ${n.otherFiles===1?"is":"are"} not at HEAD (deleted, or renamed where history can't follow)`}function Gv(n,e){if(n.kind==="loading")return null;if(n.kind==="failed")return`crew member's files unavailable: ${n.text}`;if(n.kind==="note")return n.text;const t=n.detail;return t.planets.length===0&&t.files.length===0&&t.otherFiles===0?`${kr(e)} touched no files in the scan window`:`showing what ${e.captain?"you":kr(e)} touched in the scan window`}function Hv(n,e,t){return n instanceof Error?{kind:"failed",text:n instanceof At?n.title:"something went wrong"}:n.ok?n.person!==e||n.head!==t?{kind:"failed",text:"the answer was for another crew member or scan"}:n.needsRescan?{kind:"note",text:Fv}:{kind:"ready",detail:n}:n.error==="unknown-head"?{kind:"failed",text:"the repository was rescanned; the crew will follow the next update"}:{kind:"note",text:"no detail for this crew member"}}const Ct=(n,e,t)=>{const i=document.createElement(n);return e!==void 0&&(i.textContent=e),t!==void 0&&(i.className=t),i},ku=n=>{const e=Ct("ul");for(const t of n){const i=Ct("li");i.append(Ct("span",t.name,"name"),Ct("span",t.touches,"n")),e.append(i)}return e};function Vv(n,e){if(n.kind==="loading")return[Ct("p","loading planets and files…","note")];if(n.kind!=="ready")return[Ct("p",n.text,"note")];const t=n.detail,i=[],s=kv(t,e);s.length>0&&i.push(Ct("h3","planets touched"),ku(s));const r=Bv(t.files);r.length>0&&i.push(Ct("h3","files touched"));for(const a of r)i.push(Ct("p",a.folder,"folder"),ku(a.files.map(c=>({name:c.name,touches:c.edits}))));const o=zv(t);return o!==null&&i.push(Ct("p",o,"note")),s.length===0&&r.length===0&&o===null?i.push(Ct("p","no files touched in the scan window","note")):i.push(Ct("p",Uv,"note")),i}class Wv{root=We("crew-panel");section=null;rows=null;member=null;at=null;onClose=()=>{};constructor(){this.root.addEventListener("keydown",e=>{e.key==="Escape"&&(e.preventDefault(),this.onClose())})}get open(){return!this.root.hidden}show(e,t=!0){this.member=e;const i=Ct("h2",e.captain?"you, the captain":"crew member"),s=Ct("button","close");s.type="button",s.addEventListener("click",()=>this.onClose());const r=Ct("div",void 0,"top");r.append(i,s),this.rows=Ct("dl"),this.fillRows(null),this.section=Ct("section",void 0,"detail");const o=this.root.contains(document.activeElement);this.root.replaceChildren(r,this.rows,this.section),this.root.hidden=!1,(t||o)&&s.focus({preventScroll:!0})}showDetail(e,t){this.fillRows(e.kind==="ready"?e.detail:null,e.kind==="note"),this.section?.replaceChildren(...Vv(e,t))}fillRows(e,t=!1){if(!this.rows||!this.member)return;const i=Ov(this.member,e).map(([s,r])=>s==="last active"&&t?[s,"unknown"]:[s,r]);this.rows.replaceChildren(...i.flatMap(([s,r])=>[Ct("dt",s),Ct("dd",r)]))}get docked(){return this.at?.corner??null}size(){const e=this.root.getBoundingClientRect();return{w:e.width,h:e.height}}dock(e,t){const i=e==="top-left"?t:tn.top;if(this.at?.corner===e&&this.at.top===i)return;const s=e.endsWith("left"),r=e.startsWith("bottom"),o=this.root.style;o.left=s?`${tn.side}px`:"auto",o.right=s?"auto":`${tn.side}px`,o.bottom=r?`${tn.bottom}px`:"auto",o.top=r?"auto":`${i}px`,this.at={corner:e,top:i}}hide(){this.root.hidden=!0,this.root.replaceChildren(),this.section=null,this.rows=null,this.member=null;for(const e of["left","right","top","bottom"])this.root.style[e]="";this.at=null}}const $v=["shell","trim","metal","gold"],fp=8,dp=9,Ir=2,sc=4,bt=n=>{const e=Number(n).toFixed(5).replace(/0+$/,"").replace(/\.$/,".0");return e==="-0.0"?"0.0":e},Xv=n=>`vec2(${bt(n[0])}, ${bt(n[1])})`,Sn=n=>`vec3(${bt(n[0])}, ${bt(n[1])}, ${bt(n[2])})`,rl=n=>`vec4(${n.map(bt).join(", ")})`,Bn=(n,e)=>`${n}[${e.length}](${e.join(", ")})`;function ar(n){switch(n.kind){case"cone":return`sdRoundCone(p, ${Sn(n.a)}, ${Sn(n.b)}, ${bt(n.r1)}, ${bt(n.r2)})`;case"capcone":return`(sdCappedCone(p - ${Sn(n.c)}, ${bt(n.h)}, ${bt(n.r1-n.round)}, ${bt(n.r2-n.round)}) - ${bt(n.round)})`;case"sphere":return`(length(p - ${Sn(n.c)}) - ${bt(n.r)})`;case"ellipsoid":return`sdEllipsoid(p - ${Sn(n.c)}, ${Sn(n.r)})`;case"ring":return`sdRing(p - ${Sn(n.c)}, ${Sn(n.n)}, ${bt(n.R)}, ${bt(n.r)})`;case"fin":return`(${Array.from({length:n.n},(t,i)=>`sdFin(p, ${bt(n.yaw0+i*2*Math.PI/n.n)}, ${n.pts.map(Xv).join(", ")}, ${bt(n.t)})`).reduce((t,i)=>`min(${t}, ${i})`)} - ${bt(n.round)})`}}function qv(n){const e=(t,i)=>[[t[0]-i[0],t[1]-i[1],t[2]-i[2]],[t[0]+i[0],t[1]+i[1],t[2]+i[2]]];switch(n.kind){case"cone":{const t=[0,1,2].map(s=>Math.min(n.a[s]-n.r1,n.b[s]-n.r2)),i=[0,1,2].map(s=>Math.max(n.a[s]+n.r1,n.b[s]+n.r2));return[t,i]}case"capcone":{const t=Math.max(n.r1,n.r2);return e(n.c,[t,n.h,t])}case"sphere":return e(n.c,[n.r,n.r,n.r]);case"ellipsoid":return e(n.c,n.r);case"ring":return e(n.c,[n.R+n.r,n.R+n.r,n.R+n.r]);case"fin":{const t=Math.max(...n.pts.map(s=>s[0]))+n.t+n.round,i=n.pts.map(s=>s[1]);return[[-t,Math.min(...i)-n.round,-t],[t,Math.max(...i)+n.round,t]]}}}function La(n,e=.06){const t=n.parts.map(qv);for(const r of n.flames)t.push([[r.a[0]-r.r-.1,r.a[1]-r.len*1.3-.05,r.a[2]-r.r-.1],[r.a[0]+r.r+.1,r.a[1]+r.r,r.a[2]+r.r+.1]]);const i=[0,1,2].map(r=>Math.min(...t.map(o=>o[0][r]))-e),s=[0,1,2].map(r=>Math.max(...t.map(o=>o[1][r]))+e);return{lo:i,hi:s}}const Yv=`
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }
  // Inigo Quilez's capped cone about +y: radius r1 at y = -h, r2 at y = +h.
  float sdCappedCone(vec3 p, float h, float r1, float r2) {
    vec2 q = vec2(length(p.xz), p.y);
    vec2 k1 = vec2(r2, h), k2 = vec2(r2 - r1, 2.0 * h);
    vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
    vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
  }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
  // A torus about any unit axis n: a raised window rim.
  float sdRing(vec3 p, vec3 n, float R, float r) { float a = dot(p, n); return length(vec2(length(p - n * a) - R, a)) - r; }
  float sdPoly4(vec2 p, vec2 v0, vec2 v1, vec2 v2, vec2 v3) {
    vec2 v[4] = vec2[4](v0, v1, v2, v3);
    float d = dot(p - v[0], p - v[0]); float s = 1.0;
    for (int i = 0, j = 3; i < 4; j = i, i++) {
      vec2 e = v[j] - v[i]; vec2 w = p - v[i];
      vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
      d = min(d, dot(b, b));
      bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
      if (all(c) || all(not(c))) s *= -1.0;
    }
    return s * sqrt(d);
  }
  // A fin at yaw ang: the quad v0..v3 in its (radial, y) plane, extruded to half-thickness t.
  float sdFin(vec3 p, float ang, vec2 v0, vec2 v1, vec2 v2, vec2 v3, float t) {
    vec2 dir = vec2(sin(ang), cos(ang));
    float u = dot(p.xz, dir), w = dot(p.xz, vec2(dir.y, -dir.x));
    vec2 q = vec2(sdPoly4(vec2(u, p.y), v0, v1, v2, v3), abs(w) - t);
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0));
  }
`;function Kv(n){const{lo:e,hi:t}=La(n),i=n.parts,s=n.windows,r=n.bands,o=n.lights,a=n.flames;if(i.length===0)throw new Error("a ship spec needs a part");if(i.length>31)throw new Error("too many parts for a window host mask");if(a.length>Ir)throw new Error("too many flames");if(o.length>sc)throw new Error("too many lights");const c=i.map(p=>p.id),l=p=>{const x=c.indexOf(p);if(x<0)throw new Error(`no part ${p}`);return x};let h=`float d = ${ar(i[0])};
`;for(const p of i.slice(1))h+=p.k>0?`    d = smin(d, ${ar(p)}, ${bt(p.k)});
`:`    d = min(d, ${ar(p)});
`;let u=`float best = ${ar(i[0])}; int part = 0; float e;
`;i.slice(1).forEach((p,x)=>{u+=`    e = ${ar(p)}; if (e < best) { best = e; part = ${x+1}; }
`});const f=p=>String($v.indexOf(p)),d=p=>p.reduce((x,m)=>x|1<<l(m),0);return`
  const vec3 BMIN = ${Sn(e)};
  const vec3 BMAX = ${Sn(t)};
  uniform float uFlameL[${Ir}]; // each flame's current length (design units)
  uniform vec2 uFlameW[${Ir}]; // and its tip's wobble (x, z)
  uniform float uLightOn[${sc}];
  ${Yv}
  float hull(vec3 p) {
    ${h}    return d;
  }
  int partOf(vec3 p) {
    ${u}    return part;
  }
  ${a.length?`
  const vec3 FLAME_A[${a.length}] = ${Bn("vec3",a.map(p=>Sn(p.a)))};
  const float FLAME_R[${a.length}] = ${Bn("float",a.map(p=>bt(p.r)))};
  vec3 flameTip(int j) { return FLAME_A[j] + vec3(uFlameW[j].x, -uFlameL[j], uFlameW[j].y); }
  float flameField(vec3 p, out int jj) {
    float best = 1e9; jj = -1;
    for (int j = 0; j < ${a.length}; j++) { float e = sdRoundCone(p, FLAME_A[j], flameTip(j), FLAME_R[j], 0.035); if (e < best) { best = e; jj = j; } }
    return best;
  }`:`
  const vec3 FLAME_A[1] = vec3[1](vec3(0.0)); // no flame (the cap): stand-ins for the shader's flame branch
  const float FLAME_R[1] = float[1](0.0);
  vec3 flameTip(int j) { return vec3(0.0); }
  float flameField(vec3 p, out int jj) { jj = 0; return 1e9; }`}
  const int SLOT_OF[${i.length}] = ${Bn("int",i.map(p=>f(p.slot)))};
  ${s.length?`
  const vec4 CW_C[${s.length}] = ${Bn("vec4",s.map(p=>rl([...p.c,Math.cos(p.angle)])))}; // a round window on a sphere: centre, cos of its angular radius
  const vec4 CW_N[${s.length}] = ${Bn("vec4",s.map(p=>rl([...p.n,Math.cos(p.angle+p.frame)])))}; // its axis, cos of the rim's outer edge
  const int CW_MASK[${s.length}] = ${Bn("int",s.map(p=>String(d(p.hosts))))}; // the parts it may cut (never its rim)
  const int CW_SLOT[${s.length}] = ${Bn("int",s.map(p=>f(p.frameSlot)))};`:""}
  ${r.length?`
  const vec3 BAND[${r.length}] = ${Bn("vec3",r.map(p=>Sn([p.part==="*"?-1:l(p.part),p.y0,p.y1])))};
  const int BAND_SLOT[${r.length}] = ${Bn("int",r.map(p=>f(p.slot)))};`:""}
  ${o.length?`const vec4 LIGHT[${o.length}] = ${Bn("vec4",o.map(p=>rl([...p.c,p.r])))};`:""}
  int paint(vec3 p, int part, out int light) {
    light = -1;
    ${o.length?`for (int i = 0; i < ${o.length}; i++) if (distance(p, LIGHT[i].xyz) < LIGHT[i].w + 0.02) { light = i; return ${dp}; }`:""}
    ${s.length?`for (int i = 0; i < ${s.length}; i++) {
      if (((CW_MASK[i] >> part) & 1) == 0) continue;
      float ca = dot(normalize(p - CW_C[i].xyz), CW_N[i].xyz);
      if (ca > CW_C[i].w) return ${fp};
      if (ca > CW_N[i].w) return CW_SLOT[i];
    }`:""}
    ${r.length?`for (int i = 0; i < ${r.length}; i++) if ((int(BAND[i].x) == part || BAND[i].x < 0.0) && p.y > BAND[i].y && p.y < BAND[i].z) return BAND_SLOT[i];`:""}
    return SLOT_OF[part];
  }
`}const go=.25,xr=La(Xd(uh),0),ol=Math.max(...[xr.lo[0],xr.lo[2],xr.hi[0],xr.hi[2]].map(Math.abs))*Un,Zv=xr.lo[1]*Un;function pp(n){const e=[-Math.cos(Ko.yaw),0,Math.sin(Ko.yaw)],i=zr(n,"star",0).reach+Uu+va+go+ol,s=i-ol,r=i+ol;let o=go;for(const c of n.planets){const l=zr(n,c.dirId,0).reach+Uu+va+go,h=Math.max(0,c.orbit-r,s-c.orbit);h<l&&(o=Math.max(o,Math.sqrt(l*l-h*h)+go))}const a=.07*Un;return{centre:[e[0]*i,o-Zv+a,e[2]*i],yaw:Ko.yaw}}function mp(n,e){return e?gp(ms(n,0),e,0,.07):[]}function gp(n,e,t,i){const{lo:s,hi:r}=La(e,0),o=[];for(const a of[s[0],r[0]])for(const c of[s[1]-i,r[1]+i])for(const l of[s[2],r[2]])o.push(_a(n,[a,c,l],t));return o}function Jv(n,e,t,i,s,r){const o=ms(n,t),a=[...gp(o,e,vi(t)*gi,0),o.centre].map(l=>jt(i,l));return a.some(l=>l===null)?null:{x:(a.at(-1).x+1)/2*s,y:(1-Math.min(...a.map(l=>l.y)))/2*r}}function Qv(n,e,t){const i=e?.parts.find(f=>f.id==="body"),s=e?.parts.find(f=>f.id==="nose");if(!e||i?.kind!=="cone")return[];const r=ms(n,t),o=vi(t)*gi,[a,c,l]=[i.a[1],i.b[1],i.r1],h=Math.max(1,Math.ceil((c-a)/(l/2))),u=Array.from({length:h+1},(f,d)=>({centre:_a(r,[0,a+(c-a)*d/h,0],o),radius:l*Un}));if(s?.kind==="cone")for(const[f,d]of[[s.a,s.r1],[s.b,s.r2]])u.push({centre:_a(r,f,o),radius:d*Un});return u}function ms(n,e,t=pp(n)){const i=lh(e),s=Math.cos(i),r=Math.sin(i),[o,a,c]=t.centre;return{centre:[o*s+c*r,a,c*s-o*r],yaw:t.yaw+i}}function _a(n,e,t){const i=Math.cos(n.yaw),s=Math.sin(n.yaw),r=e[0]*Un,o=(e[1]+Vd(t).bob)*Un,a=e[2]*Un;return[n.centre[0]+r*i+a*s,n.centre[1]+o,n.centre[2]-r*s+a*i]}function jv(n,e){const t=Math.cos(n.yaw),i=Math.sin(n.yaw);return[e[0]*t+e[2]*i,e[1],-e[0]*i+e[2]*t]}function rc(n,e,t){return n.rims.map(i=>({centre:_a(e,i.c,t),normal:jv(e,i.n),radius:i.R*Un}))}function e_(n,e,t,i,s,r){const o=pp(n),a=rn*zt/Bu;return Array.from({length:Bu},(c,l)=>i+l*a).flatMap(c=>{const l=rc(e,ms(n,c,o),vi(c)*gi)[t],h=l?jt(s,l.centre):null;if(!l||!h)return[];const u=Fi(l.radius,h.depth,Gt(s))*(r.h/2),f=r.x+(h.x+1)/2*r.w,d=r.y+(1-h.y)/2*r.h;return[{x:f-u,y:d-u,w:2*u,h:2*u}]})}const Bu=8,al=n=>n.slice(0,7),t_=n=>{if(n.hidden)return null;const e=n.getBoundingClientRect();return e.width>0&&e.height>0?{x:e.left,y:e.top,w:e.width,h:e.height}:null},vo=n=>n instanceof At?n.title:"something went wrong";class n_{constructor(e){this.host=e,this.panel.onClose=()=>{this.deselect(),e.release()}}host;panel=new Wv;line=We("crew-hud");data=null;seating=null;gen=0;note="";detail=null;detailGen=0;async refresh(e){if(e===null)return;const t=++this.gen;this.dropDetail(),this.selected()&&this.panel.showDetail(sl,this.nameOf),this.data&&this.data.head!==e&&(this.data=null,this.seating=null,this.deselect());let i;try{i=await this.host.client.crew()}catch(r){i=r instanceof Error?r:new Error(String(r))}if(t!==this.gen)return;const s=this.data?.head===e?this.data:null;i instanceof Error?(this.note=`update failed: ${vo(i)}`,this.host.announce(`crew unavailable: ${vo(i)}`),await this.apply(s,e,t)):i.head!==e?(this.note=`update of ${al(i.head)} not applied: other scan`,this.host.announce(`crew not applied: it is of ${al(i.head)} but the layout of ${al(e)} (different scans); waiting for the next update`),await this.apply(s,e,t)):(this.note="",await this.apply(i,e,t))}async apply(e,t,i){const s=e?Kd(e):null;let r;try{r=await this.host.view.setCrew(s?s.seats.map(Zd):[],s?.extra??0,t)}catch(c){if(i!==this.gen)return;this.host.announce(`crew not drawn: ${vo(c)}`),this.selected()&&this.panel.showDetail({kind:"failed",text:`the ship could not be drawn (${vo(c)}); this crew member's files will show after the next update`},this.nameOf);return}if(!r||i!==this.gen)return;const o=this.seating?.seats.length??0;this.data=e,this.seating=s,this.line.textContent=(s?kg(s):"crew: none loaded")+(this.note?` (${this.note})`:""),(s?.seats.length??0)!==o&&this.host.reframe();const a=this.selected();a?this.showPanel(a,!1):this.deselect(),this.host.redraw()}nameOf=e=>this.host.view.model?.planets.find(t=>t.dirId===e)?.path??null;showPanel(e,t=!0,i=t){this.host.view.selectedName=e.captain?"you":kr(e,24),this.panel.show(e,t),this.showDetail(e,i)}showDetail(e,t){const i=this.data?.head;if(i===void 0)return;const s=this.detail;if(s&&s.person===e.person&&s.head===i&&s.state.kind!=="failed"){this.panel.showDetail(s.state,this.nameOf),t&&this.say(s.state,e,!0);return}this.loadDetail(e,i,t)}say(e,t,i){const s=Gv(e,t);s!==null&&(i||e.kind==="failed")&&this.host.announce(s)}async loadDetail(e,t,i){const s=++this.detailGen;this.detail={person:e.person,head:t,state:sl,gen:s},this.panel.showDetail(sl,this.nameOf);let r;try{r=await this.host.client.crewDetail(e.person,t)}catch(a){r=a instanceof Error?a:new Error(String(a))}if(s!==this.detailGen||this.host.view.selectedPerson!==e.person||this.data?.head!==t){this.detail?.gen===s&&(this.detail=null);return}const o=Hv(r,e.person,t);this.detail={person:e.person,head:t,state:o,gen:s},this.panel.showDetail(o,this.nameOf),this.say(o,e,i)}pick(e,t,i,s){const r=this.host.view.pickCrewAt(e,t,i,s),o=r===null?void 0:this.seating?.seats.find(a=>a?.person===r)??void 0;return o?(this.host.view.selectedPerson=o.person,this.host.announce(o.captain?"selected you, the captain":`selected crew member ${kr(o)}`),this.showPanel(o),this.host.redraw(),!0):!1}dock(e,t,i){if(!this.panel.open)return;const s=this.host.view,r=s.model,o=s.crewSpec,a=s.crewSeat(s.selectedPerson);if(!r||!o||a===null)return;const c=s.labels.canvas,l=c.getBoundingClientRect();if(l.width===0||l.height===0||c.height===0)return;const h=Math.round(l.top+s.infoEnd(i)*l.height/c.height+tn.side),u={track:e_(r,o,a,e,t,{x:l.left,y:l.top,w:l.width,h:l.height}),panel:this.panel.size(),window:{w:innerWidth,h:innerHeight},topLeft:h,others:this.host.others().flatMap(f=>t_(f)??[])};this.panel.dock(hp(u,this.panel.docked),h)}selected(){const e=this.host.view.selectedPerson;return e===null?void 0:this.seating?.seats.find(t=>t?.person===e)??void 0}dropDetail(){this.detailGen++,this.detail=null}deselect(){if(this.dropDetail(),this.host.view.selectedPerson===null&&!this.panel.open)return;this.host.view.selectedPerson=null,this.host.view.selectedName="";const e=this.panel.open&&We("crew-panel").contains(document.activeElement);this.panel.hide(),e&&this.host.release(),this.host.redraw()}}const ht={space:we.world.space,ink:we.world.cloud[3],dim:we.world.stars[1],accent:we.accent.teal[3],added:we.world.land[3],removed:we.world.glow[1],rule:we.world.stars[0]},zu={cell:3,gap:1,rows:12,upscale:2},vt=(n,e,t)=>{const i=document.createElement(n);return e!==void 0&&(i.textContent=e),t!==void 0&&(i.className=t),i};function i_(n,e){const{cell:t,gap:i,rows:s}=zu,r=vt("canvas",void 0,"timeline");r.width=n.length*(t+i)-i,r.height=s+1;const o=globalThis.devicePixelRatio>0?globalThis.devicePixelRatio:1,a=Math.max(1,Math.round(zu.upscale*o));r.style.width=`${r.width*a/o}px`,r.style.height=`${r.height*a/o}px`,r.setAttribute("role","img"),r.setAttribute("aria-label",e);const c=r.getContext("2d");return c&&(c.fillStyle=ht.space,c.fillRect(0,0,r.width,r.height),c.fillStyle=ht.rule,c.fillRect(0,s,r.width,1),c.fillStyle=ht.ink,Lv(n,s).forEach((l,h)=>{l>0&&c.fillRect(h*(t+i),s-l,t,l)})),r}function s_(n){if(n.kind==="loading")return[vt("p","loading files…","note")];if(n.kind!=="ready")return[vt("p",n.text,"note")];const e=n.detail,t=[vt("h3","files edited")],i=Cv(e.files);for(const c of i){t.push(vt("p",c.folder,"folder"));const l=vt("ul");for(const h of c.files){const u=vt("li");u.append(vt("span",h.name,"name"),vt("span",h.edits,"n")),l.append(u)}t.push(l)}const s=Pv(e);s!==null&&t.push(vt("p",s,"note")),i.length===0&&s===null&&t.push(vt("p","no edits recorded","note"));const r=Dv(e),o=vt("p",void 0,"axis");o.append(vt("span",Ui(e.startedAt)),vt("span",Ui(e.endedAt)));const a=vt("p",r,"note");return a.setAttribute("aria-hidden","true"),t.push(vt("h3","edits over time"),i_(e.buckets,r),o,a),t}class r_{root=We("drone-panel");section=null;at=null;onClose=()=>{};constructor(){this.root.addEventListener("keydown",e=>{e.key==="Escape"&&(e.preventDefault(),this.onClose())})}show(e,t,i=!0){const s=vt("h2","agent session"),r=vt("button","close");r.type="button",r.addEventListener("click",()=>this.onClose());const o=vt("div",void 0,"top");o.append(s,r);const a=vt("dl");for(const[l,h]of Og(e,t))a.append(vt("dt",l),vt("dd",h));this.section=vt("section",void 0,"detail");const c=this.root.contains(document.activeElement);this.root.replaceChildren(o,a,this.section),this.root.hidden=!1,(i||c)&&r.focus({preventScroll:!0})}showDetail(e){this.section?.replaceChildren(...s_(e))}get docked(){return this.at?.corner??null}size(){const e=this.root.getBoundingClientRect();return{w:e.width,h:e.height}}dock(e,t){const i=e==="top-left"?t:tn.top;if(this.at?.corner===e&&this.at.top===i)return;const s=e.endsWith("left"),r=e.startsWith("bottom"),o=this.root.style;o.left=s?`${tn.side}px`:"auto",o.right=s?"auto":`${tn.side}px`,o.bottom=r?`${tn.bottom}px`:"auto",o.top=r?"auto":`${i}px`,this.at={corner:e,top:i}}hide(){this.root.hidden=!0,this.root.replaceChildren(),this.section=null;for(const e of["left","right","top","bottom"])this.root.style[e]="";this.at=null}}const ll=n=>n.slice(0,7),o_=n=>{if(n.hidden)return null;const e=n.getBoundingClientRect();return e.width>0&&e.height>0?{x:e.left,y:e.top,w:e.width,h:e.height}:null},_o=n=>n instanceof At?n.title:"something went wrong";class a_{constructor(e){this.host=e,this.panel.onClose=()=>{this.deselect(),e.release()}}host;panel=new r_;line=We("drones-hud");data=null;shown=[];gen=0;note="";detail=null;detailGen=0;async refresh(e){if(e===null)return;const t=++this.gen;this.dropDetail(),this.openAgentSession()&&this.panel.showDetail(nl),this.data&&this.data.head!==e&&(this.data=null,this.shown=[],this.deselect());let i;try{i=await this.host.client.drones()}catch(r){i=r instanceof Error?r:new Error(String(r))}if(t!==this.gen)return;const s=this.data?.head===e?this.data:null;i instanceof Error?(this.note=`update failed: ${_o(i)}`,this.host.announce(`drones unavailable: ${_o(i)}`),await this.apply(s,e,t)):i.head!==e?(this.note=`update of ${ll(i.head)} not applied: other scan`,this.host.announce(`drones not applied: they are of ${ll(i.head)} but the layout of ${ll(e)} (different scans); waiting for the next update`),await this.apply(s,e,t)):(this.note="",await this.apply(i,e,t))}async apply(e,t,i){const s=this.host.view.model,r=s&&e?qd(e,c=>c==="star"||s.planets.some(l=>l.dirId===c)):null;let o;try{o=await this.host.view.setDrones(r?r.shown.map(Yd):[],t)}catch(c){if(i!==this.gen)return;this.host.announce(`drones not drawn: ${_o(c)}`),this.openAgentSession()&&this.panel.showDetail({kind:"failed",text:`the drones could not be drawn (${_o(c)}); this session's files will show after the next update`});return}if(!o||i!==this.gen)return;this.data=e,this.shown=r?r.shown:[],this.line.textContent=(r?Ng(r):"drones: none loaded")+(this.note?` (${this.note})`:"");const a=this.shown.find(c=>c.key===this.host.view.selectedDrone);a?this.showPanel(a,!1):this.deselect(),this.host.redraw()}showPanel(e,t=!0,i=t){const s=e.home==="star"||e.home===null?"the star":this.host.view.model?.planets.find(r=>r.dirId===e.home)?.path??"unknown";this.panel.show(e,s,t),this.showDetail(e,i)}showDetail(e,t){if(e.inferred){this.dropDetail(),this.panel.showDetail({kind:"note",text:Tv});return}const i=this.data?.head;if(i===void 0)return;const s=this.detail;if(s&&s.key===e.key&&s.head===i&&s.state.kind!=="failed"){this.panel.showDetail(s.state),t&&this.say(s.state,!0);return}this.loadDetail(e.key,i,t)}say(e,t){const i=Iv(e);i!==null&&(t||e.kind==="failed")&&this.host.announce(i)}async loadDetail(e,t,i){const s=++this.detailGen;this.detail={key:e,head:t,state:nl,gen:s},this.panel.showDetail(nl);let r;try{r=await this.host.client.droneDetail(e,t)}catch(a){r=a instanceof Error?a:new Error(String(a))}if(s!==this.detailGen||this.host.view.selectedDrone!==e||this.data?.head!==t){this.detail?.gen===s&&(this.detail=null);return}const o=Nv(r,e,t);this.detail={key:e,head:t,state:o,gen:s},this.panel.showDetail(o),this.say(o,i)}pick(e,t,i,s){const r=this.host.view.pickDroneAt(e,t,i,s),o=r===null?void 0:this.shown.find(a=>a.key===r);return o?(this.host.view.selectedDrone=o.key,this.host.announce(`selected a ${o.tool} agent session`),this.showPanel(o),this.host.redraw(),!0):!1}dock(e,t,i){if(!this.panelOpen())return;const s=this.host.view,r=s.model,o=this.shown.find(u=>u.key===s.selectedDrone);if(!r||!o||o.home===null)return;const a=s.labels.canvas,c=a.getBoundingClientRect();if(c.width===0||c.height===0||a.height===0)return;const l=Math.round(c.top+s.infoEnd(i)*c.height/a.height+tn.side),h={track:wv(r,o.home,o.seed,e,t,{x:c.left,y:c.top,w:c.width,h:c.height}),panel:this.panel.size(),window:{w:innerWidth,h:innerHeight},topLeft:l,others:this.host.others().flatMap(u=>o_(u)??[])};this.panel.dock(hp(h,this.panel.docked),l)}openAgentSession(){const e=this.shown.find(t=>t.key===this.host.view.selectedDrone);return e&&!e.inferred?e:void 0}dropDetail(){this.detailGen++,this.detail=null}deselect(){if(this.dropDetail(),this.host.view.selectedDrone===null&&!this.panelOpen())return;this.host.view.selectedDrone=null;const e=this.panelOpen()&&We("drone-panel").contains(document.activeElement);this.panel.hide(),e&&this.host.release(),this.host.redraw()}panelOpen(){return!We("drone-panel").hidden}}const cl={A:[".#.","#.#","###","#.#","#.#"],B:["##.","#.#","##.","#.#","##."],C:[".##","#..","#..","#..",".##"],D:["##.","#.#","#.#","#.#","##."],E:["###","#..","##.","#..","###"],F:["###","#..","##.","#..","#.."],G:[".##","#..","#.#","#.#",".##"],H:["#.#","#.#","###","#.#","#.#"],I:["###",".#.",".#.",".#.","###"],J:["..#","..#","..#","#.#",".#."],K:["#.#","#.#","##.","#.#","#.#"],L:["#..","#..","#..","#..","###"],M:["#...#","##.##","#.#.#","#...#","#...#"],N:["#..#","##.#","#.##","#..#","#..#"],O:[".#.","#.#","#.#","#.#",".#."],P:["##.","#.#","##.","#..","#.."],Q:[".#.","#.#","#.#","##.",".##"],R:["##.","#.#","##.","#.#","#.#"],S:[".##","#..",".#.","..#","##."],T:["###",".#.",".#.",".#.",".#."],U:["#.#","#.#","#.#","#.#","###"],V:["#.#","#.#","#.#","#.#",".#."],W:["#...#","#...#","#.#.#","##.##","#...#"],X:["#.#","#.#",".#.","#.#","#.#"],Y:["#.#","#.#",".#.",".#.",".#."],Z:["###","..#",".#.","#..","###"],a:["...",".##","#.#","#.#",".##","..."],b:["#..","##.","#.#","#.#","##.","..."],c:["...",".##","#..","#..",".##","..."],d:["..#",".##","#.#","#.#",".##","..."],e:["...",".#.","###","#..",".##","..."],f:["..#",".#.","###",".#.",".#.","..."],g:["...",".##","#.#",".##","..#","##."],h:["#..","##.","#.#","#.#","#.#","..."],i:["#",".","#","#","#","."],j:[".#","..",".#",".#",".#","#."],k:["#..","#.#","##.","##.","#.#","..."],l:["#.","#.","#.","#.",".#",".."],m:[".....","##.#.","#.#.#","#.#.#","#.#.#","....."],n:["...","##.","#.#","#.#","#.#","..."],o:["...",".#.","#.#","#.#",".#.","..."],p:["...","##.","#.#","#.#","##.","#.."],q:["...",".##","#.#","#.#",".##","..#"],r:["...","#.#","##.","#..","#..","..."],s:["...",".##","#..","..#","##.","..."],t:[".#.","###",".#.",".#.","..#","..."],u:["...","#.#","#.#","#.#",".##","..."],v:["...","#.#","#.#","#.#",".#.","..."],w:[".....","#...#","#.#.#","#.#.#",".#.#.","....."],x:["...","#.#",".#.",".#.","#.#","..."],y:["...","#.#","#.#",".##","..#","##."],z:["...","###",".#.","#..","###","..."],0:["###","#.#","#.#","#.#","###"],1:[".#.","##.",".#.",".#.","###"],2:["##.","..#",".#.","#..","###"],3:["##.","..#",".#.","..#","##."],4:["#.#","#.#","###","..#","..#"],5:["###","#..","##.","..#","##."],6:[".##","#..","###","#.#","###"],7:["###","..#",".#.",".#.",".#."],8:["###","#.#","###","#.#","###"],9:["###","#.#","###","..#","##."]," ":["..","..","..","..",".."],".":[".",".",".",".","#"],",":[".",".",".",".","#","#"],":":[".","#",".","#","."],";":[".","#",".",".","#","#"],"/":["..#","..#",".#.","#..","#.."],"\\":["#..","#..",".#.","..#","..#"],"-":["...","...","###","...","..."],_:["...","...","...","...","###"],"+":["...",".#.","###",".#.","..."],"=":["...","###","...","###","..."],"#":[".#.#.","#####",".#.#.","#####",".#.#."],"@":[".###.","#.#.#","#.###","#....",".###."],"·":[".",".","#",".","."],"…":[".....",".....",".....",".....","#.#.#"],"×":["...","#.#",".#.","#.#","..."],"%":["#.#","..#",".#.","#..","#.#"],"?":["##.","..#",".#.","...",".#."],"!":["#","#","#",".","#"],">":["#..",".#.","..#",".#.","#.."],"<":["..#",".#.","#..",".#.","..#"],"[":["##","#.","#.","#.","##"],"]":["##",".#",".#",".#","##"],"(":[".#","#.","#.","#.",".#"],")":["#.",".#",".#",".#","#."],"{":[".##",".#.","#..",".#.",".##"],"}":["##.",".#.","..#",".#.","##."],"'":["#","#",".",".","."],'"':["#.#","#.#","...","...","..."],"*":["...","#.#",".#.","#.#","..."],"&":[".#.","#.#",".#.","#.#",".##"],"~":["....",".#.#","#.#.","....","...."],$:[".##","##.",".#.",".##","##."],"^":[".#.","#.#","...","...","..."],"|":["#","#","#","#","#"],"`":["#.",".#","..","..",".."]},gh=6,oc=1,l_="?";function vp(n){return cl[n]??cl[n.normalize("NFD").replace(/\p{M}/gu,"")]??cl[l_]}const hs=n=>Math.max(0,[...n].reduce((e,t)=>e+vp(t)[0].length+oc,-oc));function c_(n){const e=[...n].map(vp),t=hs(n),i=gh,s=new Uint8Array(t*i);let r=0;for(const o of e)o.forEach((a,c)=>{for(let l=0;l<a.length;l++)a[l]==="#"&&(s[c*t+r+l]=1)}),r+=o[0].length+oc;return{w:t,h:i,bits:s}}const h_=n=>Math.max(1,Math.floor(n/2)),ac=n=>(gh+2)*n;function xo(n,e){const t=hs(n.text)*e;return{x:(n.align==="centre"?n.x-t/2:n.x)-e,y:n.y-e,w:t+2*e,h:ac(e)}}function u_(n,e){const t=n.getBoundingClientRect();if(t.width===0||t.height===0)return[];const i=n.width/t.width,s=n.height/t.height;return e.flatMap(r=>{const o=r.hidden?null:r.getBoundingClientRect();return o&&o.width>0&&o.height>0?[{x:(o.left-t.left)*i,y:(o.top-t.top)*s,w:o.width*i,h:o.height*s}]:[]})}function f_(n,e,t){const i=c_(e.text);if(i.w===0)return;const s=i.w*t,r=Math.round(e.x),o=Math.round(e.y);n.fillStyle=ht.space,n.fillRect(r-t,o-t,s+2*t,(i.h+1)*t),n.fillStyle=e.colour;for(let a=0;a<i.h;a++){let c=-1;for(let l=0;l<=i.w;l++){const h=l<i.w&&i.bits[a*i.w+l]===1;h&&c<0&&(c=l),!h&&c>=0&&(n.fillRect(r+c*t,o+a*t,(l-c)*t,t),c=-1)}}}const d_=256;class p_{constructor(e){this.canvas=e;const t=e.getContext("2d",{alpha:!0});if(!t)throw new Error("2D canvas unavailable");this.ctx=t}canvas;ctx;cache=new Map;shown="";px=1;resize(e,t,i,s,r){this.canvas.width!==e&&(this.canvas.width=e),this.canvas.height!==t&&(this.canvas.height=t),this.canvas.style.width=i,this.canvas.style.height=s,this.px=h_(r),this.ctx.imageSmoothingEnabled=!1,this.shown=""}draw(e){const t=this.px,i=e.map(r=>{const o=hs(r.text)*t;return{l:r,x:Math.round(r.align==="centre"?r.x-o/2:r.x)-t,y:Math.round(r.y)-t}}),s=`${t}
${i.map(({l:r,x:o,y:a})=>`${o},${a},${r.colour},${r.text}`).join(`
`)}`;if(s!==this.shown){this.shown=s,this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);for(const{l:r,x:o,y:a}of i){const c=`${t}|${r.colour}|${r.text}`;let l=this.cache.get(c);l||(this.cache.size>=d_&&this.cache.clear(),this.cache.set(c,l=_p(r.text,t,r.colour))),this.ctx.drawImage(l,o,a)}}}}function _p(n,e,t){const i=document.createElement("canvas");i.width=Math.max(1,(hs(n)+2)*e),i.height=(gh+2)*e;const s=i.getContext("2d");return s&&f_(s,{text:n,x:e,y:e,colour:t},e),i}function eo(n,e,t,i){const s=_p(n,e,i);return s.style.width=`${s.width/t}px`,s.style.height=`${s.height/t}px`,s.setAttribute("aria-hidden","true"),s}const m_=100;function g_(n,e,t){let i=0,s=null,r=0,o=!1;const a=l=>{if(i=0,o)return;const h=s===null?0:Math.min(m_,Math.max(0,l-s));s=l,t()&&(r+=h),n({frame:Math.floor(r*zt/1e3),dtMs:h}),e()?i=requestAnimationFrame(a):s=null},c=()=>{!i&&!o&&(i=requestAnimationFrame(a))};return c(),{wake:c,stop:()=>{o=!0,i&&cancelAnimationFrame(i)}}}const vh=(n,e)=>e<=0?0:Math.floor(n*100/e),Xn=(n,e,t=`${e}s`)=>`${n} ${n===1?e:t}`,xp=n=>n>0?` (+${n} not drawn)`:"";function v_(n){const t=n.counts.markersPerKlocMilli/1e3;return`${n.band}: ${Number.isInteger(t)?t:t.toFixed(1)} debt markers per 1k lines`}const _h=n=>n?`uncharted: ${n.fogged} of ${Xn(n.total,"file")}; ${n.haze} misted (read), ${n.clear} clear (understood)`:"uncharted: unknown, so every file is drawn uncharted",__=n=>n?`mastery: ${vh(n.clear,n.total)}% (${n.clear} of ${Xn(n.total,"file")} understood)`:"mastery: unknown, so every file is drawn uncharted";function Mp(n,e=null){const t=n.counts,i=[n.path,`${Xn(t.loc,"line")}`,v_(n)];t.debtUnknownFiles>0&&i.push(`debt unknown in ${Xn(t.debtUnknownFiles,"file")}`),i.push(t.qodoUnknown||t.qodoOpen===null?"qodo findings unknown":Xn(t.qodoOpen,"open qodo finding")),i.push(`${Xn(t.moons,"test moon")}${xp(t.moonOverflow)}`),i.push(`${Xn(t.settlements,"file")} on the surface${t.surfaceOverflow>0?` (+${t.surfaceOverflow} unplaced)`:""}`);const s=e?ph(e,n.dirId):null;return i.push(__(s),_h(s)),i}function x_(n,e=null){const t=[n.planets.length===0?"no planets yet: just the star":Xn(n.planets.length,"planet")],i=n.star.moonlets.length;return(i>0||n.star.moonletOverflow>0)&&t.push(`${Xn(i,"moonlet")} (root files, unmatched tests)${xp(n.star.moonletOverflow)}`),n.star.testData>0&&t.push(`${Xn(n.star.testData,"test data file")} (ride with the tests, not drawn)`),t.push(_h(dv(e))),t}const yp=(n,e)=>n?.spots.find(t=>t.planet===(e??-1)),Sp=(n,e)=>yp(n,e)?.notes??[];function M_(n,e){return!e||e.spots.length===0?null:`beacons on ${e.spots.map(t=>`${t.planet<0?"the star":n.planets[t.planet]?.path??"a planet"} (${t.notes.length})`).join(", ")}`}function y_(n,e,t=null,i=null){const s=n.planets.map(a=>a.path),r=M_(n,i),o=Sp(i,e);return[...lc(n,e,t,i),...r?[r]:[],...o.length?[`beacon notes, newest first: ${o.join("; ")}`]:[],...s.length?[`planets: ${s.join(", ")}`]:[]].join(". ")}const lc=(n,e,t=null,i=null)=>{const s=e===null?void 0:n.planets[e],r=s?Mp(s,t):x_(n,t),o=i&&(s?pu(yp(i,e)?.notes.length??0,0):pu(i.spots.reduce((a,c)=>a+c.notes.length,0),i.unplaced));return o&&r.push(o),r},S_="drag: look · wasd: fly · r f: up down · [ ]: planets · esc: free flight",b_=(n,e)=>n<e?-1:n>e?1:0,$s=n=>{const e=n.lastIndexOf("/");return e<0?"":n.slice(0,e)};function w_(n,e){const t=new Map,i=new Map,s=new Set(e.star.moonlets.map(h=>h.fileId)),r=new Map,o=new Map,a=new Map;for(const h of e.planets){r.set(h.path,h.dirId),a.set(h.dirId,h.surface.settlements.length+h.surface.overflow+h.moons.length+h.moonOverflow);for(const u of h.surface.settlements)t.set(u.fileId,{planet:h.dirId,cell:u.cell});for(const u of h.moons)i.set(u.fileId,h.dirId);for(const u of h.surface.continents)u.dirId!==h.dirId&&o.set(u.dirId,{planet:h.dirId,cell:u.seedCell})}const c=new Map(n.dirs.map(h=>[h.path,h.id])),l=h=>{for(let u=h;u!=="";u=$s(u)){const f=r.get(u);if(f)return f}return null};return{file(h,u){const f=t.get(h);if(f)return{kind:"settlement",planet:f.planet,cell:f.cell};const d=i.get(h);if(d)return{kind:"moon",planet:d};if(s.has(h))return{kind:"moonlet"};const p=l($s(u));return p?{kind:"unplaced",planet:p}:{kind:"star"}},dir(h){const u=l(h);if(!u)return{kind:"star"};for(let f=h;r.get(f)!==u;f=$s(f)){const d=o.get(c.get(f)??"");if(d?.planet===u)return{kind:"continent",planet:u,cell:d.cell}}return{kind:"planet",planet:u}},planet:h=>{const u=r.get(h);return u?{id:u,files:a.get(u)}:null}}}function bp(n){n.children.sort((e,t)=>e.kind===t.kind?b_(e.name,t.name):e.kind==="dir"?-1:1);for(const e of n.children)e.kind==="dir"&&bp(e)}function Gu(n,e){const t=w_(n,e),i={kind:"dir",path:"",name:"",place:{kind:"star"},planet:null,children:[]},s=new Map([["",i]]),r=o=>{let a=s.get(o);if(a)return a;const c=r($s(o));return a={kind:"dir",path:o,name:o.slice(o.lastIndexOf("/")+1),place:t.dir(o),planet:t.planet(o),children:[]},c.children.push(a),s.set(o,a),a};for(const o of n.files)r($s(o.path)).children.push({kind:"file",id:o.id,path:o.path,name:o.path.slice(o.path.lastIndexOf("/")+1),place:t.file(o.id,o.path)});return bp(i),i}const E_=["clear","haze","fogged"],Hu=n=>E_[n];function A_(n,e){const t=ma(e),i=new Map,s=a=>{const c={fogged:0,haze:0,clear:0,total:0};for(const l of a.children){if(l.kind==="file"){c[Hu(t(l.id))]++,c.total++;continue}const h=s(l);c.fogged+=h.fogged,c.haze+=h.haze,c.clear+=h.clear,c.total+=h.total}return i.set(a,c),c},r=s(n);return{level:a=>Hu(t(a.id)),dir:a=>a.planet===null?i.get(a)??{fogged:0,haze:0,clear:0,total:0}:ph(e,a.planet.id)??{fogged:a.planet.files,haze:0,clear:0,total:a.planet.files},all:r}}const Vu=200;function T_(n,e,t=new Map){const i=[],s=(r,o,a)=>{const c=r.children.length,l=Math.min(c,t.get(r.path)??Vu);for(let u=0;u<l;u++){const f=r.children[u];i.push({node:f,level:o,setsize:c,posinset:u+1,parent:a}),f.kind==="dir"&&e.has(f.path)&&s(f,o+1,i.length-1)}const h=c-l;h>0&&i.push({node:{kind:"more",path:`${r.path}/`,name:`${h} more`,dir:r,hidden:h,next:Math.min(h,Vu)},level:o,setsize:c,posinset:l+1,parent:a})};return s(n,1,-1),i}const R_=(n,e)=>`${n} ${e}${n===1?"":"s"}`,C_={fogged:"fogged",haze:"misted",clear:"clear"},P_={fogged:"fogged",haze:"misted (read)",clear:"clear (understood)"};function L_(n){const e=[n.haze>0?`${n.haze} misted`:"",n.fogged>0?`${n.fogged} fogged`:""].filter(Boolean);return[`${vh(n.clear,n.total)}%`,...e].join(" · ")}function I_(n,e){return n.kind==="more"?`show ${n.next}`:n.kind==="file"?C_[e.level(n)]:L_(e.dir(n))}function wp(n,e){if(n.kind==="file")return P_[e.level(n)];const t=e.dir(n);return`mastery ${vh(t.clear,t.total)}%, ${t.clear} of ${R_(t.total,"file")} clear (understood), ${t.haze} misted (read), ${t.fogged} fogged${n.planet===null?"":", counted as its planet"}`}function D_(n,e){return n.kind==="more"?`${n.hidden} more not shown, open to show ${n.next}`:`${n.name}, ${n.kind==="dir"?"folder":"file"}, ${wp(n,e)}`}function N_(n,e){const t=i=>e.planets.find(s=>s.dirId===i)?.path??"a planet";switch(n.kind){case"settlement":return`a settlement on the planet ${t(n.planet)}`;case"moon":return`a test moon of the planet ${t(n.planet)}`;case"unplaced":return`not drawn on the map, so showing its folder's planet, ${t(n.planet)}`;case"planet":return`the planet ${t(n.planet)}`;case"continent":return`a continent of the planet ${t(n.planet)}`;case"moonlet":return"a moonlet of the star";case"star":return"no planet of its own, so showing the star"}}const F_=(n,e,t)=>`focused ${n.path}${n.kind==="dir"?"/":""}: ${N_(n.place,t)}; ${wp(n,e)}`,U_=n=>n instanceof At?n.title:"something went wrong",Wu=n=>n.slice(0,7),Rn=(n,e,t)=>{const i=document.createElement(n);return e!==void 0&&(i.textContent=e),t!==void 0&&(i.className=t),i};class O_{constructor(e){this.host=e,this.toggle.type="button",this.toggle.setAttribute("aria-controls","tree"),this.toggle.setAttribute("aria-expanded","false"),this.toggle.replaceChildren(this.toggleName),this.toggle.addEventListener("click",()=>this.isOpen?this.close(!1):this.open()),this.closeButton.type="button",this.closeButton.addEventListener("click",()=>this.close(!0));const t=Rn("div",void 0,"top");t.append(Rn("h2","files"),this.closeButton),this.list.setAttribute("role","tree"),this.list.setAttribute("aria-label","folders and files, with their fog"),this.list.addEventListener("keydown",i=>this.key(i)),this.root.addEventListener("keydown",i=>{i.key==="Escape"&&(i.preventDefault(),this.close(!0))}),this.root.replaceChildren(t,this.note,this.list)}host;root=We("tree");toggle=We("tree-toggle");toggleName=Rn("span","directory view","sr");closeButton=Rn("button","close");note=Rn("p","","note");list=Rn("div",void 0,"rows");layout=null;fog=null;source=null;tree=null;rows=[];rowEls=[];expanded=new Set;shown=new Map;activePath=null;loadNote="";gen=0;enterRows=!1;get isOpen(){return!this.root.hidden}scale(e,t){const i=eo("files",e,t,ht.ink);i.className="bitmap",this.toggle.replaceChildren(i,this.toggleName)}setLayout(e){this.layout=e,this.source&&this.source.head!==e.source.head&&(this.source=null),this.tree=this.source?Gu(this.source,e):null,this.isOpen&&(this.render(),this.load())}setFog(e){this.fog=e,this.render()}open(){this.root.hidden=!1,this.toggle.setAttribute("aria-expanded","true"),this.render(),this.load();const e=this.rowEls[this.activeIndex()];this.enterRows=!e,(e??this.closeButton).focus({preventScroll:!0})}close(e){this.root.hidden=!0,this.toggle.setAttribute("aria-expanded","false"),e&&this.host.release()}async load(){const e=this.layout;if(!e||!this.isOpen||this.source?.head===e.source.head)return;const t=++this.gen,i=()=>t!==this.gen||this.layout!==e;this.loadNote="loading the file list…",this.render();let s;try{s=await this.host.client.files()}catch(r){if(i())return;this.loadNote=`file list unavailable: ${U_(r)}`,this.host.announce(this.loadNote),this.render();return}if(!i()){if(s.head!==e.source.head){this.loadNote=`file list not shown: it is of ${Wu(s.head)} but the map of ${Wu(e.source.head)} (different scans); waiting for the next update`,this.host.announce(this.loadNote),this.render();return}this.loadNote="",this.source=s,this.tree=Gu(s,e),this.render()}}rowFog(e){return A_(e,this.fog&&this.fog.head===this.source?.head?this.fog:null)}activeIndex(){for(let e=this.activePath;e!==null&&e!=="";e=$s(e)){const t=this.rows.findIndex(i=>i.node.path===e);if(t>=0)return t}return 0}noteText(e){if(this.loadNote)return this.loadNote;if(!this.layout)return"waiting for the map…";if(!e)return"";const t=this.fog!==null&&this.fog.head===this.source?.head;return _h(t?e.all:null)}render(){if(!this.isOpen)return;const e=this.tree,t=e?this.rowFog(e):null;this.note.textContent=this.noteText(t);const i=this.rowEls.some(o=>o===document.activeElement)||this.enterRows&&document.activeElement===this.closeButton;this.rows=e?T_(e,this.expanded,this.shown):[];const s=this.activeIndex();if(this.activePath=this.rows[s]?.node.path??this.activePath,this.rowEls=t?this.rows.map((o,a)=>this.rowEl(o,a,a===s,t)):[],this.list.replaceChildren(...this.rowEls),this.rows.length===0&&e&&this.list.append(Rn("p","no files","note")),this.rowEls.length>0&&(this.enterRows=!1),!i)return;const r=this.rowEls[s];r||(this.enterRows=!0),(r??this.closeButton).focus({preventScroll:!0})}rowEl(e,t,i,s){const r=e.node,o=r.kind==="dir"&&this.expanded.has(r.path),a=Rn("div",void 0,r.kind==="file"?`row file ${s.level(r)}`:`row ${r.kind}`);a.setAttribute("role","treeitem"),a.setAttribute("aria-level",String(e.level)),a.setAttribute("aria-setsize",String(e.setsize)),a.setAttribute("aria-posinset",String(e.posinset)),a.setAttribute("aria-label",D_(r,s)),r.kind==="dir"&&a.setAttribute("aria-expanded",String(o)),i&&a.setAttribute("aria-selected","true"),a.tabIndex=i?0:-1,a.style.paddingLeft=`${(e.level-1)*2}ch`;const c=Rn("span",r.kind==="dir"?o?"▾":"▸":" ","twisty");c.setAttribute("aria-hidden","true");const l=Rn("span",r.kind==="dir"?`${r.name}/`:r.name,"name"),h=Rn("span",I_(r,s),"tag");for(const u of[l,h])u.setAttribute("aria-hidden","true");return a.append(c,l,h),r.kind==="dir"&&c.addEventListener("click",u=>{u.stopPropagation(),this.moveTo(t,!1),this.setExpanded(r.path,!o)}),a.addEventListener("click",()=>this.openRow(t)),a.addEventListener("focus",()=>this.moveTo(t,!1)),a}moveTo(e,t){const i=this.rowEls[e],s=this.rows[e];if(!i||!s)return;const r=this.rowEls[this.activeIndex()];r&&r!==i&&(r.tabIndex=-1,r.removeAttribute("aria-selected")),this.activePath=s.node.path,i.tabIndex=0,i.setAttribute("aria-selected","true"),t&&i.focus()}setExpanded(e,t){t?this.expanded.add(e):this.expanded.delete(e),this.render()}openRow(e){const t=this.rows[e],i=this.tree,s=this.layout;if(!t||!i||!s)return;this.moveTo(e,!1);const r=t.node;if(r.kind==="more"){this.showMore(r);return}const o=F_(r,this.rowFog(i),s);r.kind==="dir"&&!this.expanded.has(r.path)&&this.setExpanded(r.path,!0),this.host.open(r.place,o)}showMore(e){const t=e.dir.children.length-e.hidden;this.shown.set(e.dir.path,t+e.next),this.activePath=e.dir.children[t].path,this.render()}key(e){if(e.altKey||e.ctrlKey||e.metaKey)return;const t=this.activeIndex(),i=this.rows[t];if(!i)return;const s=i.node;switch(e.key){case"ArrowDown":this.moveTo(Math.min(t+1,this.rows.length-1),!0);break;case"ArrowUp":this.moveTo(Math.max(t-1,0),!0);break;case"Home":this.moveTo(0,!0);break;case"End":this.moveTo(this.rows.length-1,!0);break;case"ArrowRight":s.kind==="dir"&&!this.expanded.has(s.path)?this.setExpanded(s.path,!0):this.rows[t+1]?.parent===t&&this.moveTo(t+1,!0);break;case"ArrowLeft":s.kind==="dir"&&this.expanded.has(s.path)?this.setExpanded(s.path,!1):i.parent>=0&&this.moveTo(i.parent,!0);break;case"Enter":this.openRow(t);break;default:return}e.preventDefault()}}const $u={KeyW:"forward",ArrowUp:"forward",KeyS:"back",ArrowDown:"back",KeyA:"left",ArrowLeft:"left",KeyD:"right",ArrowRight:"right",KeyR:"up",KeyF:"down"},k_=4;class B_{constructor(e,t){this.el=e,this.h=t,e.addEventListener("pointerdown",s=>{s.button===0&&(e.focus({preventScroll:!0}),e.setPointerCapture(s.pointerId),this.press={id:s.pointerId,x:s.clientX,y:s.clientY,moved:0})}),e.addEventListener("pointermove",s=>{!this.press||s.pointerId!==this.press.id||(this.drag[0]+=s.movementX,this.drag[1]+=s.movementY,this.press.moved+=Math.abs(s.movementX)+Math.abs(s.movementY),t.wake())});const i=(s,r)=>{if(!this.press||s.pointerId!==this.press.id)return;const o=r&&this.press.moved<k_;if(this.press=null,r||(this.drag=[0,0]),o){const a=e.getBoundingClientRect();t.click(s.clientX-a.left,s.clientY-a.top)}t.wake()};e.addEventListener("pointerup",s=>i(s,!0)),e.addEventListener("pointercancel",s=>i(s,!1)),e.addEventListener("wheel",s=>{s.preventDefault(),this.wheel+=s.deltaMode===1?s.deltaY*16:s.deltaY,t.wake()},{passive:!1}),e.addEventListener("keydown",s=>{if(s.altKey||s.ctrlKey||s.metaKey)return;const r=$u[s.code];if(r){this.keys.add(r),s.preventDefault(),t.wake();return}if(s.key==="]"||s.key==="n")t.cycle(1),s.preventDefault();else if(s.key==="["||s.key==="p")t.cycle(-1),s.preventDefault();else if(s.key==="Escape")t.release(),s.preventDefault();else if(s.key==="Home"||s.key==="h")t.home(),s.preventDefault();else return;t.wake()}),e.addEventListener("keyup",s=>{const r=$u[s.code];r&&this.keys.delete(r)}),e.addEventListener("blur",()=>this.keys.clear())}el;h;drag=[0,0];wheel=0;keys=new Set;press=null;busy(){return this.keys.size>0||this.press!==null}take(){const e={drag:this.drag,wheel:this.wheel,keys:new Set(this.keys)};return this.drag=[0,0],this.wheel=0,e}}const Yi=n=>n.slice(0,7);function z_(n,e){return n.baseline!==null?"set":e?null:!n.charted&&n.files.some(t=>t.state==="fogged")?"offer":null}function hl(n,e,t=!1){const i=e.files.find(r=>r.fileId===n.fileId);return!i||(i.state==="fogged"?i.since:null)!==n.since&&!(t&&i.state!=="fogged")?"stale":e.head===n.at?"current":"newer"}const G_=n=>n.since!==null&&!n.truncated&&n.sections.length>0&&n.sections.every(e=>!e.binary&&e.hunks.length>0),H_=n=>`'${n.replace(/'/g,"'\\''")}'`;function V_(n){if(n.base===null)return null;const e=[...new Set(n.sections.flatMap(t=>t.oldPath?[t.path,t.oldPath]:[t.path]))];return`git --literal-pathspecs diff -M ${n.base} ${n.at} -- ${e.map(H_).join(" ")}`}function W_(n){const e=[];n.since!==null&&n.sections.length===0&&e.push("git shows no text change for this file in the range. It's fogged because its history couldn't be followed for certain.");for(const t of n.sections)t.binary?e.push(`${t.path} is binary: Commet can't show its change. Check it elsewhere before you chart it.`):t.status==="mode"&&e.push(`${t.path}: only its mode changed.`);return n.truncated&&e.push(`This diff is too long to show in full: the first ${n.shownLines} lines are here. Chart covers the whole change, not only what's shown.`),e}const $_=n=>n.startsWith("+")?"add":n.startsWith("-")?"del":n.startsWith(" ")?"ctx":"meta";function X_(n){return n.status==="renamed"?`renamed ${n.oldPath??"?"} → ${n.path}`:`${n.status} ${n.path}`}const q_=n=>[n.head,n.baseline??"",String(n.charted),n.files.map(e=>`${e.fileId}:${e.state}:${e.since??""}:${e.reasons.join("+")}`).join(","),n.planets.map(e=>`${e.dirId}:${e.fogged}/${e.haze}/${e.clear}/${e.total}`).join(","),`${n.star.fogged}/${n.star.haze}/${n.star.clear}/${n.star.total}`].join("|"),Xu="the star: root files and unmatched tests",Mo=200,bs=n=>n instanceof At?n.title:"something went wrong";class Y_{constructor(e){this.host=e,this.root.addEventListener("keydown",t=>{t.key==="Escape"&&(t.preventDefault(),this.open?this.back():this.close())})}host;root=We("panel");px=2;dpr=1;fog=null;fogSeen="";home={id:null,name:Xu};files=[];shown=Mo;listStale=!1;open=null;note="";busy=!1;dismissed=!1;closed=!1;unavailable=!1;listGen=0;diffGen=0;told=null;seenWrite=null;scale(e,t){e===this.px&&t===this.dpr||(this.px=e,this.dpr=t,this.render())}setFog(e){const t=e===null?"":q_(e);e!==null&&this.fog!==null&&t===this.fogSeen||(this.fog=e,this.fogSeen=t,this.unavailable=e===null,e===null&&(this.open=null,this.diffGen++),this.open&&e&&hl(this.open.view,e,this.open.seen)==="stale"&&(this.note="This file's unseen range changed, so this diff is out of date. Reload it to chart."),this.open?this.listStale=!0:this.loadList(),this.render())}select(e,t){const i=e===null?Xu:t??e;if(e===this.home.id&&!this.closed){i!==this.home.name&&(this.home={id:e,name:i},this.render());return}this.home={id:e,name:i},this.open=null,this.diffGen++,this.closed=!1,this.note="",this.files=[],this.shown=Mo,this.loadList(),this.render()}close(){this.closed=!0,this.render(),this.host.release()}back(){this.open=null,this.note="",this.diffGen++,this.listStale&&this.loadList(),this.render()}async refetchFog(){try{const e=this.host.fogTicket(),t=await this.host.client.fog();return this.host.applyFog(t,e),t}catch(e){return this.note=bs(e),this.render(),null}}async loadList(e=!0){const t=this.fog;if(!t||this.closed)return;this.listStale=!1;const i=++this.listGen;try{const s=await this.host.client.unseen(this.home.id,t.head);if(i!==this.listGen)return;if(s.ok)this.files=s.files;else if(s.head!==void 0){e&&await this.refetchFog();return}else this.files=[],this.note="This planet is no longer in the layout."}catch(s){i===this.listGen&&(this.note=bs(s))}this.open||this.render()}async openDiff(e,t=!0){const i=this.fog;if(!i)return;const s=++this.diffGen;this.note=`loading the diff of ${e.path}…`,this.render();try{const r=await this.host.client.diff(e.fileId,i.head);if(s!==this.diffGen)return;if(r.ok){const o={file:e,view:r,pre:this.lines(r,e.path),log:this.logField(),seen:!1};this.open=o,this.note="",this.render("chart"),this.host.announce(`showing the unseen diff of ${e.path}`),G_(r)&&this.markSeen(o);return}if(r.head!==void 0)return this.note="The repository moved on; reloading.",await this.refetchFog()&&t&&s===this.diffGen?this.openDiff(e,!1):void 0;this.note=`${e.path} is no longer in the repository at this head.`}catch(r){s===this.diffGen&&(this.note=bs(r))}this.render()}async write(e,t,i=()=>{}){if(this.busy)return"failed";this.busy=!0,this.root.setAttribute("aria-busy","true");try{const s=this.host.fogTicket(),r=await this.host.client.chart(e);if(r.ok)return this.note="",i(),this.host.applyFog(r.fog,s)||await this.refetchFog(),this.host.announce(t),"ok";if(r.head!==void 0)return this.note="Nothing was charted: the repository moved past the head you were looking at. The view reloaded; look again.",await this.refetchFog(),"unknown-head";this.note=`Nothing was charted: ${r.error}.`}catch(s){this.note=`Nothing was charted: ${bs(s)}`}finally{this.busy=!1,this.root.setAttribute("aria-busy","false")}return"failed"}markSeen(e){e.seen=!0;const t=s=>{e.seen=!1,this.open===e&&(this.note=`Opening it didn't mark ${e.file.path} seen: ${s}. Chart still can.`,this.render())},i=(async()=>{try{const s=this.host.fogTicket(),r=await this.host.client.chart({kind:"chart",fileId:e.view.fileId,at:e.view.at});if(r.ok){this.host.applyFog(r.fog,s)||await this.refetchFog();return}r.head!==void 0?(e.seen=!1,await this.refetchFog()):t(r.error)}catch(s){t(bs(s))}})();this.seenWrite=i,i.finally(()=>{this.seenWrite===i&&(this.seenWrite=null)})}async chart(){const e=this.open;if(!e||!this.fog||(this.seenWrite&&await this.seenWrite,!this.fog||hl(e.view,this.fog,e.seen)==="stale"))return;const t=w0(e.log.value),i=t===""?null:ah(t);if(i){this.note=`Nothing was charted: ${i}.`,this.render("note");return}let s=!1;const r=()=>{this.open===e&&(this.open=null,s=!0)},o=await this.write({kind:"chart",fileId:e.view.fileId,at:e.view.at},`charted ${e.file.path}`,()=>{r(),this.files=this.files.filter(a=>a.fileId!==e.view.fileId)});o==="unknown-head"&&r(),o==="ok"&&this.loadList(),this.render(s?"list":void 0),o==="ok"&&t!==""&&await this.leaveBeacon(e,t)}async leaveBeacon(e,t){const i=this.diffGen,s=this.host.beaconTicket();let r;try{const o=await this.host.client.beacon({fileId:e.view.fileId,at:e.view.at,text:t});if(o.ok){this.host.applyBeacons(o.beacons,s),this.host.announce(`charted ${e.file.path} and left a beacon: ${t}`);return}r=`Charted, but the beacon was not left: ${o.head!==void 0?"the repository moved on":o.error}.`}catch(o){r=`Charted, but the beacon was not left: ${bs(o)}`}this.host.announce(r),i===this.diffGen&&(this.note=r,this.render())}logField(){const e=document.createElement("input");return e.type="text",e.dataset.key="note",e.autocomplete="off",e.placeholder="what did you learn? (optional)",e.setAttribute("aria-label",`Captain's log: an optional one-line note on what you learned, at most ${Ql} characters, shown as a beacon on the planet when you chart`),e.addEventListener("keydown",t=>{t.key!=="Enter"||t.isComposing||t.keyCode===229||(t.preventDefault(),this.chart())}),e}bitmap(e,t=ht.ink){return eo(e,this.px,this.dpr,t)}labelled(e,t,i,s=ht.ink){const r=document.createElement("span");return r.className="sr",r.textContent=i,e.append(this.bitmap(t,s),r),e}button(e,t,i,s,r=!1){const o=this.labelled(document.createElement("button"),t,i,r?ht.dim:ht.ink);return o.type="button",o.dataset.key=e,o.disabled=r,o.addEventListener("click",s),o}heading(e,t){return this.labelled(document.createElement(t),e,e)}text(e,t="note"){const i=document.createElement("p");return i.className=t,i.textContent=e,i}baselineBox(e){const t=z_(e,this.dismissed);if(t===null)return null;const i=document.createElement("div");i.className="baseline";const s=Yi(e.head);if(t==="offer")i.append(this.text(`Nothing is charted yet, so everything agents, teammates or unknown authors changed is fogged. You can chart everything up to ${s} as your baseline, and undo it later.`),this.button("baseline",`chart everything up to ${s} as my baseline`,`Chart everything up to ${s} as my baseline`,()=>{this.write({kind:"baseline",at:e.head},`baseline set at ${s}`).then(()=>this.render("undo"))}),this.button("dismiss","not now","Not now: keep everything fogged",()=>{this.dismissed=!0,this.render()}));else{const r=Yi(e.baseline);i.append(this.bitmap(`baseline at ${r}`,ht.dim),this.button("undo","undo baseline",`Undo the baseline at ${r}`,()=>{this.write({kind:"baseline-undo",at:e.head},"baseline undone").then(()=>this.render("baseline"))}))}return i}listBox(){const e=document.createElement("div"),t=this.files.length;e.append(this.bitmap(t===0?"nothing unseen here":`${t} unseen ${t===1?"file":"files"}`,ht.dim));const i=document.createElement("ul");for(const r of this.files.slice(0,this.shown)){const o=document.createElement("li");o.append(this.button(`file:${r.fileId}`,r.path,`${r.path}, unseen since ${Yi(r.since)}: ${r.reasons.join(", ")}. Show its diff.`,()=>{this.openDiff(r)}),this.text(r.reasons.join(" · "),"note dim")),i.append(o)}e.append(i);const s=t-this.shown;return s>0&&e.append(this.button("more",`show ${Math.min(s,Mo)} more (${s} not listed)`,`Show more unseen files: ${s} not listed yet`,()=>{this.shown+=Mo,this.render("more")})),e}lines(e,t){const i=document.createElement("pre");i.className="diff",i.tabIndex=0,i.setAttribute("aria-label",`unseen diff of ${t}`);const s=(r,o)=>{const a=document.createElement("span");a.className=o,a.textContent=`${r}
`,i.append(a)};for(const r of e.sections){s(X_(r),"sec");for(const o of r.hunks){s(o.header,"meta");for(const a of o.lines)s(a,$_(a))}}return i}diffBox(e,t){const i=e.view,s=document.createElement("div");s.className="review";const r=hl(i,t,e.seen);s.append(this.heading(e.file.path,"h3")),s.append(this.text(i.since===null?"Nothing here is unseen any more.":`Unseen since ${Yi(i.since)}, shown up to ${Yi(i.at)}.`,"note dim"));const o=t.files.find(h=>h.fileId===i.fileId)?.state;e.seen&&o==="haze"&&s.append(this.text("Read: opening this diff charted it, so it is misted now (read, not yet understood).","note dim"));for(const h of W_(i))s.append(this.text(h));const a=i.truncated?V_(i):null;if(a){const h=document.createElement("code");h.className="cmd",h.textContent=a,s.append(h,this.button("copy","copy command","Copy the git diff command",()=>{navigator.clipboard?.writeText(a).then(()=>this.host.announce("command copied"),()=>this.host.announce("copy failed: select the command instead"))}))}if(r==="newer"&&s.append(this.text(`Newer commits arrived. Chart covers what this diff shows, up to ${Yi(i.at)}; anything newer stays fogged.`)),i.since!==null){const h=document.createElement("div");h.className="log",h.append(this.bitmap("captain's log",ht.dim),e.log),s.append(h)}const c=document.createElement("div");c.className="actions";const l=r==="stale";return i.since!==null&&c.append(this.button("chart",l?"chart (reload first)":"chart",l?"Chart: reload the diff first":`Chart ${e.file.path}: mark this change reviewed, up to ${Yi(i.at)}`,()=>{this.chart()},l)),l&&c.append(this.button("reload","reload diff","Reload the diff",()=>{this.openDiff(e.file)})),c.append(this.button("back","back","Back to the list of unseen files",()=>this.back())),s.append(c,e.pre),s}render(e){const t=this.closed?null:this.open?.file.fileId??null;t!==this.told&&(this.told=t,this.host.focusFile?.(t));const i=this.fog;if(this.root.hidden=this.closed||i===null&&!this.unavailable,this.root.hidden)return;if(!i){this.root.replaceChildren(this.heading(this.home.name,"h2"),this.text("The fog view isn't available, so nothing can be reviewed or charted right now. Everything counts as fogged until it loads."));return}this.root.setAttribute("aria-busy",String(this.busy));const s=document.activeElement instanceof HTMLElement&&document.activeElement.closest("#panel")?document.activeElement:null,r=this.open?.pre,o=r?.isConnected?{pre:r,top:r.scrollTop,left:r.scrollLeft}:null,a=document.createElement("div");a.className="top",a.append(this.heading(this.home.name,"h2"),this.button("close","close","Close the review panel",()=>this.close()));const c=[a],l=this.baselineBox(i);l&&c.push(l),c.push(this.open?this.diffBox(this.open,i):this.listBox()),this.note&&c.push(this.text(this.note)),this.root.replaceChildren(...c),o&&(o.pre.scrollTop=o.top,o.pre.scrollLeft=o.left);const h=e??(s===null?void 0:s===this.open?.pre?"pre":s.dataset.key??"");if(h===void 0)return;const u=d=>this.root.querySelector(`[data-key="${CSS.escape(d)}"]:not(:disabled)`);(h==="pre"&&this.open?this.open.pre:(h?u(h):null)??this.root.querySelector("li button")??u("close"))?.focus({preventScroll:!0})}}const K_="(prefers-reduced-motion: reduce)",Z_=Math.round(Qd*zt/1e3),Ep=n=>n instanceof At?n:new At("The view hit an internal error.",[n instanceof Error?n.message:String(n)]),ul=n=>n.slice(0,7),qu=n=>`${n} ${n===1?"file":"files"}`;function Yu(n,e,t,i){if("fog"in e&&e.fog.head===n)return{fog:e.fog,notice:i?`fog view updated (${ul(n)})`:null,held:!1};const s="fog"in e?`fog not applied: the fog is of ${ul(e.fog.head)} but the layout of ${ul(n)} (different scans); waiting for the next update`:`fog view unavailable: ${Ep(e.error).message}`;return{fog:t?.head===n?t:null,notice:s,held:!0}}async function J_(n,e,t){const i=matchMedia(K_);let s=i.matches,r=!1,o=di.default,a=null,c=null,l=!0,h=-1,u=0,f=!1,d=!1,p=null,x=!1,m=null;const g=new Kg(mg);let M=null;const E=()=>{const $=n.homePose(_());$&&(M=$,g.reset($))},y=new Y_({client:t,fogTicket:()=>n.fogTicket(),applyFog:($,xe)=>n.applyFog($,xe),announce:$=>e.announce($),release:()=>n.pass.canvas.focus({preventScroll:!0}),beaconTicket:()=>B.ticket(),applyBeacons:($,xe)=>B.apply($,p,xe),focusFile:$=>{n.focusFile=$,n.focusSince=_(),R(),b()}}),T=new O_({client:t,open:($,xe)=>fe($,xe),announce:$=>e.announce($),release:()=>n.pass.canvas.focus({preventScroll:!0})}),b=()=>{l=!0,Me.wake()},v=()=>{const $=devicePixelRatio||1;n.resize(o,innerWidth,innerHeight,$),e.scale(n.labels.px,$),y.scale(n.labels.px,$),T.scale(n.labels.px,$),b()},_=()=>u,R=()=>{const $=n.model;$&&e.summary([y_($,a,n.fog,n.beacons),...n.coChangeLines(a)].join(". "))},C=()=>{const $=n.model,xe=a===null?null:$?.planets[a];e.announce(xe?`focused ${Mp(xe,n.fog).join(", ")}`:"free flight"),R()},L=($,xe=null)=>{a=$,n.focusSince=_(),c=$===null?null:n.model?.planets[$]?.dirId??null;const Le=$===null?void 0:n.model?.planets[$],Ae=Le&&xe!==null?D0(Le,xe,_()+(s?0:Z_)):void 0;g.focus($===null?null:n.focusTarget($,_()),s,Ae),y.select(c,$===null?null:n.model?.planets[$]?.path??null),C(),l=!0};let D="";n.onFog=$=>{y.setFog($),T.setFog($);const{cleared:xe,refogged:Le}=n.fogChange,Ae=n.fogNotice;xe||Le?e.announce(D=[xe?`charted ${qu(xe)}`:"",Le?`${qu(Le)} refogged`:""].filter(Boolean).join(", ")):Ae&&Ae!=="no fog view"&&e.announce(`${Ae}: every file is drawn uncharted until the next update`),R(),b()};const B=new Hg({view:n,client:t,announce:$=>e.announce($),changed:()=>{R(),b()}}),A=new Wg({view:n,client:t,announce:$=>e.announce($),changed:()=>{R(),b()}}),F=new a_({view:n,client:t,announce:$=>e.announce($),redraw:()=>b(),release:()=>n.pass.canvas.focus({preventScroll:!0}),others:()=>[We("panel"),We("tree")]}),O=new n_({view:n,client:t,announce:$=>e.announce($),redraw:()=>b(),release:()=>n.pass.canvas.focus({preventScroll:!0}),others:()=>[We("panel"),We("tree")],reframe:()=>{M!==null&&g.pose()===M&&!g.focused()&&!g.moving()&&(E(),b())}}),N=()=>{F.deselect(),O.deselect()},q=()=>t.fog().then($=>({fog:$}),$=>({error:$})),V=async()=>{try{const $=n.fogTicket(),xe=q(),Le=await t.layout(),Ae=Yu(Le.source.head,await xe,n.fog,x);D="",await n.load(Le,Ae.fog,{ticket:$}),p=Le.source.head,x=Ae.held,e.clearError();const ot=n.model;(!f||!d&&ot.planets.length>0)&&E(),d=ot.planets.length>0,f=!0;const ft=c===null?-1:ot.planets.findIndex(Tt=>Tt.dirId===c);if(ft>=0){a=ft,y.select(c,ot.planets[ft].path);const Tt=n.focusTarget(ft,_());Tt&&g.track(Tt)}else a!==null&&L(null);T.setLayout(Le),C(),D&&e.announce(D),Ae.notice&&e.announce(Ae.notice),m&&e.announce(m),F.refresh(p),O.refresh(p),B.refresh(p),A.refresh(p),b()}catch($){const xe=Ep($);e.error(xe.title,xe.detail)}},X=async()=>{if(p===null)return;const $=n.fogTicket(),xe=Yu(p,await q(),n.fog,x);xe.fog!==n.fog&&n.applyFog(xe.fog,$),x=xe.held,xe.notice&&e.announce(xe.notice)};let j=null,de=null;const Re=$=>(de!=="layout"&&(de=$),j||(j=(async()=>{for(;de!==null;){const xe=de;de=null,await(xe==="layout"?V():X())}j=null})(),j)),K=new B_(n.pass.canvas,{wake:()=>Me.wake(),click:($,xe)=>{if(!f)return;const Le=n.arrowAt($,xe);if(Le!==null){N(),L(Le<0?null:Le);return}if(F.pick($,xe,g.pose(),_())){O.deselect();return}if(O.pick($,xe,g.pose(),_())){F.deselect();return}const Ae=n.pickAt($,xe,g.pose(),_());Ae!==null&&(N(),L(Ae))},cycle:$=>{N();const xe=n.model?.planets.length??0;xe!==0&&L(a===null?$>0?0:xe-1:(a+$+xe)%xe)},release:()=>{N(),L(null)},home:()=>{N(),n.model&&(E(),L(null))}}),fe=($,xe)=>{const Le=n.model;if(!(!f||!Le)){if(N(),$.kind==="star"||$.kind==="moonlet")E(),L(null);else{const Ae=Le.planets.findIndex(ot=>ot.dirId===$.planet);if(Ae<0){e.announce("not focused: its planet isn't on the map drawn now; waiting for the next update");return}L(Ae,$.kind==="settlement"||$.kind==="continent"?$.cell:null)}e.announce(xe),b()}},Me=g_(({frame:$,dtMs:xe})=>{if(u=$,!f)return;const Le=_();let Ae=g.step(K.take(),xe);if(a!==null&&!g.focused()&&(a=c=null,y.select(null,null),C()),a!==null){const ot=n.focusTarget(a,Le);ot&&(Ae=g.track(ot)||Ae)}!Ae&&!l&&Le===h||(F.dock(Le,g.pose(),a),O.dock(Le,g.pose(),a),n.draw(Le,g.pose(),a),h=Le,l=!1)},()=>!s||K.busy()||g.moving()||l,()=>!s),Ce=$=>{s=$,n.reducedMotion=$,$&&g.settle(),e.setReducedMotion($),b()};e.onPixelHeight=$=>{o=$,v()},e.onReducedMotion=$=>{r=!0,Ce($)},e.setReducedMotion(s),n.reducedMotion=s,i.addEventListener("change",()=>{r||Ce(i.matches)}),addEventListener("resize",v);const me=[We("panel"),We("drone-panel"),We("crew-panel"),We("tree")];n.covered=()=>u_(n.labels.canvas,me);const Ne=new ResizeObserver(b);for(const $ of me)Ne.observe($);v(),await Re("layout");let ut=!1;t.follow($=>{$.type==="rescan"?(m=$.ok?null:`automatic rescan failed (exit ${$.exitCode}): showing the last scan; the terminal running \`commet open\` says why`,e.announce(m??"automatic rescan works again")):$.type==="layout"||$.type==="fog"?(Re($.type),$.type==="fog"&&A.refresh(p)):$.type==="snapshot"&&$.head===p?(F.refresh(p),O.refresh(p),B.refresh(p),A.refresh(p)):$.type==="beacons"&&B.refresh(p)},$=>{if($==="live"){m=null,Re("layout"),ut&&e.announce("live updates resumed"),ut=!1;return}ut=!0,e.announce($)}),n.pass.canvas.focus({preventScroll:!0})}function Ku(n,e,t,i){n.querySelector("canvas.bitmap")?.remove();const s=eo(e,t,i,ht.ink);s.classList.add("bitmap"),n.prepend(s)}class Q_{hud=We("hud");pixel=We("pixel");motion=We("motion");pixelLabel=We("pixel-control");motionLabel=We("motion-control");status=We("status");summaryBox=We("summary");errorBox=We("error");px=2;dpr=1;onPixelHeight=()=>{};onReducedMotion=()=>{};constructor(){this.pixel.min=String(di.min),this.pixel.max=String(di.max),this.pixel.value=String(di.default),this.pixel.addEventListener("input",()=>{this.onPixelHeight(Number(this.pixel.value)),this.paint()}),this.motion.addEventListener("change",()=>this.onReducedMotion(this.motion.checked))}show(){this.hud.hidden=!1}setReducedMotion(e){this.motion.checked=e}scale(e,t){this.px=e,this.dpr=t,this.paint()}paint(){Ku(this.pixelLabel,`pixels ${this.pixel.value}`,this.px,this.dpr),Ku(this.motionLabel,"reduce motion",this.px,this.dpr)}summary(e){this.summaryBox.textContent=e}announce(e){this.status.textContent=e}error(e,t){const i=this.errorBox;i.replaceChildren();const s=document.createElement("p");s.className="sr",s.textContent=[e,...t].join(" "),i.append(s),[e,...t].forEach((r,o)=>{const a=eo(r,this.px,this.dpr,o===0?ht.ink:ht.dim);a.classList.add("line"),i.append(a)}),i.hidden=!1}clearError(){this.errorBox.hidden=!0,this.errorBox.replaceChildren()}}const fl="commet-demo.1",Ap="manifest.json",j_=[Ke.snapshot,Ke.layout,Ke.fog,Ke.drones,Ke.crew,Ke.beacons,Ke.cochange],Tp={[Ke.unseen]:"home",[Ke.diff]:"fileId",[Ke.droneDetail]:"key",[Ke.crewDetail]:"person"},ex=/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.json$/,tx=/^(?:[a-z]_[A-Za-z0-9_-]{1,128}|star)$/;function Dr(n,e){const t=Tp[n];return t===void 0?n:`${n}?${new URLSearchParams({[t]:e??""})}`}const nx=n=>Dr(Ke.unseen,n??t0);function ix(n){const e=n.indexOf("?"),t=e<0?n:n.slice(0,e);if(e<0)return j_.includes(t)?null:"is not a read route a demo can bake";const i=Tp[t];if(i===void 0)return"is not a per-item route";const s=[...new URLSearchParams(n.slice(e+1))];return s.length!==1||s[0][0]!==i?`must name exactly one ${i}`:tx.test(s[0][1])?Dr(t,s[0][1])===n?null:"is not in its canonical form":`has a ${i} that is not an id`}function sx(n){const e=[],t=n!==null&&typeof n=="object"&&!Array.isArray(n)?n:null;if(!t)throw new Error("the demo manifest is not an object");t.schemaVersion!==fl&&e.push(`schemaVersion must be "${fl}"`);const i=t.routes;if(i===null||typeof i!="object"||Array.isArray(i))e.push("routes must be an object");else{for(const[s,r]of Object.entries(i)){const o=ix(s);o&&e.push(`route ${JSON.stringify(s)} ${o}`),(typeof r!="string"||!ex.test(r)||r===Ap)&&e.push(`route ${JSON.stringify(s)}: its file must be a plain .json name`)}Ke.layout in i||e.push(`routes must include ${Ke.layout}`),Ke.fog in i||e.push(`routes must include ${Ke.fog}`)}if(e.length)throw new Error(`the demo manifest is invalid: ${e.join("; ")}`);return{schemaVersion:fl,routes:i}}async function rx(n,e,t=(i,s)=>fetch(i,s)){const i=new URL(n,e);if(i.origin!==e)throw new Error("the demo data must come from this site");const s={credentials:"omit",redirect:"error",referrerPolicy:"no-referrer"},r=async l=>{const h=new URL(l,i);if(h.origin!==e||!h.pathname.startsWith(i.pathname))throw new Error("the demo data must come from this site");const u=await t(h.href,s);if(!u.ok)throw new Error(`the demo data file ${l} answered ${u.status}`);return u.text()};let o;try{o=JSON.parse(await r(Ap))}catch(l){throw l instanceof SyntaxError?new Error("the demo manifest is not JSON"):l}const a=sx(o),c=new Map;return{routes:Object.keys(a.routes),read:l=>{const h=a.routes[l];if(h===void 0)return Promise.reject(new Error(`the demo data has no file for ${l}`));let u=c.get(h);return u||(u=r(h),u.catch(()=>c.delete(h)),c.set(h,u)),u}}}const _n="the demo data",ws=n=>new At(`This demo has no ${n}.`,["The demo runs on invented data, and it doesn't include this part."]),Es=n=>({ok:!1,error:"unknown-head",head:n});function ox(n){const e=A=>n.routes.includes(A),t=new Map,i=(A,F)=>{let O=t.get(A);return O||(O=n.read(A).then(F,N=>{throw new At("Some of the demo data couldn't be read.",[N instanceof Error?N.message:String(N)])}),O.catch(()=>t.delete(A)),t.set(A,O)),O},s=()=>i(Ke.layout,A=>ig(A,_n)),r=()=>i(Ke.fog,A=>sg(A,_n)),o=A=>i(A,F=>Nn(F,"unseen list",_n,j0)),a=()=>n.routes.filter(A=>A.startsWith(`${Ke.unseen}?`)),c=new Map,l=new Set,h=[],u=[],f=new Set;let d=0;const p=new Set,x=A=>{setTimeout(()=>{for(const F of p)F(A)},0)},m=A=>h.length>0||c.has(A),g=async()=>{const A=await r(),F=q=>({...q,fogged:0,haze:q.haze+q.fogged}),O=A.planets.map(q=>({...q}));let N={...A.star};if(h.length>0)O.forEach((q,V)=>{O[V]={dirId:q.dirId,...F(q)}}),N=F(N);else for(const q of c.values()){const V=q==="star"?N:O.find(X=>X.dirId===q);V.fogged--,V.haze++}return{...A,baseline:h.at(-1)??A.baseline,charted:A.charted||l.size>0,files:A.files.map(q=>q.state==="fogged"&&m(q.fileId)?{fileId:q.fileId,state:"haze",reasons:[],since:null}:q),planets:O,star:N}},M=async A=>{const F=await s();if(F.star.moonlets.some(O=>O.fileId===A))return"star";for(const O of F.planets)if(O.surface.settlements.some(N=>N.fileId===A)||O.moons.some(N=>N.fileId===A))return O.dirId;for(const O of a()){const N=await o(O).catch(()=>null);if(N?.ok&&N.files.some(q=>q.fileId===A))return N.home??"star"}return null},E=async A=>{for(const O of a()){const N=await o(O).catch(()=>null),q=N?.ok?N.files.find(V=>V.fileId===A):void 0;if(q)return q.path}const F=[...e(Ke.cochange)?(await T().catch(()=>null))?.files??[]:[],...e(Ke.beacons)?(await b().catch(()=>null))?.beacons??[]:[]].find(O=>O.fileId===A);return F?F.path:e(Ke.snapshot)?(await v().catch(()=>null))?.files.find(O=>O.id===A)?.path??null:null},y=async()=>(await s()).source.head,T=()=>i(Ke.cochange,A=>lg(A,_n)),b=()=>i(Ke.beacons,A=>ag(A,_n)),v=()=>i(Ke.snapshot,A=>cg(A,_n)),_=async()=>{const A=await y(),F=e(Ke.beacons)?await b():{schemaVersion:"beacons.1",head:A,beacons:[],unplaced:0};return{...F,beacons:[...F.beacons.filter(O=>!f.has(O.fileId)),...u]}};return{wrote:()=>d>0,layout:s,fog:g,drones:async()=>{if(!e(Ke.drones))throw ws("agent sessions");return i(Ke.drones,A=>rg(A,_n))},droneDetail:async(A,F)=>{const O=await y();if(F!==O)return Es(O);const N=Dr(Ke.droneDetail,A);return e(N)?i(N,q=>Nn(q,"session detail",_n,S0)):{ok:!1,error:"no-such-session"}},crew:async()=>{if(!e(Ke.crew))throw ws("crew");return i(Ke.crew,A=>og(A,_n))},crewDetail:async(A,F)=>{const O=await y();if(F!==O)return Es(O);const N=Dr(Ke.crewDetail,A);return e(N)?i(N,q=>Nn(q,"crew detail",_n,_0)):{ok:!1,error:"no-such-person"}},unseen:async(A,F)=>{const O=await g();if(F!==O.head)return Es(O.head);const N=A===null?O.star:O.planets.find(j=>j.dirId===A);if(!N)return{ok:!1,error:"no-such-home"};const q=nx(A);if(!e(q)){if(N.fogged===0)return{ok:!0,at:F,home:A,files:[]};throw ws("review list for this planet")}const V=await o(q);if(!V.ok)throw new At(`The unseen list from ${_n} is a refusal.`);const X=V.files.filter(j=>!m(j.fileId));return{ok:!0,at:F,home:A,files:X}},diff:async(A,F)=>{const O=await g();if(F!==O.head)return Es(O.head);const N=O.files.find(V=>V.fileId===A);if(!N)return{ok:!1,error:"no-such-file"};if(N.state!=="fogged")return{ok:!0,fileId:A,at:F,since:null,base:null,sections:[],truncated:!1,shownLines:0};const q=Dr(Ke.diff,A);if(!e(q))throw ws("diff for this file");return i(q,V=>Nn(V,"diff",_n,eg))},chart:async A=>{const F=await y();if(A.at!==F)return Es(F);if(A.kind==="baseline")h.push(A.at);else if(A.kind==="baseline-undo"){if(h.length===0)return{ok:!1,error:(await r()).baseline===null?"no baseline to undo":"the demo can't undo the baseline its invented data starts with"};h.pop()}else{const O=(await r()).files.find(N=>N.fileId===A.fileId);if(!O)return{ok:!1,error:"no such file at that head"};if(O.state==="fogged"&&!c.has(O.fileId)){const N=await M(O.fileId);if(N===null)return{ok:!1,error:"the demo data doesn't say where this file is"};c.set(O.fileId,N)}l.add(O.fileId)}return d++,x({type:"fog",head:F}),{ok:!0,fog:await g()}},beacons:_,beacon:async A=>{const F=await y();if(A.at!==F)return Es(F);const O=ah(A.text);if(O)return{ok:!1,error:O};if(!(await r()).files.some(X=>X.fileId===A.fileId))return{ok:!1,error:"no such file at that head"};const[N,q]=await Promise.all([M(A.fileId),E(A.fileId)]);if(N===null||q===null)return{ok:!1,error:"the demo data doesn't say where this file is"};const V=u.findIndex(X=>X.fileId===A.fileId);return V>=0&&u.splice(V,1),f.add(A.fileId),u.push({fileId:A.fileId,path:q,home:N,at:A.at,text:A.text}),d++,x({type:"beacons",head:F}),{ok:!0,beacons:await _()}},cochange:async()=>{if(!e(Ke.cochange))throw ws("co-change data");const A=await T(),F=A.flags.filter(O=>h.length===0&&!l.has(O.fileId));return{...A,flags:F,dismissed:A.dismissed+A.flags.length-F.length}},files:async()=>{if(!e(Ke.snapshot))throw ws("file list");return v()},follow(A){return p.add(A),()=>{p.delete(A)}}}}const xh="187",ax=0,Zu=1,lx=2,Qo=1,cx=2,Mr=3,gs=0,kt=1,qn=2,Xs=0,Nr=1,Ju=2,Qu=3,ju=4,hx=5,Vs=100,ux=101,fx=102,dx=103,px=104,mx=200,gx=201,vx=202,_x=203,Rp=204,Cp=205,xx=206,Mx=207,yx=208,Sx=209,bx=210,wx=211,Ex=212,Ax=213,Tx=214,cc=0,hc=1,uc=2,Hr=3,fc=4,dc=5,pc=6,mc=7,Pp=0,Rx=1,Cx=2,pi=0,Lp=1,Ip=2,Dp=3,Np=4,Fp=5,Up=6,Op=7,kp=300,Js=301,Vr=302,dl=303,pl=304,gc=1e3,hi=1001,vc=1002,_t=1003,Px=1004,yo=1005,nn=1006,ml=1007,Ii=1008,fn=1009,Bp=1010,zp=1011,Wr=1012,Mh=1013,Zn=1014,wn=1015,Jn=1016,yh=1017,Sh=1018,Qs=1020,Gp=35902,Hp=35899,Vp=1021,Wp=1022,En=1023,Bi=1026,Di=1027,bh=1028,wh=1029,vs=1030,Eh=1031,Ah=1033,jo=33776,ea=33777,ta=33778,na=33779,_c=35840,xc=35841,Mc=35842,yc=35843,Sc=36196,bc=37492,wc=37496,Ec=37488,Ac=37489,xa=37490,Tc=37491,Rc=37808,Cc=37809,Pc=37810,Lc=37811,Ic=37812,Dc=37813,Nc=37814,Fc=37815,Uc=37816,Oc=37817,kc=37818,Bc=37819,zc=37820,Gc=37821,Hc=36492,Vc=36494,Wc=36495,$c=36283,Xc=36284,Ma=36285,qc=36286,Lx=3200,ef=0,Ix=1,Pi="",bn="srgb",$r="srgb-linear",ya="linear",st="srgb",gl=7680,Dx=519,Nx=512,Fx=513,Ux=514,$p=515,Ox=516,kx=517,Xp=518,qp=519,Bx=35044,tf="300 es",Fn=2e3,Sa=2001;function zx(n){for(let e=n.length-1;e>=0;--e)if(n[e]>=65535)return!0;return!1}function ba(n){return document.createElementNS("http://www.w3.org/1999/xhtml",n)}function Gx(){const n=ba("canvas");return n.style.display="block",n}const nf={};function sf(...n){const e="THREE."+n.shift();console.log(e,...n)}function Yp(n){const e=n[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=n[1];t&&t.isStackTrace?n[0]+=" "+t.getLocation():n[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return n}function De(...n){n=Yp(n);const e="THREE."+n.shift();{const t=n[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...n)}}function et(...n){n=Yp(n);const e="THREE."+n.shift();{const t=n[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...n)}}function ia(...n){const e=n.join(" ");e in nf||(nf[e]=!0,De(...n))}function Hx(n,e,t){return new Promise(function(i,s){function r(){switch(n.clientWaitSync(e,n.SYNC_FLUSH_COMMANDS_BIT,0)){case n.WAIT_FAILED:s();break;case n.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:i()}}setTimeout(r,t)})}const Vx={[cc]:cc,[uc]:pc,[fc]:fc,[Hr]:dc,[hc]:hc,[pc]:uc,[mc]:mc,[dc]:Hr};class _s{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){const i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){const i=this._listeners;if(i===void 0)return;const s=i[e];if(s!==void 0){const r=s.indexOf(t);r!==-1&&s.splice(r,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const i=t[e.type];if(i!==void 0){e.target=this;const s=i.slice(0);for(let r=0,o=s.length;r<o;r++)s[r].call(this,e);e.target=null}}}const $t=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"];let rf=1234567;const Fr=Math.PI/180,Xr=180/Math.PI;function ir(){const n=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return($t[n&255]+$t[n>>8&255]+$t[n>>16&255]+$t[n>>24&255]+"-"+$t[e&255]+$t[e>>8&255]+"-"+$t[e>>16&15|64]+$t[e>>24&255]+"-"+$t[t&63|128]+$t[t>>8&255]+"-"+$t[t>>16&255]+$t[t>>24&255]+$t[i&255]+$t[i>>8&255]+$t[i>>16&255]+$t[i>>24&255]).toLowerCase()}function Ye(n,e,t){return Math.max(e,Math.min(t,n))}function Th(n,e){return(n%e+e)%e}function Wx(n,e,t,i,s){return i+(n-e)*(s-i)/(t-e)}function $x(n,e,t){return n!==e?(t-n)/(e-n):0}function Ur(n,e,t){return(1-t)*n+t*e}function Xx(n,e,t,i){return Ur(n,e,1-Math.exp(-t*i))}function qx(n,e=1){return e-Math.abs(Th(n,e*2)-e)}function Yx(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*(3-2*n))}function Kx(n,e,t){return n<=e?0:n>=t?1:(n=(n-e)/(t-e),n*n*n*(n*(n*6-15)+10))}function Zx(n,e){return n+Math.floor(Math.random()*(e-n+1))}function Jx(n,e){return n+Math.random()*(e-n)}function Qx(n){return n*(.5-Math.random())}function jx(n){n!==void 0&&(rf=n);let e=rf+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function eM(n){return n*Fr}function tM(n){return n*Xr}function nM(n){return n>0&&Number.isInteger(n)&&2**Math.round(Math.log2(n))===n}function iM(n){return Math.pow(2,Math.ceil(Math.log(n)/Math.LN2))}function Kp(n){return Math.pow(2,Math.floor(Math.log(n)/Math.LN2))}function sM(n,e,t,i,s){const r=Math.cos,o=Math.sin,a=r(t/2),c=o(t/2),l=r((e+i)/2),h=o((e+i)/2),u=r((e-i)/2),f=o((e-i)/2),d=r((i-e)/2),p=o((i-e)/2);switch(s){case"XYX":n.set(a*h,c*u,c*f,a*l);break;case"YZY":n.set(c*f,a*h,c*u,a*l);break;case"ZXZ":n.set(c*u,c*f,a*h,a*l);break;case"XZX":n.set(a*h,c*p,c*d,a*l);break;case"YXY":n.set(c*d,a*h,c*p,a*l);break;case"ZYZ":n.set(c*p,c*d,a*h,a*l);break;default:De("MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+s)}}function Rh(n){switch(n.constructor){case Uint32Array:return 4294967295;case Uint16Array:return 65535;case Uint8Array:case Uint8ClampedArray:return 255;case Int32Array:return 2147483647;case Int16Array:return 32767;case Int8Array:return 127;default:return}}function Zp(n,e){if(e.constructor===Float32Array)return n;const t=Rh(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.max(n/t,-1)}function Jp(n,e){if(e.constructor===Float32Array)return n;const t=Rh(e);if(t===void 0)throw new Error("THREE.MathUtils: Invalid component type.");return Math.round(n*t)}const rM={DEG2RAD:Fr,RAD2DEG:Xr,generateUUID:ir,clamp:Ye,euclideanModulo:Th,mapLinear:Wx,inverseLerp:$x,lerp:Ur,damp:Xx,pingpong:qx,smoothstep:Yx,smootherstep:Kx,randInt:Zx,randFloat:Jx,randFloatSpread:Qx,seededRandom:jx,degToRad:eM,radToDeg:tM,isPowerOfTwo:nM,ceilPowerOfTwo:iM,floorPowerOfTwo:Kp,setQuaternionFromProperEuler:sM,normalize:Jp,denormalize:Zp};class ze{static{this.prototype.isVector2=!0}constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,i=this.y,s=e.elements;return this.x=s[0]*t+s[3]*i+s[6],this.y=s[1]*t+s[4]*i+s[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(Ye(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const i=Math.cos(t),s=Math.sin(t),r=this.x-e.x,o=this.y-e.y;return this.x=r*i-o*s+e.x,this.y=r*s+o*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class Qn{constructor(e=0,t=0,i=0,s=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=s}static slerpFlat(e,t,i,s,r,o,a){let c=i[s+0],l=i[s+1],h=i[s+2],u=i[s+3],f=r[o+0],d=r[o+1],p=r[o+2],x=r[o+3];if(u!==x||c!==f||l!==d||h!==p){let m=c*f+l*d+h*p+u*x;m<0&&(f=-f,d=-d,p=-p,x=-x,m=-m);let g=1-a;if(m<.9995){const M=Math.acos(m),E=Math.sin(M);g=Math.sin(g*M)/E,a=Math.sin(a*M)/E,c=c*g+f*a,l=l*g+d*a,h=h*g+p*a,u=u*g+x*a}else{c=c*g+f*a,l=l*g+d*a,h=h*g+p*a,u=u*g+x*a;const M=1/Math.sqrt(c*c+l*l+h*h+u*u);c*=M,l*=M,h*=M,u*=M}}e[t]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,i,s,r,o){const a=i[s],c=i[s+1],l=i[s+2],h=i[s+3],u=r[o],f=r[o+1],d=r[o+2],p=r[o+3];return e[t]=a*p+h*u+c*d-l*f,e[t+1]=c*p+h*f+l*u-a*d,e[t+2]=l*p+h*d+a*f-c*u,e[t+3]=h*p-a*u-c*f-l*d,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,s){return this._x=e,this._y=t,this._z=i,this._w=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const i=e._x,s=e._y,r=e._z,o=e._order,a=Math.cos,c=Math.sin,l=a(i/2),h=a(s/2),u=a(r/2),f=c(i/2),d=c(s/2),p=c(r/2);switch(o){case"XYZ":this._x=f*h*u+l*d*p,this._y=l*d*u-f*h*p,this._z=l*h*p+f*d*u,this._w=l*h*u-f*d*p;break;case"YXZ":this._x=f*h*u+l*d*p,this._y=l*d*u-f*h*p,this._z=l*h*p-f*d*u,this._w=l*h*u+f*d*p;break;case"ZXY":this._x=f*h*u-l*d*p,this._y=l*d*u+f*h*p,this._z=l*h*p+f*d*u,this._w=l*h*u-f*d*p;break;case"ZYX":this._x=f*h*u-l*d*p,this._y=l*d*u+f*h*p,this._z=l*h*p-f*d*u,this._w=l*h*u+f*d*p;break;case"YZX":this._x=f*h*u+l*d*p,this._y=l*d*u+f*h*p,this._z=l*h*p-f*d*u,this._w=l*h*u-f*d*p;break;case"XZY":this._x=f*h*u-l*d*p,this._y=l*d*u-f*h*p,this._z=l*h*p+f*d*u,this._w=l*h*u+f*d*p;break;default:De("Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const i=t/2,s=Math.sin(i);return this._x=e.x*s,this._y=e.y*s,this._z=e.z*s,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,i=t[0],s=t[4],r=t[8],o=t[1],a=t[5],c=t[9],l=t[2],h=t[6],u=t[10],f=i+a+u;if(f>0){const d=.5/Math.sqrt(f+1);this._w=.25/d,this._x=(h-c)*d,this._y=(r-l)*d,this._z=(o-s)*d}else if(i>a&&i>u){const d=2*Math.sqrt(1+i-a-u);this._w=(h-c)/d,this._x=.25*d,this._y=(s+o)/d,this._z=(r+l)/d}else if(a>u){const d=2*Math.sqrt(1+a-i-u);this._w=(r-l)/d,this._x=(s+o)/d,this._y=.25*d,this._z=(c+h)/d}else{const d=2*Math.sqrt(1+u-i-a);this._w=(o-s)/d,this._x=(r+l)/d,this._y=(c+h)/d,this._z=.25*d}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ye(this.dot(e),-1,1)))}rotateTowards(e,t){const i=this.angleTo(e);if(i===0)return this;const s=Math.min(1,t/i);return this.slerp(e,s),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const i=e._x,s=e._y,r=e._z,o=e._w,a=t._x,c=t._y,l=t._z,h=t._w;return this._x=i*h+o*a+s*l-r*c,this._y=s*h+o*c+r*a-i*l,this._z=r*h+o*l+i*c-s*a,this._w=o*h-i*a-s*c-r*l,this._onChangeCallback(),this}slerp(e,t){let i=e._x,s=e._y,r=e._z,o=e._w,a=this.dot(e);a<0&&(i=-i,s=-s,r=-r,o=-o,a=-a);let c=1-t;if(a<.9995){const l=Math.acos(a),h=Math.sin(l);c=Math.sin(c*l)/h,t=Math.sin(t*l)/h,this._x=this._x*c+i*t,this._y=this._y*c+s*t,this._z=this._z*c+r*t,this._w=this._w*c+o*t,this._onChangeCallback()}else this._x=this._x*c+i*t,this._y=this._y*c+s*t,this._z=this._z*c+r*t,this._w=this._w*c+o*t,this.normalize();return this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),s=Math.sqrt(1-i),r=Math.sqrt(i);return this.set(s*Math.sin(e),s*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class z{static{this.prototype.isVector3=!0}constructor(e=0,t=0,i=0){this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(of.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(of.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,i=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[3]*i+r[6]*s,this.y=r[1]*t+r[4]*i+r[7]*s,this.z=r[2]*t+r[5]*i+r[8]*s,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,i=this.y,s=this.z,r=e.elements,o=1/(r[3]*t+r[7]*i+r[11]*s+r[15]);return this.x=(r[0]*t+r[4]*i+r[8]*s+r[12])*o,this.y=(r[1]*t+r[5]*i+r[9]*s+r[13])*o,this.z=(r[2]*t+r[6]*i+r[10]*s+r[14])*o,this}applyQuaternion(e){const t=this.x,i=this.y,s=this.z,r=e.x,o=e.y,a=e.z,c=e.w,l=2*(o*s-a*i),h=2*(a*t-r*s),u=2*(r*i-o*t);return this.x=t+c*l+o*u-a*h,this.y=i+c*h+a*l-r*u,this.z=s+c*u+r*h-o*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,i=this.y,s=this.z,r=e.elements;return this.x=r[0]*t+r[4]*i+r[8]*s,this.y=r[1]*t+r[5]*i+r[9]*s,this.z=r[2]*t+r[6]*i+r[10]*s,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this.z=Ye(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this.z=Ye(this.z,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const i=e.x,s=e.y,r=e.z,o=t.x,a=t.y,c=t.z;return this.x=s*c-r*a,this.y=r*o-i*c,this.z=i*a-s*o,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return vl.copy(this).projectOnVector(e),this.sub(vl)}reflect(e){return this.sub(vl.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(Ye(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y,s=this.z-e.z;return t*t+i*i+s*s}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){const s=Math.sin(t)*e;return this.x=s*Math.sin(i),this.y=Math.cos(t)*e,this.z=s*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),s=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=s,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const vl=new z,of=new Qn;class Oe{static{this.prototype.isMatrix3=!0}constructor(e,t,i,s,r,o,a,c,l){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,s,r,o,a,c,l)}set(e,t,i,s,r,o,a,c,l){const h=this.elements;return h[0]=e,h[1]=s,h[2]=a,h[3]=t,h[4]=r,h[5]=c,h[6]=i,h[7]=o,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,s=t.elements,r=this.elements,o=i[0],a=i[3],c=i[6],l=i[1],h=i[4],u=i[7],f=i[2],d=i[5],p=i[8],x=s[0],m=s[3],g=s[6],M=s[1],E=s[4],y=s[7],T=s[2],b=s[5],v=s[8];return r[0]=o*x+a*M+c*T,r[3]=o*m+a*E+c*b,r[6]=o*g+a*y+c*v,r[1]=l*x+h*M+u*T,r[4]=l*m+h*E+u*b,r[7]=l*g+h*y+u*v,r[2]=f*x+d*M+p*T,r[5]=f*m+d*E+p*b,r[8]=f*g+d*y+p*v,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8];return t*o*h-t*a*l-i*r*h+i*a*c+s*r*l-s*o*c}invert(){const e=this.elements,t=e[0],i=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8],u=h*o-a*l,f=a*c-h*r,d=l*r-o*c,p=t*u+i*f+s*d;if(p===0)return this.set(0,0,0,0,0,0,0,0,0);const x=1/p;return e[0]=u*x,e[1]=(s*l-h*i)*x,e[2]=(a*i-s*o)*x,e[3]=f*x,e[4]=(h*t-s*c)*x,e[5]=(s*r-a*t)*x,e[6]=d*x,e[7]=(i*c-l*t)*x,e[8]=(o*t-i*r)*x,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,s,r,o,a){const c=Math.cos(r),l=Math.sin(r);return this.set(i*c,i*l,-i*(c*o+l*a)+o+e,-s*l,s*c,-s*(-l*o+c*a)+a+t,0,0,1),this}scale(e,t){return ia("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(_l.makeScale(e,t)),this}rotate(e){return ia("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(_l.makeRotation(-e)),this}translate(e,t){return ia("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(_l.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,i=e.elements;for(let s=0;s<9;s++)if(t[s]!==i[s])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const _l=new Oe,af=new Oe().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),lf=new Oe().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function oM(){const n={enabled:!0,workingColorSpace:$r,spaces:{},convert:function(s,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===st&&(s.r=mi(s.r),s.g=mi(s.g),s.b=mi(s.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(s.applyMatrix3(this.spaces[r].toXYZ),s.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===st&&(s.r=qs(s.r),s.g=qs(s.g),s.b=qs(s.b))),s},workingToColorSpace:function(s,r){return this.convert(s,this.workingColorSpace,r)},colorSpaceToWorking:function(s,r){return this.convert(s,r,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Pi?ya:this.spaces[s].transfer},getToneMappingMode:function(s){return this.spaces[s].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(s,r=this.workingColorSpace){return s.fromArray(this.spaces[r].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,r,o){return s.copy(this.spaces[o].fromXYZ).multiply(this.spaces[r].toXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return n.define({[$r]:{primaries:e,whitePoint:i,transfer:ya,toXYZ:af,fromXYZ:lf,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:bn},outputColorSpaceConfig:{drawingBufferColorSpace:bn}},[bn]:{primaries:e,whitePoint:i,transfer:st,toXYZ:af,fromXYZ:lf,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:bn}}}),n}const qe=oM();function mi(n){return n<.04045?n*.0773993808:Math.pow(n*.9478672986+.0521327014,2.4)}function qs(n){return n<.0031308?n*12.92:1.055*Math.pow(n,.41666)-.055}let As;class aM{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{As===void 0&&(As=ba("canvas")),As.width=e.width,As.height=e.height;const s=As.getContext("2d");e instanceof ImageData?s.putImageData(e,0,0):s.drawImage(e,0,0,e.width,e.height),i=As}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=ba("canvas");t.width=e.width,t.height=e.height;const i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);const s=i.getImageData(0,0,e.width,e.height),r=s.data;for(let o=0;o<r.length;o++)r[o]=mi(r[o]/255)*255;return i.putImageData(s,0,0),t}else if(e.data){const t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(mi(t[i]/255)*255):t[i]=mi(t[i]);return{data:t,width:e.width,height:e.height}}else return De("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let lM=0;class Ch{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:lM++}),this.uuid=ir(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width||0,t.height||0,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const i={uuid:this.uuid,url:""},s=this.data;if(s!==null){let r;if(Array.isArray(s)){r=[];for(let o=0,a=s.length;o<a;o++)s[o].isDataTexture?r.push(xl(s[o].image)):r.push(xl(s[o]))}else r=xl(s);i.url=r}return t||(e.images[this.uuid]=i),i}}function xl(n){return typeof HTMLImageElement<"u"&&n instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&n instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&n instanceof ImageBitmap?aM.getDataURL(n):n.data?{data:Array.from(n.data),width:n.width,height:n.height,type:n.data.constructor.name}:(De("Texture: Unable to serialize Texture."),{})}let cM=0;const Ml=new z;class en extends _s{constructor(e=en.DEFAULT_IMAGE,t=en.DEFAULT_MAPPING,i=hi,s=hi,r=nn,o=Ii,a=En,c=fn,l=en.DEFAULT_ANISOTROPY,h=Pi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:cM++}),this.uuid=ir(),this.name="",this.source=new Ch(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=s,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new ze(0,0),this.repeat=new ze(1,1),this.center=new ze(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Oe,this.generateMipmaps=!0,this.mipmapsAutoUpdate=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.isPMREMTexture=!1,this.normalized=!1}get width(){return this.source.getSize(Ml).x}get height(){return this.source.getSize(Ml).y}get depth(){return this.source.getSize(Ml).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.mipmapsAutoUpdate=e.mipmapsAutoUpdate,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isPMREMTexture=e.isPMREMTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const i=e[t];if(i===void 0){De(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){De(`Texture.setValues(): property '${t}' does not exist.`);continue}s&&i&&s.isVector2&&i.isVector2||s&&i&&s.isVector3&&i.isVector3||s&&i&&s.isMatrix3&&i.isMatrix3?s.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,mipmapsAutoUpdate:this.mipmapsAutoUpdate,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==kp)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case gc:e.x=e.x-Math.floor(e.x);break;case hi:e.x=e.x<0?0:1;break;case vc:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case gc:e.y=e.y-Math.floor(e.y);break;case hi:e.y=e.y<0?0:1;break;case vc:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}en.DEFAULT_IMAGE=null;en.DEFAULT_MAPPING=kp;en.DEFAULT_ANISOTROPY=1;class ct{static{this.prototype.isVector4=!0}constructor(e=0,t=0,i=0,s=1){this.x=e,this.y=t,this.z=i,this.w=s}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,s){return this.x=e,this.y=t,this.z=i,this.w=s,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,i=this.y,s=this.z,r=this.w,o=e.elements;return this.x=o[0]*t+o[4]*i+o[8]*s+o[12]*r,this.y=o[1]*t+o[5]*i+o[9]*s+o[13]*r,this.z=o[2]*t+o[6]*i+o[10]*s+o[14]*r,this.w=o[3]*t+o[7]*i+o[11]*s+o[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,s,r;const c=e.elements,l=c[0],h=c[4],u=c[8],f=c[1],d=c[5],p=c[9],x=c[2],m=c[6],g=c[10];if(Math.abs(h-f)<.01&&Math.abs(u-x)<.01&&Math.abs(p-m)<.01){if(Math.abs(h+f)<.1&&Math.abs(u+x)<.1&&Math.abs(p+m)<.1&&Math.abs(l+d+g-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const E=(l+1)/2,y=(d+1)/2,T=(g+1)/2,b=(h+f)/4,v=(u+x)/4,_=(p+m)/4;return E>y&&E>T?E<.01?(i=0,s=.707106781,r=.707106781):(i=Math.sqrt(E),s=b/i,r=v/i):y>T?y<.01?(i=.707106781,s=0,r=.707106781):(s=Math.sqrt(y),i=b/s,r=_/s):T<.01?(i=.707106781,s=.707106781,r=0):(r=Math.sqrt(T),i=v/r,s=_/r),this.set(i,s,r,t),this}let M=Math.sqrt((m-p)*(m-p)+(u-x)*(u-x)+(f-h)*(f-h));return Math.abs(M)<.001&&(M=1),this.x=(m-p)/M,this.y=(u-x)/M,this.z=(f-h)/M,this.w=Math.acos((l+d+g-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ye(this.x,e.x,t.x),this.y=Ye(this.y,e.y,t.y),this.z=Ye(this.z,e.z,t.z),this.w=Ye(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ye(this.x,e,t),this.y=Ye(this.y,e,t),this.z=Ye(this.z,e,t),this.w=Ye(this.w,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ye(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class hM extends _s{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:nn,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new ct(0,0,e,t),this.scissorTest=!1,this.viewport=new ct(0,0,e,t),this.textures=[];const s=i.count;for(let r=0;r<s;r++)this.textures[r]=new en({width:e,height:t,depth:i.depth}),this.textures[r].isRenderTargetTexture=!0,this.textures[r].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveColorBuffer=i.resolveColorBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.storeMultisampledColorBuffer=i.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=i.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=i.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview,this.useArrayDepthTexture=i.useArrayDepthTexture}_setTextureOptions(e={}){const t={minFilter:nn,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.mipmapsAutoUpdate!==void 0&&(t.mipmapsAutoUpdate=e.mipmapsAutoUpdate),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let s=0,r=this.textures.length;s<r;s++)this.textures[s].image.width=e,this.textures[s].image.height=t,this.textures[s].image.depth=i,this.textures[s].isData3DTexture!==!0&&(this.textures[s].isArrayTexture=this.textures[s].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const s=Object.assign({},e.textures[t].image);this.textures[t].source=new Ch(s)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){const t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;else this.depthTexture=null;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class On extends hM{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}}class Qp extends en{constructor(e=null,t=1,i=1,s=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:s},this.magFilter=_t,this.minFilter=_t,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class uM extends en{constructor(e=null,t=1,i=1,s=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:s},this.magFilter=_t,this.minFilter=_t,this.wrapR=hi,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}}class Ve{static{this.prototype.isMatrix4=!0}constructor(e,t,i,s,r,o,a,c,l,h,u,f,d,p,x,m){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,s,r,o,a,c,l,h,u,f,d,p,x,m)}set(e,t,i,s,r,o,a,c,l,h,u,f,d,p,x,m){const g=this.elements;return g[0]=e,g[4]=t,g[8]=i,g[12]=s,g[1]=r,g[5]=o,g[9]=a,g[13]=c,g[2]=l,g[6]=h,g[10]=u,g[14]=f,g[3]=d,g[7]=p,g[11]=x,g[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Ve().fromArray(this.elements)}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){const t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),i.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this)}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();const t=this.elements,i=e.elements,s=1/Ts.setFromMatrixColumn(e,0).length(),r=1/Ts.setFromMatrixColumn(e,1).length(),o=1/Ts.setFromMatrixColumn(e,2).length();return t[0]=i[0]*s,t[1]=i[1]*s,t[2]=i[2]*s,t[3]=0,t[4]=i[4]*r,t[5]=i[5]*r,t[6]=i[6]*r,t[7]=0,t[8]=i[8]*o,t[9]=i[9]*o,t[10]=i[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,i=e.x,s=e.y,r=e.z,o=Math.cos(i),a=Math.sin(i),c=Math.cos(s),l=Math.sin(s),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){const f=o*h,d=o*u,p=a*h,x=a*u;t[0]=c*h,t[4]=-c*u,t[8]=l,t[1]=d+p*l,t[5]=f-x*l,t[9]=-a*c,t[2]=x-f*l,t[6]=p+d*l,t[10]=o*c}else if(e.order==="YXZ"){const f=c*h,d=c*u,p=l*h,x=l*u;t[0]=f+x*a,t[4]=p*a-d,t[8]=o*l,t[1]=o*u,t[5]=o*h,t[9]=-a,t[2]=d*a-p,t[6]=x+f*a,t[10]=o*c}else if(e.order==="ZXY"){const f=c*h,d=c*u,p=l*h,x=l*u;t[0]=f-x*a,t[4]=-o*u,t[8]=p+d*a,t[1]=d+p*a,t[5]=o*h,t[9]=x-f*a,t[2]=-o*l,t[6]=a,t[10]=o*c}else if(e.order==="ZYX"){const f=o*h,d=o*u,p=a*h,x=a*u;t[0]=c*h,t[4]=p*l-d,t[8]=f*l+x,t[1]=c*u,t[5]=x*l+f,t[9]=d*l-p,t[2]=-l,t[6]=a*c,t[10]=o*c}else if(e.order==="YZX"){const f=o*c,d=o*l,p=a*c,x=a*l;t[0]=c*h,t[4]=x-f*u,t[8]=p*u+d,t[1]=u,t[5]=o*h,t[9]=-a*h,t[2]=-l*h,t[6]=d*u+p,t[10]=f-x*u}else if(e.order==="XZY"){const f=o*c,d=o*l,p=a*c,x=a*l;t[0]=c*h,t[4]=-u,t[8]=l*h,t[1]=f*u+x,t[5]=o*h,t[9]=d*u-p,t[2]=p*u-d,t[6]=a*h,t[10]=x*u+f}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(fM,e,dM)}lookAt(e,t,i){const s=this.elements;return ln.subVectors(e,t),ln.lengthSq()===0&&(ln.z=1),ln.normalize(),yi.crossVectors(i,ln),yi.lengthSq()===0&&(Math.abs(i.z)===1?ln.x+=1e-4:ln.z+=1e-4,ln.normalize(),yi.crossVectors(i,ln)),yi.normalize(),So.crossVectors(ln,yi),s[0]=yi.x,s[4]=So.x,s[8]=ln.x,s[1]=yi.y,s[5]=So.y,s[9]=ln.y,s[2]=yi.z,s[6]=So.z,s[10]=ln.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,s=t.elements,r=this.elements,o=i[0],a=i[4],c=i[8],l=i[12],h=i[1],u=i[5],f=i[9],d=i[13],p=i[2],x=i[6],m=i[10],g=i[14],M=i[3],E=i[7],y=i[11],T=i[15],b=s[0],v=s[4],_=s[8],R=s[12],C=s[1],L=s[5],D=s[9],B=s[13],A=s[2],F=s[6],O=s[10],N=s[14],q=s[3],V=s[7],X=s[11],j=s[15];return r[0]=o*b+a*C+c*A+l*q,r[4]=o*v+a*L+c*F+l*V,r[8]=o*_+a*D+c*O+l*X,r[12]=o*R+a*B+c*N+l*j,r[1]=h*b+u*C+f*A+d*q,r[5]=h*v+u*L+f*F+d*V,r[9]=h*_+u*D+f*O+d*X,r[13]=h*R+u*B+f*N+d*j,r[2]=p*b+x*C+m*A+g*q,r[6]=p*v+x*L+m*F+g*V,r[10]=p*_+x*D+m*O+g*X,r[14]=p*R+x*B+m*N+g*j,r[3]=M*b+E*C+y*A+T*q,r[7]=M*v+E*L+y*F+T*V,r[11]=M*_+E*D+y*O+T*X,r[15]=M*R+E*B+y*N+T*j,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[4],s=e[8],r=e[12],o=e[1],a=e[5],c=e[9],l=e[13],h=e[2],u=e[6],f=e[10],d=e[14],p=e[3],x=e[7],m=e[11],g=e[15],M=c*d-l*f,E=a*d-l*u,y=a*f-c*u,T=o*d-l*h,b=o*f-c*h,v=o*u-a*h;return t*(x*M-m*E+g*y)-i*(p*M-m*T+g*b)+s*(p*E-x*T+g*v)-r*(p*y-x*b+m*v)}determinantAffine(){const e=this.elements,t=e[0],i=e[4],s=e[8],r=e[1],o=e[5],a=e[9],c=e[2],l=e[6],h=e[10];return t*(o*h-a*l)-i*(r*h-a*c)+s*(r*l-o*c)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){const s=this.elements;return e.isVector3?(s[12]=e.x,s[13]=e.y,s[14]=e.z):(s[12]=e,s[13]=t,s[14]=i),this}invert(){const e=this.elements,t=e[0],i=e[1],s=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8],u=e[9],f=e[10],d=e[11],p=e[12],x=e[13],m=e[14],g=e[15],M=t*a-i*o,E=t*c-s*o,y=t*l-r*o,T=i*c-s*a,b=i*l-r*a,v=s*l-r*c,_=h*x-u*p,R=h*m-f*p,C=h*g-d*p,L=u*m-f*x,D=u*g-d*x,B=f*g-d*m,A=M*B-E*D+y*L+T*C-b*R+v*_;if(A===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const F=1/A;return e[0]=(a*B-c*D+l*L)*F,e[1]=(s*D-i*B-r*L)*F,e[2]=(x*v-m*b+g*T)*F,e[3]=(f*b-u*v-d*T)*F,e[4]=(c*C-o*B-l*R)*F,e[5]=(t*B-s*C+r*R)*F,e[6]=(m*y-p*v-g*E)*F,e[7]=(h*v-f*y+d*E)*F,e[8]=(o*D-a*C+l*_)*F,e[9]=(i*C-t*D-r*_)*F,e[10]=(p*b-x*y+g*M)*F,e[11]=(u*y-h*b-d*M)*F,e[12]=(a*R-o*L-c*_)*F,e[13]=(t*L-i*R+s*_)*F,e[14]=(x*E-p*T-m*M)*F,e[15]=(h*T-u*E+f*M)*F,this}scale(e){const t=this.elements,i=e.x,s=e.y,r=e.z;return t[0]*=i,t[4]*=s,t[8]*=r,t[1]*=i,t[5]*=s,t[9]*=r,t[2]*=i,t[6]*=s,t[10]*=r,t[3]*=i,t[7]*=s,t[11]*=r,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],s=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,s))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const i=Math.cos(t),s=Math.sin(t),r=1-i,o=e.x,a=e.y,c=e.z,l=r*o,h=r*a;return this.set(l*o+i,l*a-s*c,l*c+s*a,0,l*a+s*c,h*a+i,h*c-s*o,0,l*c-s*a,h*c+s*o,r*c*c+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,s,r,o){return this.set(1,i,r,0,e,1,o,0,t,s,1,0,0,0,0,1),this}compose(e,t,i){const s=this.elements,r=t._x,o=t._y,a=t._z,c=t._w,l=r+r,h=o+o,u=a+a,f=r*l,d=r*h,p=r*u,x=o*h,m=o*u,g=a*u,M=c*l,E=c*h,y=c*u,T=i.x,b=i.y,v=i.z;return s[0]=(1-(x+g))*T,s[1]=(d+y)*T,s[2]=(p-E)*T,s[3]=0,s[4]=(d-y)*b,s[5]=(1-(f+g))*b,s[6]=(m+M)*b,s[7]=0,s[8]=(p+E)*v,s[9]=(m-M)*v,s[10]=(1-(f+x))*v,s[11]=0,s[12]=e.x,s[13]=e.y,s[14]=e.z,s[15]=1,this}decompose(e,t,i){const s=this.elements;e.x=s[12],e.y=s[13],e.z=s[14];const r=this.determinantAffine();if(r===0)return i.set(1,1,1),t.identity(),this;let o=Ts.set(s[0],s[1],s[2]).length();const a=Ts.set(s[4],s[5],s[6]).length(),c=Ts.set(s[8],s[9],s[10]).length();r<0&&(o=-o),Cn.copy(this);const l=1/o,h=1/a,u=1/c;return Cn.elements[0]*=l,Cn.elements[1]*=l,Cn.elements[2]*=l,Cn.elements[4]*=h,Cn.elements[5]*=h,Cn.elements[6]*=h,Cn.elements[8]*=u,Cn.elements[9]*=u,Cn.elements[10]*=u,t.setFromRotationMatrix(Cn),i.x=o,i.y=a,i.z=c,this}makePerspective(e,t,i,s,r,o,a=Fn,c=!1){const l=this.elements,h=2*r/(t-e),u=2*r/(i-s),f=(t+e)/(t-e),d=(i+s)/(i-s);let p,x;if(c)p=r/(o-r),x=o*r/(o-r);else if(a===Fn)p=-(o+r)/(o-r),x=-2*o*r/(o-r);else if(a===Sa)p=-o/(o-r),x=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return l[0]=h,l[4]=0,l[8]=f,l[12]=0,l[1]=0,l[5]=u,l[9]=d,l[13]=0,l[2]=0,l[6]=0,l[10]=p,l[14]=x,l[3]=0,l[7]=0,l[11]=-1,l[15]=0,this}makeOrthographic(e,t,i,s,r,o,a=Fn,c=!1){const l=this.elements,h=2/(t-e),u=2/(i-s),f=-(t+e)/(t-e),d=-(i+s)/(i-s);let p,x;if(c)p=1/(o-r),x=o/(o-r);else if(a===Fn)p=-2/(o-r),x=-(o+r)/(o-r);else if(a===Sa)p=-1/(o-r),x=-r/(o-r);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return l[0]=h,l[4]=0,l[8]=0,l[12]=f,l[1]=0,l[5]=u,l[9]=0,l[13]=d,l[2]=0,l[6]=0,l[10]=p,l[14]=x,l[3]=0,l[7]=0,l[11]=0,l[15]=1,this}equals(e){const t=this.elements,i=e.elements;for(let s=0;s<16;s++)if(t[s]!==i[s])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}}const Ts=new z,Cn=new Ve,fM=new z(0,0,0),dM=new z(1,1,1),yi=new z,So=new z,ln=new z,cf=new Ve,hf=new Qn;class zi{constructor(e=0,t=0,i=0,s=zi.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=s}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,s=this._order){return this._x=e,this._y=t,this._z=i,this._order=s,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){const s=e.elements,r=s[0],o=s[4],a=s[8],c=s[1],l=s[5],h=s[9],u=s[2],f=s[6],d=s[10];switch(t){case"XYZ":this._y=Math.asin(Ye(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,d),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(f,l),this._z=0);break;case"YXZ":this._x=Math.asin(-Ye(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,d),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(Ye(f,-1,1)),Math.abs(f)<.9999999?(this._y=Math.atan2(-u,d),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-Ye(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(f,d),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(Ye(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(a,d));break;case"XZY":this._z=Math.asin(-Ye(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(f,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,d),this._y=0);break;default:De("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return cf.makeRotationFromQuaternion(e),this.setFromRotationMatrix(cf,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return hf.setFromEuler(this),this.setFromQuaternion(hf,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}zi.DEFAULT_ORDER="XYZ";class jp{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let pM=0;const uf=new z,Rs=new Qn,ei=new Ve,bo=new z,lr=new z,mM=new z,gM=new Qn,ff=new z(1,0,0),df=new z(0,1,0),pf=new z(0,0,1),mf={type:"added"},vM={type:"removed"},Cs={type:"childadded",child:null},yl={type:"childremoved",child:null};class on extends _s{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:pM++}),this.uuid=ir(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=on.DEFAULT_UP.clone();const e=new z,t=new zi,i=new Qn,s=new z(1,1,1);function r(){i.setFromEuler(t,!1)}function o(){t.setFromQuaternion(i,void 0,!1)}t._onChange(r),i._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:s},modelViewMatrix:{value:new Ve},normalMatrix:{value:new Oe}}),this.matrix=new Ve,this.matrixWorld=new Ve,this.matrixAutoUpdate=on.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=on.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new jp,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale),this.pivot!==null&&this.position.copy(this.pivot).applyMatrix4(this.matrix).sub(this.pivot)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Rs.setFromAxisAngle(e,t),this.quaternion.multiply(Rs),this}rotateOnWorldAxis(e,t){return Rs.setFromAxisAngle(e,t),this.quaternion.premultiply(Rs),this}rotateX(e){return this.rotateOnAxis(ff,e)}rotateY(e){return this.rotateOnAxis(df,e)}rotateZ(e){return this.rotateOnAxis(pf,e)}translateOnAxis(e,t){return uf.copy(e).applyQuaternion(this.quaternion),this.position.add(uf.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(ff,e)}translateY(e){return this.translateOnAxis(df,e)}translateZ(e){return this.translateOnAxis(pf,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(ei.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?bo.copy(e):bo.set(e,t,i);const s=this.parent;this.updateWorldMatrix(!0,!1),lr.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?ei.lookAt(lr,bo,this.up):ei.lookAt(bo,lr,this.up),this.quaternion.setFromRotationMatrix(ei),s&&(ei.extractRotation(s.matrixWorld),Rs.setFromRotationMatrix(ei),this.quaternion.premultiply(Rs.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(et("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(mf),Cs.child=e,this.dispatchEvent(Cs),Cs.child=null):et("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(vM),yl.child=e,this.dispatchEvent(yl),yl.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),ei.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),ei.multiply(e.parent.matrixWorld)),e.applyMatrix4(ei),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(mf),Cs.child=e,this.dispatchEvent(Cs),Cs.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,s=this.children.length;i<s;i++){const o=this.children[i].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);const s=this.children;for(let r=0,o=s.length;r<o;r++)s[r].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(lr,e,mM),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(lr,gM,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){return!0}traverse(e){e(this);const t=this.children;for(let i=0,s=t.length;i<s;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let i=0,s=t.length;i<s;i++)t[i].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,i=e.y,s=e.z,r=this.matrix.elements;r[12]+=t-r[0]*t-r[4]*i-r[8]*s,r[13]+=i-r[1]*t-r[5]*i-r[9]*s,r[14]+=s-r[2]*t-r[6]*i-r[10]*s}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let i=0,s=t.length;i<s;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t,i=!1){const s=this.parent;if(e===!0&&s!==null&&s.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||i)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,i=!0),t===!0){const r=this.children;for(let o=0,a=r.length;o<a;o++)r[o].updateWorldMatrix(!1,!0,i)}}toJSON(e){const t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const s={};s.uuid=this.uuid,s.type=this.type,s.name=this.name,s.castShadow=this.castShadow,s.receiveShadow=this.receiveShadow,s.visible=this.visible,s.frustumCulled=this.frustumCulled,s.renderOrder=this.renderOrder,s.static=this.static,s.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(s.userData=this.userData),s.layers=this.layers.mask,s.matrix=this.matrix.toArray(),s.up=this.up.toArray(),this.pivot!==null&&(s.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(s.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(s.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(s.type="InstancedMesh",s.count=this.count,s.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(s.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(s.type="BatchedMesh",s.perObjectFrustumCulled=this.perObjectFrustumCulled,s.sortObjects=this.sortObjects,s.drawRanges=this._drawRanges,s.reservedRanges=this._reservedRanges,s.geometryInfo=this._geometryInfo.map(a=>({...a,boundingBox:a.boundingBox?a.boundingBox.toJSON():void 0,boundingSphere:a.boundingSphere?a.boundingSphere.toJSON():void 0})),s.instanceInfo=this._instanceInfo.map(a=>({...a})),s.availableInstanceIds=this._availableInstanceIds.slice(),s.availableGeometryIds=this._availableGeometryIds.slice(),s.nextIndexStart=this._nextIndexStart,s.nextVertexStart=this._nextVertexStart,s.geometryCount=this._geometryCount,s.maxInstanceCount=this._maxInstanceCount,s.maxVertexCount=this._maxVertexCount,s.maxIndexCount=this._maxIndexCount,s.geometryInitialized=this._geometryInitialized,s.matricesTexture=this._matricesTexture.toJSON(e),s.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(s.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(s.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(s.boundingBox=this.boundingBox.toJSON()));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?s.background=this.background.toJSON():this.background.isTexture&&(s.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(s.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){s.geometry=r(e.geometries,this.geometry);const a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){const c=a.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){const u=c[l];r(e.shapes,u)}else r(e.shapes,c)}}if(this.isSkinnedMesh&&(s.bindMode=this.bindMode,s.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),s.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(e.materials,this.material[c]));s.material=a}else s.material=r(e.materials,this.material);if(this.children.length>0){s.children=[];for(let a=0;a<this.children.length;a++)s.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){s.animations=[];for(let a=0;a<this.animations.length;a++){const c=this.animations[a];s.animations.push(r(e.animations,c))}}if(t){const a=o(e.geometries),c=o(e.materials),l=o(e.textures),h=o(e.images),u=o(e.shapes),f=o(e.skeletons),d=o(e.animations),p=o(e.nodes);a.length>0&&(i.geometries=a),c.length>0&&(i.materials=c),l.length>0&&(i.textures=l),h.length>0&&(i.images=h),u.length>0&&(i.shapes=u),f.length>0&&(i.skeletons=f),d.length>0&&(i.animations=d),p.length>0&&(i.nodes=p)}return i.object=s,i;function o(a){const c=[];for(const l in a){const h=a[l];delete h.metadata,c.push(h)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){const s=e.children[i];this.add(s.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}on.DEFAULT_UP=new z(0,1,0);on.DEFAULT_MATRIX_AUTO_UPDATE=!0;on.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Ot extends on{constructor(){super(),this.isGroup=!0,this.type="Group"}}const _M={type:"move"};class Sl{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Ot,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Ot,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new z,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new z),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Ot,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new z,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new z,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let s=null,r=null,o=null;const a=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){o=!0;for(const x of e.hand.values()){const m=t.getJointPose(x,i),g=this._getHandJoint(l,x);m!==null&&(g.matrix.fromArray(m.transform.matrix),g.matrix.decompose(g.position,g.quaternion,g.scale),g.matrixWorldNeedsUpdate=!0,g.jointRadius=m.radius),g.visible=m!==null}const h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],f=h.position.distanceTo(u.position),d=.02,p=.005;l.inputState.pinching&&f>d+p?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&f<=d-p&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,i),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.quaternion,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1,c.eventsEnabled&&c.dispatchEvent({type:"gripUpdated",data:e,target:this})));a!==null&&(s=t.getPose(e.targetRaySpace,i),s===null&&r!==null&&(s=r),s!==null&&(a.matrix.fromArray(s.transform.matrix),a.matrix.decompose(a.position,a.quaternion,a.scale),a.matrixWorldNeedsUpdate=!0,s.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(s.linearVelocity)):a.hasLinearVelocity=!1,s.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(s.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(_M)))}return a!==null&&(a.visible=s!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const i=new Ot;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}}const em={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Si={h:0,s:0,l:0},wo={h:0,s:0,l:0};function bl(n,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?n+(e-n)*6*t:t<1/2?e:t<2/3?n+(e-n)*6*(2/3-t):n}class Qe{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){const s=e;s&&s.isColor?this.copy(s):typeof s=="number"?this.setHex(s):typeof s=="string"&&this.setStyle(s)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=bn){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,qe.colorSpaceToWorking(this,t),this}setRGB(e,t,i,s=qe.workingColorSpace){return this.r=e,this.g=t,this.b=i,qe.colorSpaceToWorking(this,s),this}setHSL(e,t,i,s=qe.workingColorSpace){if(e=Th(e,1),t=Ye(t,0,1),i=Ye(i,0,1),t===0)this.r=this.g=this.b=i;else{const r=i<=.5?i*(1+t):i+t-i*t,o=2*i-r;this.r=bl(o,r,e+1/3),this.g=bl(o,r,e),this.b=bl(o,r,e-1/3)}return qe.colorSpaceToWorking(this,s),this}setStyle(e,t=bn){function i(r){r!==void 0&&parseFloat(r)<1&&De("Color: Alpha component of "+e+" will be ignored.")}let s;if(s=/^(\w+)\(([^\)]*)\)/.exec(e)){let r;const o=s[1],a=s[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(r[4]),this.setRGB(Math.min(100,parseFloat(r[1]))/100,Math.min(100,parseFloat(r[2]))/100,Math.min(100,parseFloat(r[3]))/100,t);break;case"hsl":case"hsla":if(r=/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*,\s*(\d+(?:\.\d+)?|\.\d+)\%\s*(?:,\s*(\d+(?:\.\d+)?|\.\d+)\s*)?$/.exec(a))return i(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:De("Color: Unknown color model "+e)}}else if(s=/^\#([A-Fa-f\d]+)$/.exec(e)){const r=s[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(r,16),t);De("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=bn){const i=em[e.toLowerCase()];return i!==void 0?this.setHex(i,t):De("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=mi(e.r),this.g=mi(e.g),this.b=mi(e.b),this}copyLinearToSRGB(e){return this.r=qs(e.r),this.g=qs(e.g),this.b=qs(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=bn){return qe.workingToColorSpace(Xt.copy(this),e),Math.round(Ye(Xt.r*255,0,255))*65536+Math.round(Ye(Xt.g*255,0,255))*256+Math.round(Ye(Xt.b*255,0,255))}getHexString(e=bn){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=qe.workingColorSpace){qe.workingToColorSpace(Xt.copy(this),t);const i=Xt.r,s=Xt.g,r=Xt.b,o=Math.max(i,s,r),a=Math.min(i,s,r);let c,l;const h=(a+o)/2;if(a===o)c=0,l=0;else{const u=o-a;switch(l=h<=.5?u/(o+a):u/(2-o-a),o){case i:c=(s-r)/u+(s<r?6:0);break;case s:c=(r-i)/u+2;break;case r:c=(i-s)/u+4;break}c/=6}return e.h=c,e.s=l,e.l=h,e}getRGB(e,t=qe.workingColorSpace){return qe.workingToColorSpace(Xt.copy(this),t),e.r=Xt.r,e.g=Xt.g,e.b=Xt.b,e}getStyle(e=bn){qe.workingToColorSpace(Xt.copy(this),e);const t=Xt.r,i=Xt.g,s=Xt.b;return e!==bn?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${s.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(s*255)})`}offsetHSL(e,t,i){return this.getHSL(Si),this.setHSL(Si.h+e,Si.s+t,Si.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(Si),e.getHSL(wo);const i=Ur(Si.h,wo.h,t),s=Ur(Si.s,wo.s,t),r=Ur(Si.l,wo.l,t);return this.setHSL(i,s,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,i=this.g,s=this.b,r=e.elements;return this.r=r[0]*t+r[3]*i+r[6]*s,this.g=r[1]*t+r[4]*i+r[7]*s,this.b=r[2]*t+r[5]*i+r[8]*s,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Xt=new Qe;Qe.NAMES=em;class Yc extends on{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new zi,this.environmentIntensity=1,this.environmentRotation=new zi,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),this.background=e.background!==null?e.background.clone():null,this.environment=e.environment!==null?e.environment.clone():null,this.fog=e.fog!==null?e.fog.clone():null,this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),this.overrideMaterial=e.overrideMaterial!==null?e.overrideMaterial.clone():null,this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}}const Pn=new z,ti=new z,wl=new z,ni=new z,Ps=new z,Ls=new z,gf=new z,El=new z,Al=new z,Tl=new z,Rl=new ct,Cl=new ct,Pl=new ct;class Dn{constructor(e=new z,t=new z,i=new z){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,s){s.subVectors(i,t),Pn.subVectors(e,t),s.cross(Pn);const r=s.lengthSq();return r>0?s.multiplyScalar(1/Math.sqrt(r)):s.set(0,0,0)}static getBarycoord(e,t,i,s,r){Pn.subVectors(s,t),ti.subVectors(i,t),wl.subVectors(e,t);const o=Pn.dot(Pn),a=Pn.dot(ti),c=Pn.dot(wl),l=ti.dot(ti),h=ti.dot(wl),u=o*l-a*a;if(u===0)return r.set(0,0,0),null;const f=1/u,d=(l*c-a*h)*f,p=(o*h-a*c)*f;return r.set(1-d-p,p,d)}static containsPoint(e,t,i,s){return this.getBarycoord(e,t,i,s,ni)===null?!1:ni.x>=0&&ni.y>=0&&ni.x+ni.y<=1}static getInterpolation(e,t,i,s,r,o,a,c){return this.getBarycoord(e,t,i,s,ni)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,ni.x),c.addScaledVector(o,ni.y),c.addScaledVector(a,ni.z),c)}static getInterpolatedAttribute(e,t,i,s,r,o){return Rl.setScalar(0),Cl.setScalar(0),Pl.setScalar(0),Rl.fromBufferAttribute(e,t),Cl.fromBufferAttribute(e,i),Pl.fromBufferAttribute(e,s),o.setScalar(0),o.addScaledVector(Rl,r.x),o.addScaledVector(Cl,r.y),o.addScaledVector(Pl,r.z),o}static isFrontFacing(e,t,i,s){return Pn.subVectors(i,t),ti.subVectors(e,t),Pn.cross(ti).dot(s)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,s){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[s]),this}setFromAttributeAndIndices(e,t,i,s){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,s),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Pn.subVectors(this.c,this.b),ti.subVectors(this.a,this.b),Pn.cross(ti).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return Dn.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return Dn.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,s,r){return Dn.getInterpolation(e,this.a,this.b,this.c,t,i,s,r)}containsPoint(e){return Dn.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return Dn.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const i=this.a,s=this.b,r=this.c;let o,a;Ps.subVectors(s,i),Ls.subVectors(r,i),El.subVectors(e,i);const c=Ps.dot(El),l=Ls.dot(El);if(c<=0&&l<=0)return t.copy(i);Al.subVectors(e,s);const h=Ps.dot(Al),u=Ls.dot(Al);if(h>=0&&u<=h)return t.copy(s);const f=c*u-h*l;if(f<=0&&c>=0&&h<=0&&c-h>0)return o=c/(c-h),t.copy(i).addScaledVector(Ps,o);Tl.subVectors(e,r);const d=Ps.dot(Tl),p=Ls.dot(Tl);if(p>=0&&d<=p)return t.copy(r);const x=d*l-c*p;if(x<=0&&l>=0&&p<=0)return a=l/(l-p),t.copy(i).addScaledVector(Ls,a);const m=h*p-d*u;if(m<=0&&u-h>=0&&d-p>=0)return gf.subVectors(r,s),a=(u-h)/(u-h+(d-p)),t.copy(s).addScaledVector(gf,a);const g=1/(m+x+f);return o=x*g,a=f*g,t.copy(i).addScaledVector(Ps,o).addScaledVector(Ls,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class xs{constructor(e=new z(1/0,1/0,1/0),t=new z(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(Ln.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(Ln.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const i=Ln.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const i=e.geometry;if(i!==void 0){const r=i.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0&&e.isBatchedMesh!==!0)for(let o=0,a=r.count;o<a;o++)e.isMesh===!0?e.getVertexPosition(o,Ln):Ln.fromBufferAttribute(r,o),Ln.applyMatrix4(e.matrixWorld),this.expandByPoint(Ln);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Eo.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),Eo.copy(i.boundingBox)),Eo.applyMatrix4(e.matrixWorld),this.union(Eo)}const s=e.children;for(let r=0,o=s.length;r<o;r++)this.expandByObject(s[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Ln),Ln.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(cr),Ao.subVectors(this.max,cr),Is.subVectors(e.a,cr),Ds.subVectors(e.b,cr),Ns.subVectors(e.c,cr),bi.subVectors(Ds,Is),wi.subVectors(Ns,Ds),Ki.subVectors(Is,Ns);let t=[0,-bi.z,bi.y,0,-wi.z,wi.y,0,-Ki.z,Ki.y,bi.z,0,-bi.x,wi.z,0,-wi.x,Ki.z,0,-Ki.x,-bi.y,bi.x,0,-wi.y,wi.x,0,-Ki.y,Ki.x,0];return!Ll(t,Is,Ds,Ns,Ao)||(t=[1,0,0,0,1,0,0,0,1],!Ll(t,Is,Ds,Ns,Ao))?!1:(To.crossVectors(bi,wi),t=[To.x,To.y,To.z],Ll(t,Is,Ds,Ns,Ao))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Ln).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Ln).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(ii[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),ii[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),ii[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),ii[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),ii[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),ii[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),ii[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),ii[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(ii),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const ii=[new z,new z,new z,new z,new z,new z,new z,new z],Ln=new z,Eo=new xs,Is=new z,Ds=new z,Ns=new z,bi=new z,wi=new z,Ki=new z,cr=new z,Ao=new z,To=new z,Zi=new z;function Ll(n,e,t,i,s){for(let r=0,o=n.length-3;r<=o;r+=3){Zi.fromArray(n,r);const a=s.x*Math.abs(Zi.x)+s.y*Math.abs(Zi.y)+s.z*Math.abs(Zi.z),c=e.dot(Zi),l=t.dot(Zi),h=i.dot(Zi);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>a)return!1}return!0}const St=new z,Ro=new ze;let xM=0;class Oi extends _s{constructor(e,t,i=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:xM++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=Bx,this.updateRanges=[],this.gpuType=wn,this.version=0,this._normalizationScale=e!==void 0?Rh(e):void 0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this._normalizationScale=e._normalizationScale,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let s=0,r=this.itemSize;s<r;s++)this.array[e+s]=t.array[i+s];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)Ro.fromBufferAttribute(this,t),Ro.applyMatrix3(e),this.setXY(t,Ro.x,Ro.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)St.fromBufferAttribute(this,t),St.applyMatrix3(e),this.setXYZ(t,St.x,St.y,St.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)St.fromBufferAttribute(this,t),St.applyMatrix4(e),this.setXYZ(t,St.x,St.y,St.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)St.fromBufferAttribute(this,t),St.applyNormalMatrix(e),this.setXYZ(t,St.x,St.y,St.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)St.fromBufferAttribute(this,t),St.transformDirection(e),this.setXYZ(t,St.x,St.y,St.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=this._denormalize(i)),i}setComponent(e,t,i){return this.normalized&&(i=this._normalize(i)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=this._denormalize(t)),t}setX(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=this._denormalize(t)),t}setY(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=this._denormalize(t)),t}setZ(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=this._denormalize(t)),t}setW(e,t){return this.normalized&&(t=this._normalize(t)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,s){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i),s=this._normalize(s)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=s,this}setXYZW(e,t,i,s,r){return e*=this.itemSize,this.normalized&&(t=this._normalize(t),i=this._normalize(i),s=this._normalize(s),r=this._normalize(r)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=s,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}_denormalize(e){const t=this._normalizationScale;return t!==void 0?Math.max(e/t,-1):Zp(e,this.array)}_normalize(e){const t=this._normalizationScale;return t!==void 0?Math.round(e*t):Jp(e,this.array)}}class tm extends Oi{constructor(e,t,i){super(new Uint16Array(e),t,i)}}class nm extends Oi{constructor(e,t,i){super(new Uint32Array(e),t,i)}}class Pt extends Oi{constructor(e,t,i){super(new Float32Array(e),t,i)}}const MM=new xs,hr=new z,Il=new z;class Hi{constructor(e=new z,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const i=this.center;t!==void 0?i.copy(t):MM.setFromPoints(e).getCenter(i);let s=0;for(let r=0,o=e.length;r<o;r++)s=Math.max(s,i.distanceToSquared(e[r]));return this.radius=Math.sqrt(s),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;hr.subVectors(e,this.center);const t=hr.lengthSq();if(t>this.radius*this.radius){const i=Math.sqrt(t),s=(i-this.radius)*.5;this.center.addScaledVector(hr,s/i),this.radius+=s}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Il.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(hr.copy(e.center).add(Il)),this.expandByPoint(hr.copy(e.center).sub(Il))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let yM=0;const xn=new Ve,Dl=new on,Fs=new z,cn=new xs,ur=new xs,Ut=new z;class An extends _s{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:yM++}),this.uuid=ir(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(zx(e)?nm:tm)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const i=this.attributes.normal;if(i!==void 0){const r=new Oe().getNormalMatrix(e);i.applyNormalMatrix(r),i.needsUpdate=!0}const s=this.attributes.tangent;return s!==void 0&&(s.transformDirection(e),s.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return xn.makeRotationFromQuaternion(e),this.applyMatrix4(xn),this}rotateX(e){return xn.makeRotationX(e),this.applyMatrix4(xn),this}rotateY(e){return xn.makeRotationY(e),this.applyMatrix4(xn),this}rotateZ(e){return xn.makeRotationZ(e),this.applyMatrix4(xn),this}translate(e,t,i){return xn.makeTranslation(e,t,i),this.applyMatrix4(xn),this}scale(e,t,i){return xn.makeScale(e,t,i),this.applyMatrix4(xn),this}lookAt(e){return Dl.lookAt(e),Dl.updateMatrix(),this.applyMatrix4(Dl.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Fs).negate(),this.translate(Fs.x,Fs.y,Fs.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const i=[];for(let s=0,r=e.length;s<r;s++){const o=e[s];i.push(o.x,o.y,o.z||0)}this.setAttribute("position",new Pt(i,3))}else{const i=Math.min(e.length,t.count);for(let s=0;s<i;s++){const r=e[s];t.setXYZ(s,r.x,r.y,r.z||0)}e.length>t.count&&De("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new xs);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){et("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new z(-1/0,-1/0,-1/0),new z(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,s=t.length;i<s;i++){const r=t[i];cn.setFromBufferAttribute(r),this.morphTargetsRelative?(Ut.addVectors(this.boundingBox.min,cn.min),this.boundingBox.expandByPoint(Ut),Ut.addVectors(this.boundingBox.max,cn.max),this.boundingBox.expandByPoint(Ut)):(this.boundingBox.expandByPoint(cn.min),this.boundingBox.expandByPoint(cn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&et('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Hi);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){et("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new z,1/0);return}if(e){const i=this.boundingSphere.center;if(cn.setFromBufferAttribute(e),t)for(let r=0,o=t.length;r<o;r++){const a=t[r];ur.setFromBufferAttribute(a),this.morphTargetsRelative?(Ut.addVectors(cn.min,ur.min),cn.expandByPoint(Ut),Ut.addVectors(cn.max,ur.max),cn.expandByPoint(Ut)):(cn.expandByPoint(ur.min),cn.expandByPoint(ur.max))}cn.getCenter(i);let s=0;for(let r=0,o=e.count;r<o;r++)Ut.fromBufferAttribute(e,r),s=Math.max(s,i.distanceToSquared(Ut));if(t)for(let r=0,o=t.length;r<o;r++){const a=t[r],c=this.morphTargetsRelative;for(let l=0,h=a.count;l<h;l++)Ut.fromBufferAttribute(a,l),c&&(Fs.fromBufferAttribute(e,l),Ut.add(Fs)),s=Math.max(s,i.distanceToSquared(Ut))}this.boundingSphere.radius=Math.sqrt(s),isNaN(this.boundingSphere.radius)&&et('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){et("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const i=t.position,s=t.normal,r=t.uv;let o=this.getAttribute("tangent");(o===void 0||o.count!==i.count)&&(o=new Oi(new Float32Array(4*i.count),4),this.setAttribute("tangent",o));const a=[],c=[],l=new Uint8Array(i.count);for(let R=0;R<i.count;R++)a[R]=new z,c[R]=new z;const h=new z,u=new z,f=new z,d=new ze,p=new ze,x=new ze,m=new z,g=new z;function M(R,C,L){l[R]=l[C]=l[L]=1,h.fromBufferAttribute(i,R),u.fromBufferAttribute(i,C),f.fromBufferAttribute(i,L),d.fromBufferAttribute(r,R),p.fromBufferAttribute(r,C),x.fromBufferAttribute(r,L),u.sub(h),f.sub(h),p.sub(d),x.sub(d);const D=1/(p.x*x.y-x.x*p.y);isFinite(D)&&(m.copy(u).multiplyScalar(x.y).addScaledVector(f,-p.y).multiplyScalar(D),g.copy(f).multiplyScalar(p.x).addScaledVector(u,-x.x).multiplyScalar(D),a[R].add(m),a[C].add(m),a[L].add(m),c[R].add(g),c[C].add(g),c[L].add(g))}let E=this.groups;E.length===0&&(E=[{start:0,count:e.count}]);for(let R=0,C=E.length;R<C;++R){const L=E[R],D=L.start,B=L.count;for(let A=D,F=D+B;A<F;A+=3)M(e.getX(A+0),e.getX(A+1),e.getX(A+2))}const y=new z,T=new z,b=new z,v=new z;function _(R){b.fromBufferAttribute(s,R),v.copy(b);const C=a[R];y.copy(C),y.sub(b.multiplyScalar(b.dot(C))).normalize(),T.crossVectors(v,C);const D=T.dot(c[R])<0?-1:1;o.setXYZW(R,y.x,y.y,y.z,D)}for(let R=0,C=i.count;R<C;++R)l[R]&&_(R);this._transformed=!0}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0||i.count!==t.count)i=new Oi(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let f=0,d=i.count;f<d;f++)i.setXYZ(f,0,0,0);const s=new z,r=new z,o=new z,a=new z,c=new z,l=new z,h=new z,u=new z;if(e)for(let f=0,d=e.count;f<d;f+=3){const p=e.getX(f+0),x=e.getX(f+1),m=e.getX(f+2);s.fromBufferAttribute(t,p),r.fromBufferAttribute(t,x),o.fromBufferAttribute(t,m),h.subVectors(o,r),u.subVectors(s,r),h.cross(u),a.fromBufferAttribute(i,p),c.fromBufferAttribute(i,x),l.fromBufferAttribute(i,m),a.add(h),c.add(h),l.add(h),i.setXYZ(p,a.x,a.y,a.z),i.setXYZ(x,c.x,c.y,c.z),i.setXYZ(m,l.x,l.y,l.z)}else for(let f=0,d=t.count;f<d;f+=3)s.fromBufferAttribute(t,f+0),r.fromBufferAttribute(t,f+1),o.fromBufferAttribute(t,f+2),h.subVectors(o,r),u.subVectors(s,r),h.cross(u),i.setXYZ(f+0,h.x,h.y,h.z),i.setXYZ(f+1,h.x,h.y,h.z),i.setXYZ(f+2,h.x,h.y,h.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)Ut.fromBufferAttribute(e,t),Ut.normalize(),e.setXYZ(t,Ut.x,Ut.y,Ut.z)}toNonIndexed(){function e(a,c){const l=a.array,h=a.itemSize,u=a.normalized,f=new l.constructor(c.length*h);let d=0,p=0;for(let x=0,m=c.length;x<m;x++){a.isInterleavedBufferAttribute?d=c[x]*a.data.stride+a.offset:d=c[x]*h;for(let g=0;g<h;g++)f[p++]=l[d++]}return new Oi(f,h,u)}if(this.index===null)return De("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new An,i=this.index.array,s=this.attributes;for(const a in s){const c=s[a],l=e(c,i);t.setAttribute(a,l)}const r=this.morphAttributes;for(const a in r){const c=[],l=r[a];for(let h=0,u=l.length;h<u;h++){const f=l[h],d=e(f,i);c.push(d)}t.morphAttributes[a]=c}t.morphTargetsRelative=this.morphTargetsRelative;const o=this.groups;for(let a=0,c=o.length;a<c;a++){const l=o[a];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const c=this.parameters;for(const l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const i=this.attributes;for(const c in i){const l=i[c];e.data.attributes[c]=l.toJSON(e.data)}const s={};let r=!1;for(const c in this.morphAttributes){const l=this.morphAttributes[c],h=[];for(let u=0,f=l.length;u<f;u++){const d=l[u];h.push(d.toJSON(e.data))}h.length>0&&(s[c]=h,r=!0)}r&&(e.data.morphAttributes=s,e.data.morphTargetsRelative=this.morphTargetsRelative);const o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));const a=this.boundingSphere;return a!==null&&(e.data.boundingSphere=a.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const i=e.index;i!==null&&this.setIndex(i.clone());const s=e.attributes;for(const l in s){const h=s[l];this.setAttribute(l,h.clone(t))}const r=e.morphAttributes;for(const l in r){const h=[],u=r[l];for(let f=0,d=u.length;f<d;f++)h.push(u[f].clone(t));this.morphAttributes[l]=h}this.morphTargetsRelative=e.morphTargetsRelative;const o=e.groups;for(let l=0,h=o.length;l<h;l++){const u=o[l];this.addGroup(u.start,u.count,u.materialIndex)}const a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());const c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Nl=new z,SM=new z,bM=new Oe;class Ri{constructor(e=new z(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,s){return this.normal.set(e,t,i),this.constant=s,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){const s=Nl.subVectors(i,t).cross(SM.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(s,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,i=!0){const s=e.delta(Nl),r=this.normal.dot(s);if(r===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const o=-(e.start.dot(this.normal)+this.constant)/r;return i===!0&&(o<0||o>1)?null:t.copy(e.start).addScaledVector(s,o)}intersectsLine(e){const t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const i=t||bM.getNormalMatrix(e),s=this.coplanarPoint(Nl).applyMatrix4(e),r=this.normal.applyMatrix3(i).normalize();return this.constant=-s.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}}let wM=0;class to extends _s{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:wM++}),this.uuid=ir(),this.name="",this.type="Material",this.blending=Nr,this.side=gs,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Rp,this.blendDst=Cp,this.blendEquation=Vs,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Qe(0,0,0),this.blendAlpha=0,this.depthFunc=Hr,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Dx,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=gl,this.stencilZFail=gl,this.stencilZPass=gl,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const i=e[t];if(i===void 0){De(`Material: parameter '${t}' has value of undefined.`);continue}const s=this[t];if(s===void 0){De(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}s&&s.isColor?s.set(i):s&&s.isVector2&&i&&i.isVector2||s&&s.isEuler&&i&&i.isEuler||s&&s.isVector3&&i&&i.isVector3?s.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,i.blending=this.blending,i.side=this.side,i.shadowSide=this.shadowSide,i.vertexColors=this.vertexColors,i.opacity=this.opacity,i.transparent=this.transparent,i.blendSrc=this.blendSrc,i.blendDst=this.blendDst,i.blendEquation=this.blendEquation,i.blendSrcAlpha=this.blendSrcAlpha,i.blendDstAlpha=this.blendDstAlpha,i.blendEquationAlpha=this.blendEquationAlpha,i.blendColor=this.blendColor.getHex(),i.blendAlpha=this.blendAlpha,i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,i.colorWrite=this.colorWrite,i.clipIntersection=this.clipIntersection,i.clipShadows=this.clipShadows,i.stencilWriteMask=this.stencilWriteMask,i.stencilFunc=this.stencilFunc,i.stencilRef=this.stencilRef,i.stencilFuncMask=this.stencilFuncMask,i.stencilFail=this.stencilFail,i.stencilZFail=this.stencilZFail,i.stencilZPass=this.stencilZPass,i.stencilWrite=this.stencilWrite,i.polygonOffset=this.polygonOffset,i.polygonOffsetFactor=this.polygonOffsetFactor,i.polygonOffsetUnits=this.polygonOffsetUnits,i.dithering=this.dithering,i.alphaTest=this.alphaTest,i.alphaHash=this.alphaHash,i.alphaToCoverage=this.alphaToCoverage,i.premultipliedAlpha=this.premultipliedAlpha,i.forceSinglePass=this.forceSinglePass,i.allowOverride=this.allowOverride,i.visible=this.visible,i.toneMapped=this.toneMapped,i.name=this.name,this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.diffuseRoughness!==void 0&&(i.diffuseRoughness=this.diffuseRoughness),this.diffuseRoughnessMap&&this.diffuseRoughnessMap.isTexture&&(i.diffuseRoughnessMap=this.diffuseRoughnessMap.toJSON(e).uuid),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(i.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessMinimum!==void 0&&(i.iridescenceThicknessMinimum=this.iridescenceThicknessMinimum),this.iridescenceThicknessMaximum!==void 0&&(i.iridescenceThicknessMaximum=this.iridescenceThicknessMaximum),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(i.clippingPlanes=this.clippingPlanes.map(r=>r.toJSON())),this.rotation!==void 0&&(i.rotation=this.rotation),this.depthPacking!==void 0&&(i.depthPacking=this.depthPacking),this.linewidth!==void 0&&(i.linewidth=this.linewidth),this.linecap!==void 0&&(i.linecap=this.linecap),this.linejoin!==void 0&&(i.linejoin=this.linejoin),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.wireframe!==void 0&&(i.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(i.flatShading=this.flatShading),this.fog!==void 0&&(i.fog=this.fog),Object.keys(this.userData).length>0&&(i.userData=this.userData);function s(r){const o=[];for(const a in r){const c=r[a];delete c.metadata,o.push(c)}return o}if(t){const r=s(e.textures),o=s(e.images);r.length>0&&(i.textures=r),o.length>0&&(i.images=o)}return i}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Qe().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.diffuseRoughness!==void 0&&(this.diffuseRoughness=e.diffuseRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessMinimum!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessMinimum),e.iridescenceThicknessMaximum!==void 0&&(this.iridescenceThicknessMaximum=e.iridescenceThicknessMaximum),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessMinimum=e.iridescenceThicknessRange[0],this.iridescenceThicknessMaximum=e.iridescenceThicknessRange[1]),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(i=>new Ri().fromJSON(i))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let i=e.normalScale;Array.isArray(i)===!1&&(i=[i,i]),this.normalScale=new ze().fromArray(i)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new ze().fromArray(e.clearcoatNormalScale)),e.diffuseRoughnessMap!==void 0&&(this.diffuseRoughnessMap=t[e.diffuseRoughnessMap]||null),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let i=null;if(t!==null){const s=t.length;i=new Array(s);for(let r=0;r!==s;++r)i[r]=t[r].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}const si=new z,Fl=new z,Co=new z,Po=new z;class im{constructor(e=new z,t=new z(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,si)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=si.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(si.copy(this.origin).addScaledVector(this.direction,t),si.distanceToSquared(e))}distanceSqToSegment(e,t,i,s){Fl.copy(e).add(t).multiplyScalar(.5),Co.copy(t).sub(e).normalize(),Po.copy(this.origin).sub(Fl);const r=e.distanceTo(t)*.5,o=-this.direction.dot(Co),a=Po.dot(this.direction),c=-Po.dot(Co),l=Po.lengthSq(),h=Math.abs(1-o*o);let u,f,d,p;if(h>0)if(u=o*c-a,f=o*a-c,p=r*h,u>=0)if(f>=-p)if(f<=p){const x=1/h;u*=x,f*=x,d=u*(u+o*f+2*a)+f*(o*u+f+2*c)+l}else f=r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;else f=-r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;else f<=-p?(u=Math.max(0,-(-o*r+a)),f=u>0?-r:Math.min(Math.max(-r,-c),r),d=-u*u+f*(f+2*c)+l):f<=p?(u=0,f=Math.min(Math.max(-r,-c),r),d=f*(f+2*c)+l):(u=Math.max(0,-(o*r+a)),f=u>0?r:Math.min(Math.max(-r,-c),r),d=-u*u+f*(f+2*c)+l);else f=o>0?-r:r,u=Math.max(0,-(o*f+a)),d=-u*u+f*(f+2*c)+l;return i&&i.copy(this.origin).addScaledVector(this.direction,u),s&&s.copy(Fl).addScaledVector(Co,f),d}intersectSphere(e,t){if(e.radius<0)return null;si.subVectors(e.center,this.origin);const i=si.dot(this.direction),s=si.dot(si)-i*i,r=e.radius*e.radius;if(s>r)return null;const o=Math.sqrt(r-s),a=i-o,c=i+o;return c<0?null:a<0?this.at(c,t):this.at(a,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){const i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,s,r,o,a,c;const l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,f=this.origin;return l>=0?(i=(e.min.x-f.x)*l,s=(e.max.x-f.x)*l):(i=(e.max.x-f.x)*l,s=(e.min.x-f.x)*l),h>=0?(r=(e.min.y-f.y)*h,o=(e.max.y-f.y)*h):(r=(e.max.y-f.y)*h,o=(e.min.y-f.y)*h),i>o||r>s||((r>i||isNaN(i))&&(i=r),(o<s||isNaN(s))&&(s=o),u>=0?(a=(e.min.z-f.z)*u,c=(e.max.z-f.z)*u):(a=(e.max.z-f.z)*u,c=(e.min.z-f.z)*u),i>c||a>s)||((a>i||i!==i)&&(i=a),(c<s||s!==s)&&(s=c),s<0)?null:this.at(i>=0?i:s,t)}intersectsBox(e){return this.intersectBox(e,si)!==null}intersectTriangle(e,t,i,s,r){const o=this.origin,a=this.direction,c=a.x,l=a.y,h=a.z,u=e.x-o.x,f=e.y-o.y,d=e.z-o.z,p=t.x-o.x,x=t.y-o.y,m=t.z-o.z,g=i.x-o.x,M=i.y-o.y,E=i.z-o.z,y=Math.abs(c),T=Math.abs(l),b=Math.abs(h);let v,_,R,C,L,D,B,A,F,O,N,q;if(y>=T&&y>=b?(R=c,D=u,F=p,q=g,c>=0?(v=l,_=h,C=f,L=d,B=x,A=m,O=M,N=E):(v=h,_=l,C=d,L=f,B=m,A=x,O=E,N=M)):T>=b?(R=l,D=f,F=x,q=M,l>=0?(v=h,_=c,C=d,L=u,B=m,A=p,O=E,N=g):(v=c,_=h,C=u,L=d,B=p,A=m,O=g,N=E)):(R=h,D=d,F=m,q=E,h>=0?(v=c,_=l,C=u,L=f,B=p,A=x,O=g,N=M):(v=l,_=c,C=f,L=u,B=x,A=p,O=M,N=g)),R===0)return null;const V=v/R,X=_/R,j=1/R,de=C-V*D,Re=L-X*D,K=B-V*F,fe=A-X*F,Me=O-V*q,Ce=N-X*q,me=Me*fe-Ce*K,Ne=de*Ce-Re*Me,ut=K*Re-fe*de;if(s){if(me<0||Ne<0||ut<0)return null}else if((me<0||Ne<0||ut<0)&&(me>0||Ne>0||ut>0))return null;const $=me+Ne+ut;if($===0)return null;const xe=j*(me*D+Ne*F+ut*q);return($>0?xe<0:xe>0)?null:this.at(xe/$,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class EM extends to{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Qe(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new zi,this.combine=Pp,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const vf=new Ve,Ji=new im,Lo=new Hi,_f=new z,Io=new z,Do=new z,No=new z,Ul=new z,Fo=new z,xf=new z,Uo=new z;class Ht extends on{constructor(e=new An,t=new EM){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){const s=t[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(e,t){const i=this.geometry,s=i.attributes.position,r=i.morphAttributes.position,o=i.morphTargetsRelative;t.fromBufferAttribute(s,e);const a=this.morphTargetInfluences;if(r&&a){Fo.set(0,0,0);for(let c=0,l=r.length;c<l;c++){const h=a[c],u=r[c];h!==0&&(Ul.fromBufferAttribute(u,e),o?Fo.addScaledVector(Ul,h):Fo.addScaledVector(Ul.sub(t),h))}t.add(Fo)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const i=this.geometry,s=this.material,r=this.matrixWorld;s!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),Lo.copy(i.boundingSphere),Lo.applyMatrix4(r),Ji.copy(e.ray).recast(e.near),!(Lo.containsPoint(Ji.origin)===!1&&(Ji.intersectSphere(Lo,_f)===null||Ji.origin.distanceToSquared(_f)>(e.far-e.near)**2))&&(vf.copy(r).invert(),Ji.copy(e.ray).applyMatrix4(vf),!(i.boundingBox!==null&&Ji.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,Ji)))}_computeIntersections(e,t,i){let s;const r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,f=r.groups,d=r.drawRange;if(a!==null)if(Array.isArray(o))for(let p=0,x=f.length;p<x;p++){const m=f[p],g=o[m.materialIndex],M=Math.max(m.start,d.start),E=Math.min(a.count,Math.min(m.start+m.count,d.start+d.count));for(let y=M,T=E;y<T;y+=3){const b=a.getX(y),v=a.getX(y+1),_=a.getX(y+2);s=Oo(this,g,e,i,l,h,u,b,v,_),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const p=Math.max(0,d.start),x=Math.min(a.count,d.start+d.count);for(let m=p,g=x;m<g;m+=3){const M=a.getX(m),E=a.getX(m+1),y=a.getX(m+2);s=Oo(this,o,e,i,l,h,u,M,E,y),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}else if(c!==void 0)if(Array.isArray(o))for(let p=0,x=f.length;p<x;p++){const m=f[p],g=o[m.materialIndex],M=Math.max(m.start,d.start),E=Math.min(c.count,Math.min(m.start+m.count,d.start+d.count));for(let y=M,T=E;y<T;y+=3){const b=y,v=y+1,_=y+2;s=Oo(this,g,e,i,l,h,u,b,v,_),s&&(s.faceIndex=Math.floor(y/3),s.face.materialIndex=m.materialIndex,t.push(s))}}else{const p=Math.max(0,d.start),x=Math.min(c.count,d.start+d.count);for(let m=p,g=x;m<g;m+=3){const M=m,E=m+1,y=m+2;s=Oo(this,o,e,i,l,h,u,M,E,y),s&&(s.faceIndex=Math.floor(m/3),t.push(s))}}}}function AM(n,e,t,i,s,r,o,a){let c;if(e.side===kt?c=i.intersectTriangle(o,r,s,!0,a):c=i.intersectTriangle(s,r,o,e.side===gs,a),c===null)return null;Uo.copy(a),Uo.applyMatrix4(n.matrixWorld);const l=t.ray.origin.distanceTo(Uo);return l<t.near||l>t.far?null:{distance:l,point:Uo.clone(),object:n}}function Oo(n,e,t,i,s,r,o,a,c,l){n.getVertexPosition(a,Io),n.getVertexPosition(c,Do),n.getVertexPosition(l,No);const h=AM(n,e,t,i,Io,Do,No,xf);if(h){const u=new z;Dn.getBarycoord(xf,Io,Do,No,u),s&&(h.uv=Dn.getInterpolatedAttribute(s,a,c,l,u,new ze)),r&&(h.uv1=Dn.getInterpolatedAttribute(r,a,c,l,u,new ze)),o&&(h.normal=Dn.getInterpolatedAttribute(o,a,c,l,u,new z),h.normal.dot(i.direction)>0&&h.normal.multiplyScalar(-1));const f={a,b:c,c:l,normal:new z,materialIndex:0};Dn.getNormal(Io,Do,No,f.normal),h.face=f,h.barycoord=u}return h}class Ia extends en{constructor(e=null,t=1,i=1,s,r,o,a,c,l=_t,h=_t,u,f){super(null,o,a,c,l,h,s,r,u,f),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class qr extends Oi{constructor(e,t,i,s=1){super(e,t,i),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=s}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){const e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}}const Us=new Ve,Mf=new Ve,ko=[],yf=new xs,TM=new Ve,fr=new Ht,dr=new Hi;class Yr extends Ht{constructor(e,t,i){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new qr(new Float32Array(i*16),16),this.instanceColor=null,this.morphTexture=null,this.count=i,this.boundingBox=null,this.boundingSphere=null;for(let s=0;s<i;s++)this.setMatrixAt(s,TM)}computeBoundingBox(){const e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new xs),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,Us),yf.copy(e.boundingBox).applyMatrix4(Us),this.boundingBox.union(yf)}computeBoundingSphere(){const e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new Hi),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let i=0;i<t;i++)this.getMatrixAt(i,Us),dr.copy(e.boundingSphere).applyMatrix4(Us),this.boundingSphere.union(dr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),this.morphTexture=e.morphTexture!==null?e.morphTexture.clone():null,this.instanceColor=e.instanceColor!==null?e.instanceColor.clone():null,this.count=e.count,this.boundingBox=e.boundingBox!==null?e.boundingBox.clone():null,this.boundingSphere=e.boundingSphere!==null?e.boundingSphere.clone():null,this}getColorAt(e,t){return this.instanceColor===null?t.setRGB(1,1,1):t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){return t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){const i=t.morphTargetInfluences,s=this.morphTexture.source.data.data,r=i.length+1,o=e*r+1;for(let a=0;a<i.length;a++)i[a]=s[o+a]}raycast(e,t){const i=this.matrixWorld,s=this.count;if(fr.geometry=this.geometry,fr.material=this.material,fr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),dr.copy(this.boundingSphere),dr.applyMatrix4(i),e.ray.intersectsSphere(dr)!==!1))for(let r=0;r<s;r++){this.getMatrixAt(r,Us),Mf.multiplyMatrices(i,Us),fr.matrixWorld=Mf,fr.raycast(e,ko);for(let o=0,a=ko.length;o<a;o++){const c=ko[o];c.instanceId=r,c.object=this,t.push(c)}ko.length=0}}setColorAt(e,t){return this.instanceColor===null&&(this.instanceColor=new qr(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3),this}setMatrixAt(e,t){return t.toArray(this.instanceMatrix.array,e*16),this}setMorphAt(e,t){const i=t.morphTargetInfluences,s=i.length+1;this.morphTexture===null&&(this.morphTexture=new Ia(new Float32Array(s*this.count),s,this.count,bh,wn));const r=this.morphTexture.source.data.data;let o=0;for(let l=0;l<i.length;l++)o+=i[l];const a=this.geometry.morphTargetsRelative?1:1-o,c=s*e;return r[c]=a,r.set(i,c+1),this}updateMorphTargets(){}dispose(){super.dispose(),this.instanceMatrix.dispose(),this.instanceColor!==null&&this.instanceColor.dispose(),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}}const Qi=new Hi,RM=new ze(.5,.5),Bo=new z;class wa{constructor(e=new Ri,t=new Ri,i=new Ri,s=new Ri,r=new Ri,o=new Ri){this.planes=[e,t,i,s,r,o]}set(e,t,i,s,r,o){const a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(i),a[3].copy(s),a[4].copy(r),a[5].copy(o),this}copy(e){const t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=Fn,i=!1){const s=this.planes,r=e.elements,o=r[0],a=r[1],c=r[2],l=r[3],h=r[4],u=r[5],f=r[6],d=r[7],p=r[8],x=r[9],m=r[10],g=r[11],M=r[12],E=r[13],y=r[14],T=r[15];if(s[0].setComponents(l-o,d-h,g-p,T-M).normalize(),s[1].setComponents(l+o,d+h,g+p,T+M).normalize(),s[2].setComponents(l+a,d+u,g+x,T+E).normalize(),s[3].setComponents(l-a,d-u,g-x,T-E).normalize(),i)s[4].setComponents(c,f,m,y).normalize(),s[5].setComponents(l-c,d-f,g-m,T-y).normalize();else if(s[4].setComponents(l-c,d-f,g-m,T-y).normalize(),t===Fn)s[5].setComponents(l+c,d+f,g+m,T+y).normalize();else if(t===Sa)s[5].setComponents(c,f,m,y).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),Qi.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),Qi.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(Qi)}intersectsSprite(e){Qi.center.set(0,0,0);const t=RM.distanceTo(e.center);return Qi.radius=.7071067811865476+t,Qi.applyMatrix4(e.matrixWorld),this.intersectsSphere(Qi)}intersectsSphere(e){const t=this.planes,i=e.center,s=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(i)<s)return!1;return!0}intersectsBox(e){const t=this.planes;for(let i=0;i<6;i++){const s=t[i];if(Bo.x=s.normal.x>0?e.max.x:e.min.x,Bo.y=s.normal.y>0?e.max.y:e.min.y,Bo.z=s.normal.z>0?e.max.z:e.min.z,s.distanceToPoint(Bo)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}const Sf=new Ve;class Ph{constructor(){this.coordinateSystem=Fn,this._frustums=[],this._count=0}setFromArrayCamera(e){const t=e.cameras,i=this._frustums;for(let s=0;s<t.length;s++){const r=t[s];Sf.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse),i[s]===void 0&&(i[s]=new wa),i[s].setFromProjectionMatrix(Sf,r.coordinateSystem,r.reversedDepth)}return this._count=t.length,this}getFrustum(e){return this._frustums[e]}intersectsObject(e){const t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsObject(e))return!0;return!1}intersectsSprite(e){const t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsSprite(e))return!0;return!1}intersectsSphere(e){const t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsSphere(e))return!0;return!1}intersectsBox(e){const t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].intersectsBox(e))return!0;return!1}containsPoint(e){const t=this._frustums;for(let i=0;i<this._count;i++)if(t[i].containsPoint(e))return!0;return!1}copy(e){this.coordinateSystem=e.coordinateSystem;const t=this._frustums,i=e._frustums;for(let s=0;s<e._count;s++)t[s]===void 0&&(t[s]=new wa),t[s].copy(i[s]);return this._count=e._count,this}clone(){return new Ph().copy(this)}}class CM extends to{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new Qe(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}const bf=new Ve,Kc=new im,zo=new Hi,Go=new z;class sm extends on{constructor(e=new An,t=new CM){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0?this.morphTargetInfluences=e.morphTargetInfluences.slice():this.morphTargetInfluences=void 0,e.morphTargetDictionary!==void 0?this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary):this.morphTargetDictionary=void 0,this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const i=this.geometry,s=this.matrixWorld,r=e.params.Points.threshold,o=i.drawRange;if(i.boundingSphere===null&&i.computeBoundingSphere(),zo.copy(i.boundingSphere),zo.applyMatrix4(s),zo.radius+=r,e.ray.intersectsSphere(zo)===!1)return;bf.copy(s).invert(),Kc.copy(e.ray).applyMatrix4(bf);const a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=i.index,u=i.attributes.position;if(l!==null){const f=Math.max(0,o.start),d=Math.min(l.count,o.start+o.count);for(let p=f,x=d;p<x;p++){const m=l.getX(p);Go.fromBufferAttribute(u,m),wf(Go,m,c,s,e,t,this)}}else{const f=Math.max(0,o.start),d=Math.min(u.count,o.start+o.count);for(let p=f,x=d;p<x;p++)Go.fromBufferAttribute(u,p),wf(Go,p,c,s,e,t,this)}}updateMorphTargets(){const t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){const s=t[i[0]];if(s!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=s.length;r<o;r++){const a=s[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}}function wf(n,e,t,i,s,r,o){const a=Kc.distanceSqToPoint(n);if(a<t){const c=new z;Kc.closestPointToPoint(n,c),c.applyMatrix4(i);const l=s.ray.origin.distanceTo(c);if(l<s.near||l>s.far)return;r.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:e,face:null,faceIndex:null,barycoord:null,object:o})}}class rm extends en{constructor(e=[],t=Js,i,s,r,o,a,c,l,h){super(e,t,i,s,r,o,a,c,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class js extends en{constructor(e,t,i=Zn,s,r,o,a=_t,c=_t,l,h=Bi,u=1){if(h!==Bi&&h!==Di)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const f={width:e,height:t,depth:u};super(f,s,r,o,a,c,h,i,l),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new Ch(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}}class om extends js{constructor(e,t=Zn,i=Js,s,r,o=_t,a=_t,c,l=Bi){const h={width:e,height:e,depth:1},u=[h,h,h,h,h,h];super(e,e,t,i,s,r,o,a,c,l),this.image=u,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class am extends en{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class Vi extends An{constructor(e=1,t=1,i=1,s=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:s,heightSegments:r,depthSegments:o};const a=this;s=Math.floor(s),r=Math.floor(r),o=Math.floor(o);const c=[],l=[],h=[],u=[];let f=0,d=0;p("z","y","x",-1,-1,i,t,e,o,r,0),p("z","y","x",1,-1,i,t,-e,o,r,1),p("x","z","y",1,1,e,i,t,s,o,2),p("x","z","y",1,-1,e,i,-t,s,o,3),p("x","y","z",1,-1,e,t,i,s,r,4),p("x","y","z",-1,-1,e,t,-i,s,r,5),this.setIndex(c),this.setAttribute("position",new Pt(l,3)),this.setAttribute("normal",new Pt(h,3)),this.setAttribute("uv",new Pt(u,2));function p(x,m,g,M,E,y,T,b,v,_,R){const C=y/v,L=T/_,D=y/2,B=T/2,A=b/2,F=v+1,O=_+1;let N=0,q=0;const V=new z;for(let X=0;X<O;X++){const j=X*L-B;for(let de=0;de<F;de++){const Re=de*C-D;V[x]=Re*M,V[m]=j*E,V[g]=A,l.push(V.x,V.y,V.z),V[x]=0,V[m]=0,V[g]=b>0?1:-1,h.push(V.x,V.y,V.z),u.push(de/v),u.push(1-X/_),N+=1}}for(let X=0;X<_;X++)for(let j=0;j<v;j++){const de=f+j+F*X,Re=f+j+F*(X+1),K=f+(j+1)+F*(X+1),fe=f+(j+1)+F*X;c.push(de,Re,fe),c.push(Re,K,fe),q+=6}a.addGroup(d,q,R),d+=q,f+=N}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Vi(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class Da extends An{constructor(e=[],t=[],i=1,s=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:i,detail:s};const r=[],o=[];a(s),l(i),h(),this.setAttribute("position",new Pt(r,3)),this.setAttribute("normal",new Pt(r.slice(),3)),this.setAttribute("uv",new Pt(o,2)),s===0?this.computeVertexNormals():this.normalizeNormals();function a(M){const E=new z,y=new z,T=new z;for(let b=0;b<t.length;b+=3)d(t[b+0],E),d(t[b+1],y),d(t[b+2],T),c(E,y,T,M)}function c(M,E,y,T){const b=T+1,v=[];for(let _=0;_<=b;_++){v[_]=[];const R=M.clone().lerp(y,_/b),C=E.clone().lerp(y,_/b),L=b-_;for(let D=0;D<=L;D++)D===0&&_===b?v[_][D]=R:v[_][D]=R.clone().lerp(C,D/L)}for(let _=0;_<b;_++)for(let R=0;R<2*(b-_)-1;R++){const C=Math.floor(R/2);R%2===0?(f(v[_][C+1]),f(v[_+1][C]),f(v[_][C])):(f(v[_][C+1]),f(v[_+1][C+1]),f(v[_+1][C]))}}function l(M){const E=new z;for(let y=0;y<r.length;y+=3)E.x=r[y+0],E.y=r[y+1],E.z=r[y+2],E.normalize().multiplyScalar(M),r[y+0]=E.x,r[y+1]=E.y,r[y+2]=E.z}function h(){const M=new z;for(let E=0;E<r.length;E+=3){M.x=r[E+0],M.y=r[E+1],M.z=r[E+2];const y=m(M)/2/Math.PI+.5,T=g(M)/Math.PI+.5;o.push(y,1-T)}p(),u()}function u(){for(let M=0;M<o.length;M+=6){const E=o[M+0],y=o[M+2],T=o[M+4],b=Math.max(E,y,T),v=Math.min(E,y,T);b>.9&&v<.1&&(E<.2&&(o[M+0]+=1),y<.2&&(o[M+2]+=1),T<.2&&(o[M+4]+=1))}}function f(M){r.push(M.x,M.y,M.z)}function d(M,E){const y=M*3;E.x=e[y+0],E.y=e[y+1],E.z=e[y+2]}function p(){const M=new z,E=new z,y=new z,T=new z,b=new ze,v=new ze,_=new ze;for(let R=0,C=0;R<r.length;R+=9,C+=6){M.set(r[R+0],r[R+1],r[R+2]),E.set(r[R+3],r[R+4],r[R+5]),y.set(r[R+6],r[R+7],r[R+8]),b.set(o[C+0],o[C+1]),v.set(o[C+2],o[C+3]),_.set(o[C+4],o[C+5]),T.copy(M).add(E).add(y).divideScalar(3);const L=m(T);x(b,C+0,M,L),x(v,C+2,E,L),x(_,C+4,y,L)}}function x(M,E,y,T){T<0&&M.x===1&&(o[E]=M.x-1),y.x===0&&y.z===0&&(o[E]=T/2/Math.PI+.5)}function m(M){return Math.atan2(M.z,-M.x)}function g(M){return Math.atan2(-M.y,Math.sqrt(M.x*M.x+M.z*M.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Da(e.vertices,e.indices,e.radius,e.detail)}}class Na extends Da{constructor(e=1,t=0){const i=(1+Math.sqrt(5))/2,s=[-1,i,0,1,i,0,-1,-i,0,1,-i,0,0,-1,i,0,1,i,0,-1,-i,0,1,-i,i,0,-1,i,0,1,-i,0,-1,-i,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(s,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Na(e.radius,e.detail)}}class Lh extends Da{constructor(e=1,t=0){const i=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],s=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(i,s,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new Lh(e.radius,e.detail)}}class no extends An{constructor(e=1,t=1,i=1,s=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:s};const r=e/2,o=t/2,a=Math.floor(i),c=Math.floor(s),l=a+1,h=c+1,u=e/a,f=t/c,d=[],p=[],x=[],m=[];for(let g=0;g<h;g++){const M=g*f-o;for(let E=0;E<l;E++){const y=E*u-r;p.push(y,-M,0),x.push(0,0,1),m.push(E/a),m.push(1-g/c)}}for(let g=0;g<c;g++)for(let M=0;M<a;M++){const E=M+l*g,y=M+l*(g+1),T=M+1+l*(g+1),b=M+1+l*g;d.push(E,y,b),d.push(y,T,b)}this.setIndex(d),this.setAttribute("position",new Pt(p,3)),this.setAttribute("normal",new Pt(x,3)),this.setAttribute("uv",new Pt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new no(e.width,e.height,e.widthSegments,e.heightSegments)}}class io extends An{constructor(e=1,t=32,i=16,s=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:i,phiStart:s,phiLength:r,thetaStart:o,thetaLength:a},t=Math.max(3,Math.floor(t)),i=Math.max(2,Math.floor(i));const c=Math.min(o+a,Math.PI);let l=0;const h=[],u=new z,f=new z,d=[],p=[],x=[],m=[];for(let g=0;g<=i;g++){const M=[],E=g/i,y=o+E*a,T=e*Math.cos(y),b=Math.sqrt(e*e-T*T);let v=0;g===0&&o===0?v=.5/t:g===i&&c===Math.PI&&(v=-.5/t);for(let _=0;_<=t;_++){const R=_/t,C=s+R*r;u.x=-b*Math.cos(C),u.y=T,u.z=b*Math.sin(C),p.push(u.x,u.y,u.z),f.copy(u).normalize(),x.push(f.x,f.y,f.z),m.push(R+v,1-E),M.push(l++)}h.push(M)}for(let g=0;g<i;g++)for(let M=0;M<t;M++){const E=h[g][M+1],y=h[g][M],T=h[g+1][M],b=h[g+1][M+1];(g!==0||o>0)&&d.push(E,y,b),(g!==i-1||c<Math.PI)&&d.push(y,T,b)}this.setIndex(d),this.setAttribute("position",new Pt(p,3)),this.setAttribute("normal",new Pt(x,3)),this.setAttribute("uv",new Pt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new io(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}function er(n){const e={};for(const t in n){e[t]={};for(const i in n[t]){const s=n[t][i];if(Ef(s))s.isRenderTargetTexture?(De("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=s.clone();else if(Array.isArray(s))if(Ef(s[0])){const r=[];for(let o=0,a=s.length;o<a;o++)r[o]=s[o].clone();e[t][i]=r}else e[t][i]=s.slice();else e[t][i]=s}}return e}function Qt(n){const e={};for(let t=0;t<n.length;t++){const i=er(n[t]);for(const s in i)e[s]=i[s]}return e}function Ef(n){return n&&(n.isColor||n.isMatrix3||n.isMatrix4||n.isVector2||n.isVector3||n.isVector4||n.isTexture||n.isQuaternion)}function PM(n){const e=[];for(let t=0;t<n.length;t++)e.push(n[t].clone());return e}function lm(n){const e=n.getRenderTarget();return e===null?n.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:qe.workingColorSpace}const LM={clone:er,merge:Qt};var IM=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,DM=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class an extends to{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=IM,this.fragmentShader=DM,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=er(e.uniforms),this.uniformsGroups=PM(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const s in this.uniforms){const o=this.uniforms[s].value;o&&o.isTexture?t.uniforms[s]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[s]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[s]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[s]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[s]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[s]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[s]={type:"m4",value:o.toArray()}:t.uniforms[s]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const i={};for(const s in this.extensions)this.extensions[s]===!0&&(i[s]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(const i in e.uniforms){const s=e.uniforms[i];switch(this.uniforms[i]={},s.type){case"t":this.uniforms[i].value=t[s.value]||null;break;case"c":this.uniforms[i].value=new Qe().setHex(s.value);break;case"v2":this.uniforms[i].value=new ze().fromArray(s.value);break;case"v3":this.uniforms[i].value=new z().fromArray(s.value);break;case"v4":this.uniforms[i].value=new ct().fromArray(s.value);break;case"m3":this.uniforms[i].value=new Oe().fromArray(s.value);break;case"m4":this.uniforms[i].value=new Ve().fromArray(s.value);break;default:this.uniforms[i].value=s.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(const i in e.extensions)this.extensions[i]=e.extensions[i];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}}class NM extends an{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class FM extends to{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Lx,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class UM extends to{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}const Ho=new z,Vo=new Qn,zn=new z;class cm extends on{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Ve,this.projectionMatrix=new Ve,this.projectionMatrixInverse=new Ve,this.coordinateSystem=Fn,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(Ho,Vo,zn),zn.x===1&&zn.y===1&&zn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ho,Vo,zn.set(1,1,1)).invert()}updateWorldMatrix(e,t,i=!1){super.updateWorldMatrix(e,t,i),this.matrixWorld.decompose(Ho,Vo,zn),zn.x===1&&zn.y===1&&zn.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(Ho,Vo,zn.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}}const Ei=new z,Af=new ze,Tf=new ze;class In extends cm{constructor(e=50,t=1,i=.1,s=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=s,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Xr*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(Fr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Xr*2*Math.atan(Math.tan(Fr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){Ei.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Ei.x,Ei.y).multiplyScalar(-e/Ei.z),Ei.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(Ei.x,Ei.y).multiplyScalar(-e/Ei.z)}getViewSize(e,t){return this.getViewBounds(e,Af,Tf),t.subVectors(Tf,Af)}setViewOffset(e,t,i,s,r,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(Fr*.5*this.fov)/this.zoom,i=2*t,s=this.aspect*i,r=-.5*s;const o=this.view;if(this.view!==null&&this.view.enabled){const c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*s/c,t-=o.offsetY*i/l,s*=o.width/c,i*=o.height/l}const a=this.filmOffset;a!==0&&(r+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+s,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class hm extends cm{constructor(e=-1,t=1,i=1,s=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=s,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,s,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=s,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,s=(this.top+this.bottom)/2;let r=i-e,o=i+e,a=s+t,c=s-t;if(this.view!==null&&this.view.enabled){const l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=h*this.view.offsetY,c=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}const Os=-90,ks=1;class Zc extends on{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;const s=new In(Os,ks,e,t);s.layers=this.layers,this.add(s);const r=new In(Os,ks,e,t);r.layers=this.layers,this.add(r);const o=new In(Os,ks,e,t);o.layers=this.layers,this.add(o);const a=new In(Os,ks,e,t);a.layers=this.layers,this.add(a);const c=new In(Os,ks,e,t);c.layers=this.layers,this.add(c);const l=new In(Os,ks,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[i,s,r,o,a,c]=t;for(const l of t)this.remove(l);if(e===Fn)i.up.set(0,1,0),i.lookAt(1,0,0),s.up.set(0,1,0),s.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===Sa)i.up.set(0,-1,0),i.lookAt(-1,0,0),s.up.set(0,-1,0),s.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:i,activeMipmapLevel:s}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[r,o,a,c,l,h]=this.children,u=e.getRenderTarget(),f=e.getActiveCubeFace(),d=e.getActiveMipmapLevel(),p=e.xr.enabled;e.xr.enabled=!1;const x=i.texture.mipmapsAutoUpdate;i.texture.mipmapsAutoUpdate=!1;let m=!1;e.isWebGLRenderer===!0?m=e.state.buffers.depth.getReversed():m=e.reversedDepthBuffer,e.setRenderTarget(i,0,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,r),e.setRenderTarget(i,1,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(i,2,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(i,3,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),e.setRenderTarget(i,4,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),i.texture.mipmapsAutoUpdate=x,e.setRenderTarget(i,5,s),m&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(u,f,d),e.xr.enabled=p,i.texture.needsPMREMUpdate=!0}}class OM extends In{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e,this.perCameraFrustumCulled=!1}}function Rf(n,e,t,i){const s=kM(i);switch(t){case Vp:return n*e;case bh:return n*e/s.components*s.byteLength;case wh:return n*e/s.components*s.byteLength;case vs:return n*e*2/s.components*s.byteLength;case Eh:return n*e*2/s.components*s.byteLength;case Wp:return n*e*3/s.components*s.byteLength;case En:return n*e*4/s.components*s.byteLength;case Ah:return n*e*4/s.components*s.byteLength;case jo:case ea:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case ta:case na:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case xc:case yc:return Math.max(n,16)*Math.max(e,8)/4;case _c:case Mc:return Math.max(n,8)*Math.max(e,8)/2;case Sc:case bc:case Ec:case Ac:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*8;case wc:case xa:case Tc:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Rc:return Math.floor((n+3)/4)*Math.floor((e+3)/4)*16;case Cc:return Math.floor((n+4)/5)*Math.floor((e+3)/4)*16;case Pc:return Math.floor((n+4)/5)*Math.floor((e+4)/5)*16;case Lc:return Math.floor((n+5)/6)*Math.floor((e+4)/5)*16;case Ic:return Math.floor((n+5)/6)*Math.floor((e+5)/6)*16;case Dc:return Math.floor((n+7)/8)*Math.floor((e+4)/5)*16;case Nc:return Math.floor((n+7)/8)*Math.floor((e+5)/6)*16;case Fc:return Math.floor((n+7)/8)*Math.floor((e+7)/8)*16;case Uc:return Math.floor((n+9)/10)*Math.floor((e+4)/5)*16;case Oc:return Math.floor((n+9)/10)*Math.floor((e+5)/6)*16;case kc:return Math.floor((n+9)/10)*Math.floor((e+7)/8)*16;case Bc:return Math.floor((n+9)/10)*Math.floor((e+9)/10)*16;case zc:return Math.floor((n+11)/12)*Math.floor((e+9)/10)*16;case Gc:return Math.floor((n+11)/12)*Math.floor((e+11)/12)*16;case Hc:case Vc:case Wc:return Math.ceil(n/4)*Math.ceil(e/4)*16;case $c:case Xc:return Math.ceil(n/4)*Math.ceil(e/4)*8;case Ma:case qc:return Math.ceil(n/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function kM(n){switch(n){case fn:case Bp:return{byteLength:1,components:1};case Wr:case zp:case Jn:return{byteLength:2,components:1};case yh:case Sh:return{byteLength:2,components:4};case Zn:case Mh:case wn:return{byteLength:4,components:1};case Gp:case Hp:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${n}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:xh}}));typeof window<"u"&&(window.__THREE__?De("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=xh);function um(){let n=null,e=!1,t=null,i=null;function s(r,o){i=n.requestAnimationFrame(s),t(r,o)}return{start:function(){e!==!0&&t!==null&&n!==null&&(i=n.requestAnimationFrame(s),e=!0)},stop:function(){n!==null&&n.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){n=r}}}function BM(n){const e=new WeakMap;function t(a,c){const l=a.array,h=a.usage,u=l.byteLength,f=n.createBuffer();n.bindBuffer(c,f),n.bufferData(c,l,h),a.onUploadCallback();let d;if(l instanceof Float32Array)d=n.FLOAT;else if(typeof Float16Array<"u"&&l instanceof Float16Array)d=n.HALF_FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?d=n.HALF_FLOAT:d=n.UNSIGNED_SHORT;else if(l instanceof Int16Array)d=n.SHORT;else if(l instanceof Uint32Array)d=n.UNSIGNED_INT;else if(l instanceof Int32Array)d=n.INT;else if(l instanceof Int8Array)d=n.BYTE;else if(l instanceof Uint8Array)d=n.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)d=n.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:f,type:d,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:u}}function i(a,c,l){const h=c.array,u=c.updateRanges;if(n.bindBuffer(l,a),u.length===0)n.bufferSubData(l,0,h);else{u.sort((d,p)=>d.start-p.start);let f=0;for(let d=1;d<u.length;d++){const p=u[f],x=u[d];x.start<=p.start+p.count+1?p.count=Math.max(p.count,x.start+x.count-p.start):(++f,u[f]=x)}u.length=f+1;for(let d=0,p=u.length;d<p;d++){const x=u[d];n.bufferSubData(l,x.start*h.BYTES_PER_ELEMENT,h,x.start,x.count)}c.clearUpdateRanges()}c.onUploadCallback()}function s(a){return a.isInterleavedBufferAttribute&&(a=a.data),e.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);const c=e.get(a);c&&(n.deleteBuffer(c.buffer),e.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){const h=e.get(a);(!h||h.version<a.version)&&e.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}const l=e.get(a);if(l===void 0)e.set(a,t(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(l.buffer,a,c),l.version=a.version}}return{get:s,remove:r,update:o}}var zM=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,GM=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,HM=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,VM=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,WM=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,$M=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,XM=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,qM=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,YM=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,KM=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,ZM=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,JM=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,QM=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,jM=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,ey=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,ty=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,ny=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,iy=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,sy=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,ry=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,oy=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,ay=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,ly=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,cy=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,hy=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,uy=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,fy=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,dy=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,py=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,my="gl_FragColor = linearToOutputTexel( gl_FragColor );",gy=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,vy=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,_y=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	uniform samplerCube envMap;
	#ifdef ENVMAP_TYPE_PMREM
		float roughnessToMip( const in float roughness ) {
			float r = clamp( roughness, 0.0, 1.0 );
			return ENVMAP_MAX_LOD * r * ( 2.0 - r );
		}
	#endif
#endif`,xy=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,My=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,yy=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Sy=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,by=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,wy=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Ey=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Ay=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Ty=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,Ry=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Cy=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Py=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,Ly=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * worldNormal, ENVMAP_MAX_LOD );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_PMREM
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureLod( envMap, envMapRotation * reflectVec, roughnessToMip( roughness ) );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureLod( envMap, envMapRotation * retroVec, roughnessToMip( roughness ) );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_PMREM
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_PMREM
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,Iy=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Dy=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Ny=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Fy=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Uy=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.045 );
material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef USE_DIFFUSE_ROUGHNESS
	float diffuseRoughnessFactor = diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		diffuseRoughnessFactor *= texture2D( diffuseRoughnessMap, vDiffuseRoughnessMapUv ).r;
	#endif
	material.diffuseRoughness = saturate( diffuseRoughnessFactor );
#endif
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.045 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Oy=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float diffuseRoughness;
	#endif
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
#ifdef USE_DIFFUSE_ROUGHNESS
	const float EON_EPSILON = 1e-7;
	float FON_DirectionalAlbedo( const in float mu, const in float roughness, const in float A ) {
		float muComp = 1.0 - mu;
		float gOverPi = muComp * ( 0.0571085289 + muComp * ( 0.491881867 + muComp * ( - 0.332181442 + muComp * 0.0714429953 ) ) );
		return A * ( 1.0 + roughness * gOverPi );
	}
	vec3 BRDF_EON( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 diffuseColor, const in float roughness ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return BRDF_Lambert( rho );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float s = dot( lightDir, viewDir ) - dotNL * dotNV;
		float sOverT = ( s > 0.0 ) ? s / max( max( dotNL, dotNV ), EON_EPSILON ) : s;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		vec3 singleScatter = rho * RECIPROCAL_PI * A * ( 1.0 + roughness * sOverT );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		float albedoV = FON_DirectionalAlbedo( dotNV, roughness, A );
		float albedoL = FON_DirectionalAlbedo( dotNL, roughness, A );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		vec3 multiScatter = rhoMultiScatter * RECIPROCAL_PI
			* max( EON_EPSILON, 1.0 - albedoV )
			* max( EON_EPSILON, 1.0 - albedoL )
			/ max( EON_EPSILON, 1.0 - averageAlbedo );
		return singleScatter + multiScatter;
	}
	vec3 EON_DirectionalAlbedo( const in vec3 diffuseColor, const in float roughness, const in float dotNV ) {
		vec3 rho = saturate( diffuseColor );
		if ( roughness <= EON_EPSILON ) return rho;
		float A = 1.0 / ( 1.0 + ( 0.5 - 2.0 / ( 3.0 * PI ) ) * roughness );
		float directionalAlbedo = FON_DirectionalAlbedo( dotNV, roughness, A );
		float averageAlbedo = A * ( 1.0 + ( 2.0 / 3.0 - 28.0 / ( 15.0 * PI ) ) * roughness );
		vec3 rhoMultiScatter = rho * rho * averageAlbedo / max( vec3( EON_EPSILON ), vec3( 1.0 ) - rho * ( 1.0 - averageAlbedo ) );
		return rho * directionalAlbedo + rhoMultiScatter * ( 1.0 - directionalAlbedo );
	}
#endif
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = max( material.clearcoatRoughness, 0.045 );
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = max( material.roughness, 0.045 );
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float alphaT = max( material.alphaT, alpha );
		float V = V_GGX_SmithCorrelated_Anisotropic( alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		vec3 diffuseBRDF = BRDF_EON( directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor, material.diffuseRoughness ) * ( 1.0 - material.metalness );
	#else
		vec3 diffuseBRDF = BRDF_Lambert( material.diffuseContribution );
	#endif
	reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuseAlbedo = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness );
		vec3 diffuse = irradiance * RECIPROCAL_PI * diffuseAlbedo * ( 1.0 - singleScattering - multiScattering );
	#else
		vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#endif
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	#ifdef USE_DIFFUSE_ROUGHNESS
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		vec3 diffuse = EON_DirectionalAlbedo( material.diffuseColor, material.diffuseRoughness, dotNV ) * ( 1.0 - material.metalness ) * ( 1.0 - totalScatteringDielectric );
	#else
		vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	#endif
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,ky=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_LIGHT_PROBE_GRIDS > 0
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		int probeGrid = - 1;
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( isInsideLightProbeGrid( probeWorldPos, probeWorldNormal, probesMin[ i ], probesMax[ i ], probesResolution[ i ] ) ) probeGrid = UNROLLED_LOOP_INDEX;
		}
		#pragma unroll_loop_end
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_LIGHT_PROBE_GRIDS; i ++ ) {
			if ( probeGrid == UNROLLED_LOOP_INDEX ) irradiance += getLightProbeGridIrradiance( probesSH[ i ], probesMin[ i ], probesMax[ i ], probesResolution[ i ], probeWorldPos, probeWorldNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,By=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_PMREM )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,zy=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Gy=`#if NUM_LIGHT_PROBE_GRIDS > 0
uniform highp sampler3D probesSH[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMin[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesMax[ NUM_LIGHT_PROBE_GRIDS ];
uniform vec3 probesResolution[ NUM_LIGHT_PROBE_GRIDS ];
bool isInsideLightProbeGrid( vec3 worldPos, vec3 worldNormal, vec3 probesMin, vec3 probesMax, vec3 probesResolution ) {
	vec3 spacing = ( probesMax - probesMin ) / probesResolution;
	vec3 samplePos = worldPos + worldNormal * spacing * 0.5;
	vec3 margin = spacing * 0.01;
	return all( greaterThanEqual( samplePos, probesMin - margin ) ) && all( lessThanEqual( samplePos, probesMax + margin ) );
}
vec3 getLightProbeGridIrradiance( highp sampler3D probesSH, vec3 probesMin, vec3 probesMax, vec3 probesResolution, vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 probeSpacing = gridRange / res;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.5 / res, 1.0 - 0.5 / res );
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,Hy=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Vy=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Wy=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,$y=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Xy=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,qy=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Yy=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Ky=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Zy=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Jy=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Qy=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,jy=`#if defined( USE_MORPHCOLORS )
	#if defined( USE_COLOR_ALPHA )
		vColor *= morphTargetBaseInfluence;
	#elif defined( USE_COLOR )
		vColor.rgb *= morphTargetBaseInfluence;
	#endif
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor.rgb += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,eS=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,tS=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,nS=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,iS=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,sS=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,rS=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,oS=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,aS=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,lS=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,cS=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,hS=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,uS=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,fS=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,dS=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,pS=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,mS=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,gS=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,vS=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,_S=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,xS=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,MS=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,yS=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				vec2 radius = shadowRadius * texelSize;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float lightDistance = length( lightToPosition );
			float depthRange = shadowCameraFar - shadowCameraNear;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float depthA = - shadowCameraNear / depthRange - shadowBias;
				float depthB = shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#else
				float depthA = shadowCameraFar / depthRange + shadowBias;
				float depthB = - shadowCameraNear * shadowCameraFar / ( depthRange * lightDistance );
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			shadow = 0.0;
			for ( int i = 0; i < 5; i ++ ) {
				vec2 offset = vogelDiskSample( i, 5, phi );
				vec3 direction = bd3D + ( tangent * offset.x + bitangent * offset.y ) * texelSize;
				vec3 absDirection = abs( direction );
				float dp = depthA + depthB / max( max( absDirection.x, absDirection.y ), absDirection.z );
				shadow += texture( shadowMap, vec4( direction, dp ) );
			}
			shadow *= 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,SS=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,bS=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,wS=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,ES=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,AS=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,TS=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,RS=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,CS=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,PS=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,LS=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,IS=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,DS=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,NS=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,FS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,US=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	uniform mat3 diffuseRoughnessMapTransform;
	varying vec2 vDiffuseRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,OS=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DIFFUSE_ROUGHNESSMAP
	vDiffuseRoughnessMapUv = ( diffuseRoughnessMapTransform * vec3( DIFFUSE_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,kS=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const BS=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,zS=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,GS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,HS=`uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <envmap_common_pars_fragment>
void main() {
	#ifdef ENVMAP_TYPE_PMREM
		vec4 texColor = textureLod( envMap, backgroundRotation * vWorldDirection, roughnessToMip( backgroundBlurriness ) );
	#else
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,VS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,WS=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,$S=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,XS=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,qS=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,YS=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,KS=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,ZS=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,JS=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,QS=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,jS=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,eb=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,tb=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,nb=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,ib=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,sb=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,rb=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,ob=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,ab=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,lb=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,cb=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,hb=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DIFFUSE_ROUGHNESS
	uniform float diffuseRoughness;
	#ifdef USE_DIFFUSE_ROUGHNESSMAP
		uniform sampler2D diffuseRoughnessMap;
	#endif
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,ub=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,fb=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,db=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,pb=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,mb=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,gb=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,vb=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,_b=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,He={alphahash_fragment:zM,alphahash_pars_fragment:GM,alphamap_fragment:HM,alphamap_pars_fragment:VM,alphatest_fragment:WM,alphatest_pars_fragment:$M,aomap_fragment:XM,aomap_pars_fragment:qM,batching_pars_vertex:YM,batching_vertex:KM,begin_vertex:ZM,beginnormal_vertex:JM,bsdfs:QM,iridescence_fragment:jM,bumpmap_pars_fragment:ey,clipping_planes_fragment:ty,clipping_planes_pars_fragment:ny,clipping_planes_pars_vertex:iy,clipping_planes_vertex:sy,color_fragment:ry,color_pars_fragment:oy,color_pars_vertex:ay,color_vertex:ly,common:cy,defaultnormal_vertex:hy,displacementmap_pars_vertex:uy,displacementmap_vertex:fy,emissivemap_fragment:dy,emissivemap_pars_fragment:py,colorspace_fragment:my,colorspace_pars_fragment:gy,envmap_fragment:vy,envmap_common_pars_fragment:_y,envmap_pars_fragment:xy,envmap_pars_vertex:My,envmap_physical_pars_fragment:Ly,envmap_vertex:yy,fog_vertex:Sy,fog_pars_vertex:by,fog_fragment:wy,fog_pars_fragment:Ey,gradientmap_pars_fragment:Ay,lightmap_pars_fragment:Ty,lights_lambert_fragment:Ry,lights_lambert_pars_fragment:Cy,lights_pars_begin:Py,lights_toon_fragment:Iy,lights_toon_pars_fragment:Dy,lights_phong_fragment:Ny,lights_phong_pars_fragment:Fy,lights_physical_fragment:Uy,lights_physical_pars_fragment:Oy,lights_fragment_begin:ky,lights_fragment_maps:By,lights_fragment_end:zy,lightprobes_pars_fragment:Gy,logdepthbuf_fragment:Hy,logdepthbuf_pars_fragment:Vy,logdepthbuf_pars_vertex:Wy,logdepthbuf_vertex:$y,map_fragment:Xy,map_pars_fragment:qy,map_particle_fragment:Yy,map_particle_pars_fragment:Ky,metalnessmap_fragment:Zy,metalnessmap_pars_fragment:Jy,morphinstance_vertex:Qy,morphcolor_vertex:jy,morphnormal_vertex:eS,morphtarget_pars_vertex:tS,morphtarget_vertex:nS,normal_fragment_begin:iS,normal_fragment_maps:sS,normal_pars_fragment:rS,normal_pars_vertex:oS,normal_vertex:aS,normalmap_pars_fragment:lS,clearcoat_normal_fragment_begin:cS,clearcoat_normal_fragment_maps:hS,clearcoat_pars_fragment:uS,iridescence_pars_fragment:fS,opaque_fragment:dS,packing:pS,premultiplied_alpha_fragment:mS,project_vertex:gS,dithering_fragment:vS,dithering_pars_fragment:_S,roughnessmap_fragment:xS,roughnessmap_pars_fragment:MS,shadowmap_pars_fragment:yS,shadowmap_pars_vertex:SS,shadowmap_vertex:bS,shadowmask_pars_fragment:wS,skinbase_vertex:ES,skinning_pars_vertex:AS,skinning_vertex:TS,skinnormal_vertex:RS,specularmap_fragment:CS,specularmap_pars_fragment:PS,tonemapping_fragment:LS,tonemapping_pars_fragment:IS,transmission_fragment:DS,transmission_pars_fragment:NS,uv_pars_fragment:FS,uv_pars_vertex:US,uv_vertex:OS,worldpos_vertex:kS,background_vert:BS,background_frag:zS,backgroundCube_vert:GS,backgroundCube_frag:HS,cube_vert:VS,cube_frag:WS,depth_vert:$S,depth_frag:XS,distance_vert:qS,distance_frag:YS,equirect_vert:KS,equirect_frag:ZS,linedashed_vert:JS,linedashed_frag:QS,meshbasic_vert:jS,meshbasic_frag:eb,meshlambert_vert:tb,meshlambert_frag:nb,meshmatcap_vert:ib,meshmatcap_frag:sb,meshnormal_vert:rb,meshnormal_frag:ob,meshphong_vert:ab,meshphong_frag:lb,meshphysical_vert:cb,meshphysical_frag:hb,meshtoon_vert:ub,meshtoon_frag:fb,points_vert:db,points_frag:pb,shadow_vert:mb,shadow_frag:gb,sprite_vert:vb,sprite_frag:_b},ve={common:{diffuse:{value:new Qe(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Oe},alphaMap:{value:null},alphaMapTransform:{value:new Oe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Oe}},envmap:{envMap:{value:null},envMapRotation:{value:new Oe},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Oe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Oe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Oe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Oe},normalScale:{value:new ze(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Oe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Oe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Oe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Oe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Qe(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:[]},probesMin:{value:[]},probesMax:{value:[]},probesResolution:{value:[]}},points:{diffuse:{value:new Qe(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Oe},alphaTest:{value:0},uvTransform:{value:new Oe}},sprite:{diffuse:{value:new Qe(16777215)},opacity:{value:1},center:{value:new ze(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Oe},alphaMap:{value:null},alphaMapTransform:{value:new Oe},alphaTest:{value:0}}},Wn={basic:{uniforms:Qt([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.fog]),vertexShader:He.meshbasic_vert,fragmentShader:He.meshbasic_frag},lambert:{uniforms:Qt([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,ve.lights,{emissive:{value:new Qe(0)},envMapIntensity:{value:1}}]),vertexShader:He.meshlambert_vert,fragmentShader:He.meshlambert_frag},phong:{uniforms:Qt([ve.common,ve.specularmap,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,ve.lights,{emissive:{value:new Qe(0)},specular:{value:new Qe(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:He.meshphong_vert,fragmentShader:He.meshphong_frag},standard:{uniforms:Qt([ve.common,ve.envmap,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.roughnessmap,ve.metalnessmap,ve.fog,ve.lights,{emissive:{value:new Qe(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:He.meshphysical_vert,fragmentShader:He.meshphysical_frag},toon:{uniforms:Qt([ve.common,ve.aomap,ve.lightmap,ve.emissivemap,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.gradientmap,ve.fog,ve.lights,{emissive:{value:new Qe(0)}}]),vertexShader:He.meshtoon_vert,fragmentShader:He.meshtoon_frag},matcap:{uniforms:Qt([ve.common,ve.bumpmap,ve.normalmap,ve.displacementmap,ve.fog,{matcap:{value:null}}]),vertexShader:He.meshmatcap_vert,fragmentShader:He.meshmatcap_frag},points:{uniforms:Qt([ve.points,ve.fog]),vertexShader:He.points_vert,fragmentShader:He.points_frag},dashed:{uniforms:Qt([ve.common,ve.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:He.linedashed_vert,fragmentShader:He.linedashed_frag},depth:{uniforms:Qt([ve.common,ve.displacementmap]),vertexShader:He.depth_vert,fragmentShader:He.depth_frag},normal:{uniforms:Qt([ve.common,ve.bumpmap,ve.normalmap,ve.displacementmap,{opacity:{value:1}}]),vertexShader:He.meshnormal_vert,fragmentShader:He.meshnormal_frag},sprite:{uniforms:Qt([ve.sprite,ve.fog]),vertexShader:He.sprite_vert,fragmentShader:He.sprite_frag},background:{uniforms:{uvTransform:{value:new Oe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:He.background_vert,fragmentShader:He.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Oe}},vertexShader:He.backgroundCube_vert,fragmentShader:He.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:He.cube_vert,fragmentShader:He.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:He.equirect_vert,fragmentShader:He.equirect_frag},distance:{uniforms:Qt([ve.common,ve.displacementmap,{referencePosition:{value:new z},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:He.distance_vert,fragmentShader:He.distance_frag},shadow:{uniforms:Qt([ve.lights,ve.fog,{color:{value:new Qe(0)},opacity:{value:1}}]),vertexShader:He.shadow_vert,fragmentShader:He.shadow_frag}};Wn.physical={uniforms:Qt([Wn.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Oe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Oe},clearcoatNormalScale:{value:new ze(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Oe},diffuseRoughness:{value:0},diffuseRoughnessMap:{value:null},diffuseRoughnessMapTransform:{value:new Oe},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Oe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Oe},sheen:{value:0},sheenColor:{value:new Qe(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Oe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Oe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Oe},transmissionSamplerSize:{value:new ze},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Oe},attenuationDistance:{value:0},attenuationColor:{value:new Qe(0)},specularColor:{value:new Qe(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Oe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Oe},anisotropyVector:{value:new ze},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Oe}}]),vertexShader:He.meshphysical_vert,fragmentShader:He.meshphysical_frag};const Wo={r:0,b:0,g:0},xb=new Ve,fm=new Oe;fm.set(-1,0,0,0,1,0,0,0,1);function Mb(n,e,t,i,s,r){const o=new Qe(0);let a=s===!0?0:1,c,l,h=null,u=0,f=null;function d(M){let E=M.isScene===!0?M.background:null;if(E&&E.isTexture){const y=M.backgroundBlurriness>0;E=e.get(E,y)}return E}function p(M){let E=!1;const y=d(M);y===null?m(o,a):y&&y.isColor&&(m(y,1),E=!0);const T=n.xr.getEnvironmentBlendMode();T==="additive"?t.buffers.color.setClear(0,0,0,1,r):T==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,r),(n.autoClear||E)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),n.clear(n.autoClearColor,n.autoClearDepth,n.autoClearStencil))}function x(M,E){const y=d(E);y&&y.isCubeTexture?(l===void 0&&(l=new Ht(new Vi(1,1,1),new an({name:"BackgroundCubeMaterial",uniforms:er(Wn.backgroundCube.uniforms),vertexShader:Wn.backgroundCube.vertexShader,fragmentShader:Wn.backgroundCube.fragmentShader,side:kt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),l.geometry.deleteAttribute("uv"),l.onBeforeRender=function(T,b,v){this.matrixWorld.copyPosition(v.matrixWorld)},Object.defineProperty(l.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(l)),l.material.uniforms.envMap.value=y,l.material.uniforms.backgroundBlurriness.value=E.backgroundBlurriness,l.material.uniforms.backgroundIntensity.value=E.backgroundIntensity,l.material.uniforms.backgroundRotation.value.setFromMatrix4(xb.makeRotationFromEuler(E.backgroundRotation)).transpose(),y.isRenderTargetTexture===!1&&l.material.uniforms.backgroundRotation.value.premultiply(fm),l.material.toneMapped=qe.getTransfer(y.colorSpace)!==st,(h!==y||u!==y.version||f!==n.toneMapping)&&(l.material.needsUpdate=!0,h=y,u=y.version,f=n.toneMapping),l.layers.enableAll(),M.unshift(l,l.geometry,l.material,0,0,null)):y&&y.isTexture&&(c===void 0&&(c=new Ht(new no(2,2),new an({name:"BackgroundMaterial",uniforms:er(Wn.background.uniforms),vertexShader:Wn.background.vertexShader,fragmentShader:Wn.background.fragmentShader,side:gs,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),Object.defineProperty(c.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(c)),c.material.uniforms.t2D.value=y,c.material.uniforms.backgroundIntensity.value=E.backgroundIntensity,c.material.toneMapped=qe.getTransfer(y.colorSpace)!==st,y.matrixAutoUpdate===!0&&y.updateMatrix(),c.material.uniforms.uvTransform.value.copy(y.matrix),(h!==y||u!==y.version||f!==n.toneMapping)&&(c.material.needsUpdate=!0,h=y,u=y.version,f=n.toneMapping),c.layers.enableAll(),M.unshift(c,c.geometry,c.material,0,0,null))}function m(M,E){M.getRGB(Wo,lm(n)),t.buffers.color.setClear(Wo.r,Wo.g,Wo.b,E,r)}function g(){l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0),c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0)}return{getClearColor:function(){return o},setClearColor:function(M,E=1){o.set(M),a=E,m(o,a)},getClearAlpha:function(){return a},setClearAlpha:function(M){a=M,m(o,a)},render:p,addToRenderList:x,dispose:g}}function yb(n,e){const t=n.getParameter(n.MAX_VERTEX_ATTRIBS),i={},s=f(null);let r=s,o=!1;function a(L,D,B,A,F){let O=!1;const N=u(L,A,B,D);r!==N&&(r=N,l(r.object)),O=d(L,A,B,F),O&&p(L,A,B,F),F!==null&&e.update(F,n.ELEMENT_ARRAY_BUFFER),(O||o)&&(o=!1,y(L,D,B,A),F!==null&&n.bindBuffer(n.ELEMENT_ARRAY_BUFFER,e.get(F).buffer))}function c(){return n.createVertexArray()}function l(L){return n.bindVertexArray(L)}function h(L){return n.deleteVertexArray(L)}function u(L,D,B,A){const F=A.wireframe===!0;let O=i[D.id];O===void 0&&(O={},i[D.id]=O);const N=L.isInstancedMesh===!0?L.id:0;let q=O[N];q===void 0&&(q={},O[N]=q);let V=q[B.id];V===void 0&&(V={},q[B.id]=V);let X=V[F];return X===void 0&&(X=f(c()),V[F]=X),X}function f(L){const D=[],B=[],A=[];for(let F=0;F<t;F++)D[F]=0,B[F]=0,A[F]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:D,enabledAttributes:B,attributeDivisors:A,object:L,attributes:{},index:null}}function d(L,D,B,A){const F=r.attributes,O=D.attributes;let N=0;const q=B.getAttributes();for(const V in q)if(q[V].location>=0){const j=F[V];let de=O[V];if(de===void 0&&(V==="instanceMatrix"&&L.instanceMatrix&&(de=L.instanceMatrix),V==="instanceColor"&&L.instanceColor&&(de=L.instanceColor)),j===void 0||j.attribute!==de||de&&j.data!==de.data)return!0;N++}return r.attributesNum!==N||r.index!==A}function p(L,D,B,A){const F={},O=D.attributes;let N=0;const q=B.getAttributes();for(const V in q)if(q[V].location>=0){let j=O[V];j===void 0&&(V==="instanceMatrix"&&L.instanceMatrix&&(j=L.instanceMatrix),V==="instanceColor"&&L.instanceColor&&(j=L.instanceColor));const de={};de.attribute=j,j&&j.data&&(de.data=j.data),F[V]=de,N++}r.attributes=F,r.attributesNum=N,r.index=A}function x(){const L=r.newAttributes;for(let D=0,B=L.length;D<B;D++)L[D]=0}function m(L){g(L,0)}function g(L,D){const B=r.newAttributes,A=r.enabledAttributes,F=r.attributeDivisors;B[L]=1,A[L]===0&&(n.enableVertexAttribArray(L),A[L]=1),F[L]!==D&&(n.vertexAttribDivisor(L,D),F[L]=D)}function M(){const L=r.newAttributes,D=r.enabledAttributes;for(let B=0,A=D.length;B<A;B++)D[B]!==L[B]&&(n.disableVertexAttribArray(B),D[B]=0)}function E(L,D,B,A,F,O,N){N===!0?n.vertexAttribIPointer(L,D,B,F,O):n.vertexAttribPointer(L,D,B,A,F,O)}function y(L,D,B,A){x();const F=A.attributes,O=B.getAttributes(),N=D.defaultAttributeValues;for(const q in O){const V=O[q];if(V.location>=0){let X=F[q];if(X===void 0&&(q==="instanceMatrix"&&L.instanceMatrix&&(X=L.instanceMatrix),q==="instanceColor"&&L.instanceColor&&(X=L.instanceColor)),X!==void 0){const j=X.normalized,de=X.itemSize,Re=e.get(X);if(Re===void 0)continue;const K=Re.buffer,fe=Re.type,Me=Re.bytesPerElement,Ce=fe===n.INT||fe===n.UNSIGNED_INT||X.gpuType===Mh;if(X.isInterleavedBufferAttribute){const me=X.data,Ne=me.isInterleavedBuffer===!0?me.stride:me.itemSize,ut=X.offset;if(me.isInstancedInterleavedBuffer||me.isInstancedBufferAttribute){for(let $=0;$<V.locationSize;$++)g(V.location+$,me.meshPerAttribute);L.isInstancedMesh!==!0&&A._maxInstanceCount===void 0&&(A._maxInstanceCount=me.meshPerAttribute*me.count)}else for(let $=0;$<V.locationSize;$++)m(V.location+$);n.bindBuffer(n.ARRAY_BUFFER,K);for(let $=0;$<V.locationSize;$++)E(V.location+$,de/V.locationSize,fe,j,Ne*Me,(ut+de/V.locationSize*$)*Me,Ce)}else{if(X.isInstancedBufferAttribute){for(let me=0;me<V.locationSize;me++)g(V.location+me,X.meshPerAttribute);L.isInstancedMesh!==!0&&A._maxInstanceCount===void 0&&(A._maxInstanceCount=X.meshPerAttribute*X.count)}else for(let me=0;me<V.locationSize;me++)m(V.location+me);n.bindBuffer(n.ARRAY_BUFFER,K);for(let me=0;me<V.locationSize;me++)E(V.location+me,de/V.locationSize,fe,j,de*Me,de/V.locationSize*me*Me,Ce)}}else if(N!==void 0){const j=N[q];if(j!==void 0)switch(j.length){case 2:n.vertexAttrib2fv(V.location,j);break;case 3:n.vertexAttrib3fv(V.location,j);break;case 4:n.vertexAttrib4fv(V.location,j);break;default:n.vertexAttrib1fv(V.location,j)}}}}M()}function T(){R();for(const L in i){const D=i[L];for(const B in D){const A=D[B];for(const F in A){const O=A[F];for(const N in O)h(O[N].object),delete O[N];delete A[F]}}delete i[L]}}function b(L){if(i[L.id]===void 0)return;const D=i[L.id];for(const B in D){const A=D[B];for(const F in A){const O=A[F];for(const N in O)h(O[N].object),delete O[N];delete A[F]}}delete i[L.id]}function v(L){for(const D in i){const B=i[D];for(const A in B){const F=B[A];if(F[L.id]===void 0)continue;const O=F[L.id];for(const N in O)h(O[N].object),delete O[N];delete F[L.id]}}}function _(L){for(const D in i){const B=i[D],A=L.isInstancedMesh===!0?L.id:0,F=B[A];if(F!==void 0){for(const O in F){const N=F[O];for(const q in N)h(N[q].object),delete N[q];delete F[O]}delete B[A],Object.keys(B).length===0&&delete i[D]}}}function R(){C(),o=!0,r!==s&&(r=s,l(r.object))}function C(){s.geometry=null,s.program=null,s.wireframe=!1}return{setup:a,reset:R,resetDefaultState:C,dispose:T,releaseStatesOfGeometry:b,releaseStatesOfObject:_,releaseStatesOfProgram:v,initAttributes:x,enableAttribute:m,disableUnusedAttributes:M}}function Sb(n,e,t){let i;function s(c){i=c}function r(c,l){n.drawArrays(i,c,l),t.update(l,i,1)}function o(c,l,h){h!==0&&(n.drawArraysInstanced(i,c,l,h),t.update(l,i,h))}function a(c,l,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,c,0,l,0,h);let f=0;for(let d=0;d<h;d++)f+=l[d];t.update(f,i,1)}this.setMode=s,this.render=r,this.renderInstances=o,this.renderMultiDraw=a}function bb(n,e,t,i){let s;function r(){if(s!==void 0)return s;if(e.has("EXT_texture_filter_anisotropic")===!0){const v=e.get("EXT_texture_filter_anisotropic");s=n.getParameter(v.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else s=0;return s}function o(v){return!(v!==En&&i.convert(v)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(v){const _=v===Jn&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(v!==fn&&v!==wn&&!_&&i.convert(v)!==n.getParameter(n.IMPLEMENTATION_COLOR_READ_TYPE))}function c(v){if(v==="highp"){if(n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.HIGH_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.HIGH_FLOAT).precision>0)return"highp";v="mediump"}return v==="mediump"&&n.getShaderPrecisionFormat(n.VERTEX_SHADER,n.MEDIUM_FLOAT).precision>0&&n.getShaderPrecisionFormat(n.FRAGMENT_SHADER,n.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp";const h=c(l);h!==l&&(De("WebGLRenderer:",l,"not supported, using",h,"instead."),l=h);const u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control"),f=t.logarithmicDepthBuffer===!0&&u===!1;t.reversedDepthBuffer===!0&&u===!1&&De("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer."),t.logarithmicDepthBuffer===!0&&u===!0&&De("WebGLRenderer: Logarithmic depth buffer is ignored when reversed depth buffer is enabled.");const d=n.getParameter(n.MAX_TEXTURE_IMAGE_UNITS),p=n.getParameter(n.MAX_VERTEX_TEXTURE_IMAGE_UNITS),x=n.getParameter(n.MAX_TEXTURE_SIZE),m=n.getParameter(n.MAX_CUBE_MAP_TEXTURE_SIZE),g=n.getParameter(n.MAX_VERTEX_ATTRIBS),M=n.getParameter(n.MAX_VERTEX_UNIFORM_VECTORS),E=n.getParameter(n.MAX_VARYING_VECTORS),y=n.getParameter(n.MAX_FRAGMENT_UNIFORM_VECTORS),T=n.getParameter(n.MAX_SAMPLES),b=n.getParameter(n.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:f,reversedDepthBuffer:u,maxTextures:d,maxVertexTextures:p,maxTextureSize:x,maxCubemapSize:m,maxAttributes:g,maxVertexUniforms:M,maxVaryings:E,maxFragmentUniforms:y,maxSamples:T,samples:b}}function wb(n){const e=this;let t=null,i=0,s=!1,r=!1;const o=new Ri,a=new Oe,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(u,f){const d=u.length!==0||f||i!==0||s;return s=f,i=u.length,d},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,f){t=h(u,f,0)},this.setState=function(u,f,d){const p=u.clippingPlanes,x=u.clipIntersection,m=u.clipShadows,g=n.get(u);if(!s||p===null||p.length===0||r&&!m)r?h(null):l();else{const M=r?0:i,E=M*4;let y=g.clippingState||null;c.value=y,y=h(p,f,E,d);for(let T=0;T!==E;++T)y[T]=t[T];g.clippingState=y,this.numIntersection=x?this.numPlanes:0,this.numPlanes+=M}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function h(u,f,d,p){const x=u!==null?u.length:0;let m=null;if(x!==0){if(m=c.value,p!==!0||m===null){const g=d+x*4,M=f.matrixWorldInverse;a.getNormalMatrix(M),(m===null||m.length<g)&&(m=new Float32Array(g));for(let E=0,y=d;E!==x;++E,y+=4)o.copy(u[E]).applyMatrix4(M,a),o.normal.toArray(m,y),m[y+3]=o.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=x,e.numIntersection=0,m}}class Ih extends On{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const i={width:e,height:e,depth:1},s=[i,i,i,i,i,i];this.texture=new rm(s),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},s=new Vi(5,5,5),r=new an({name:"CubemapFromEquirect",uniforms:er(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:kt,blending:Xs});r.uniforms.tEquirect.value=t;const o=new Ht(s,r),a=t.minFilter;return t.minFilter===Ii&&(t.minFilter=nn),new Zc(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t=!0,i=!0,s=!0){const r=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,i,s);e.setRenderTarget(r)}}const Cf=256,Eb=3,Ab=20,dm=256,pm=16,Tb=3,Rb=new z,Cb=new Qe;class Ea{constructor(e){this._renderer=e,this._cubeSize=0,this._sourceTarget=null,this._cubeCamera=new Zc(1,10,null),this._boxMesh=new Ht(new Vi(5,5,5),null),this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null,this._integrationMaterial=null}fromScene(e,t=0,i=.1,s=100,r={}){const{size:o=256,position:a=Rb}=r,c=this._renderer;this._setSize(o);const l=this._allocateTarget(),h=this._getSourceTarget(!0);t>0&&(h.texture.mipmapsAutoUpdate=!1);const u=c.autoClear,f=c.autoClearColor,d=c.autoClearDepth,p=c.autoClearStencil,x=e.background;c.autoClear=!0,c.autoClearColor=!0,c.autoClearDepth=!0,c.autoClearStencil=!0,x===null&&(e.background=c.getClearColor(Cb));const m=new Zc(i,s,h);return m.position.copy(a),m.update(c,e),c.autoClear=u,c.autoClearColor=f,c.autoClearDepth=d,c.autoClearStencil=p,e.background=x,t>0&&(h.texture.mipmapsAutoUpdate=!0,this._blur(l,t)),this._applyPMREM(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=If(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Lf(),this._compileMaterial(this._equirectMaterial))}dispose(){this._sourceTarget!==null&&this._sourceTarget.dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._integrationMaterial!==null&&this._integrationMaterial.dispose(),this._boxMesh.geometry.dispose()}static lodToRoughness(e,t){return t>0?1-Math.sqrt(1-e/t):0}_setSize(e){this._cubeSize=Math.max(Cf,Kp(e))}_fromTexture(e,t){e.mapping===Js||e.mapping===Vr?this._setSize(e.image.length===0?Cf:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4);const i=t||this._allocateTarget();return this._textureToCubemap(e),this._applyPMREM(i),i}_allocateTarget(){const e=this._cubeSize,t=Pf(e,!1,!1),i=Math.log2(e)-Eb;for(let s=0;s<=i;s++)t.texture.mipmaps.push({width:e>>s,height:e>>s});return t.texture.name="PMREM",t.texture.isPMREMTexture=!0,t}_getSourceTarget(e=!1){const t=this._cubeSize,i=this._sourceTarget;return(i===null||i.width!==t||e&&i.depthBuffer===!1)&&(i!==null&&i.dispose(),this._sourceTarget=Pf(t,!0,e)),this._sourceTarget}_compileMaterial(e){this._boxMesh.material=e,this._renderer.compile(this._boxMesh,this._cubeCamera.children[0])}_renderCube(e,t,i){const s=this._boxMesh,r=this._cubeCamera;s.material=i,r.renderTarget=e,r.activeMipmapLevel=t;const o=e.width>>t;e.viewport.set(0,0,o,o),r.update(this._renderer,s),e.viewport.set(0,0,e.width,e.height)}_textureToCubemap(e){let t;e.mapping===Js||e.mapping===Vr?(this._cubemapMaterial===null&&(this._cubemapMaterial=If()),t=this._cubemapMaterial,t.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):(this._equirectMaterial===null&&(this._equirectMaterial=Lf()),t=this._equirectMaterial),t.uniforms.envMap.value=e,this._renderCube(this._getSourceTarget(),0,t)}_applyPMREM(e){this._ggxMaterial===null&&(this._ggxMaterial=Pb(),this._integrationMaterial=Lb());const t=this._cubeSize,i=e.texture.mipmaps.length-1,s=this._ggxMaterial.uniforms;s.envMap.value=this._sourceTarget.texture;const r=this._integrationMaterial.uniforms;r.envMap.value=this._sourceTarget.texture,r.sourceLod.value=Math.log2(t/pm);for(let o=0;o<=i;o++){const a=Ea.lodToRoughness(o,i);if(o>i-Tb)r.roughness.value=a,this._renderCube(e,o,this._integrationMaterial);else{const c=a>0?Math.log2(t)+.5*Math.log2(6/(dm*Math.pow(a,4)))+.5:0;s.roughness.value=a,s.lodBias.value=c,this._renderCube(e,o,this._ggxMaterial)}}}_blur(e,t){this._blurMaterial===null&&(this._blurMaterial=Ib());const i=this._blurMaterial,s=i.uniforms,r=this._sourceTarget;s.sigma.value=Math.min(t,Math.PI)/Math.SQRT2,s.envMap.value=r.texture,this._renderCube(e,0,i),s.envMap.value=e.texture,this._renderCube(r,0,i)}}function Pf(n,e,t){return new Ih(n,{minFilter:Ii,generateMipmaps:e,type:Jn,colorSpace:$r,depthBuffer:t})}function so(n,e,t){return new an({name:n,uniforms:e,vertexShader:He.cube_vert,fragmentShader:t,side:kt,blending:Xs,depthTest:!1,depthWrite:!1})}function Pb(){return so("PMREMGGXConvolution",{envMap:{value:null},roughness:{value:0},lodBias:{value:0}},`

		#define GGX_SAMPLES ${dm}u

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float lodBias;

		#include <common>

		// Van der Corput radical inverse
		float radicalInverse_VdC( uint bits ) {

			bits = ( bits << 16u ) | ( bits >> 16u );
			bits = ( ( bits & 0x55555555u ) << 1u ) | ( ( bits & 0xAAAAAAAAu ) >> 1u );
			bits = ( ( bits & 0x33333333u ) << 2u ) | ( ( bits & 0xCCCCCCCCu ) >> 2u );
			bits = ( ( bits & 0x0F0F0F0Fu ) << 4u ) | ( ( bits & 0xF0F0F0F0u ) >> 4u );
			bits = ( ( bits & 0x00FF00FFu ) << 8u ) | ( ( bits & 0xFF00FF00u ) >> 8u );
			return float( bits ) * 2.3283064365386963e-10; // / 0x100000000

		}

		// Hammersley sequence
		vec2 hammersley( uint i, uint N ) {

			return vec2( float( i ) / float( N ), radicalInverse_VdC( i ) );

		}

		void main() {

			vec3 N = normalize( vWorldDirection );

			// For very low roughness, just sample the environment directly
			if ( roughness < 0.001 ) {

				gl_FragColor = vec4( textureLod( envMap, N, 0.0 ).rgb, 1.0 );
				return;

			}

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			// Tangent space basis for VNDF sampling
			vec3 up = abs( N.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, N ) );
			vec3 bitangent = cross( N, tangent );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			for ( uint i = 0u; i < GGX_SAMPLES; i ++ ) {

				vec2 Xi = hammersley( i, GGX_SAMPLES );

				// With V = N, sample the reflected direction directly.
				float invQ = 1.0 / ( 1.0 - Xi.x + alpha2 * Xi.x );
				float NdotL = ( 1.0 - Xi.x - alpha2 * Xi.x ) * invQ;

				if ( NdotL > 0.0 ) {

					float phi = 2.0 * PI * Xi.y;
					float sinTheta = 2.0 * alpha * sqrt( Xi.x * ( 1.0 - Xi.x ) ) * invQ;
					vec3 L = N * NdotL + ( tangent * cos( phi ) + bitangent * sin( phi ) ) * sinTheta;

					// Match the source mip to the sample's solid angle. The terms
					// independent of the sample are precomputed in lodBias.
					float d = alpha2 * invQ;
					float lod = max( log2( d ) + lodBias, 0.0 );

					// Weight by NdotL for the split-sum approximation
					prefilteredColor += textureLod( envMap, L, lod ).rgb * NdotL;
					totalWeight += NdotL;

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function Lb(){return so("PMREMGGXIntegration",{envMap:{value:null},roughness:{value:0},sourceLod:{value:0},sourceSize:{value:pm}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float roughness;
		uniform float sourceLod;
		uniform int sourceSize;

		void main() {

			vec3 N = normalize( vWorldDirection );

			float alpha = roughness * roughness;
			float alpha2 = alpha * alpha;

			float texelSize = 2.0 / float( sourceSize );

			vec3 prefilteredColor = vec3( 0.0 );
			float totalWeight = 0.0;

			// Pair opposite texels: only the one in N's hemisphere contributes.
			for ( int face = 0; face < 3; face ++ ) {

				for ( int y = 0; y < sourceSize; y ++ ) {

					for ( int x = 0; x < sourceSize; x ++ ) {

						vec2 uv = ( vec2( x, y ) + 0.5 ) * texelSize - 1.0;
						vec3 texelDirection = face == 0 ? vec3( 1.0, uv ) : ( face == 1 ? vec3( uv.x, 1.0, uv.y ) : vec3( uv, 1.0 ) );

						float invDistance = inversesqrt( 1.0 + dot( uv, uv ) );
						float NdotL = dot( N, texelDirection );
						texelDirection *= NdotL < 0.0 ? - 1.0 : 1.0;
						NdotL = abs( NdotL ) * invDistance;

						// With V = N, NdotH squared is ( 1 + NdotL ) / 2. Common factors
						// in the GGX distribution and texel solid angle cancel when normalized.
						float d = 1.0 + alpha2 + ( alpha2 - 1.0 ) * NdotL;
						float weight = NdotL * invDistance * invDistance * invDistance / ( d * d );

						prefilteredColor += textureLod( envMap, texelDirection, sourceLod ).rgb * weight;
						totalWeight += weight;

					}

				}

			}

			gl_FragColor = vec4( prefilteredColor / totalWeight, 1.0 );

		}
	`)}function Ib(){return so("PMREMSphericalGaussianBlur",{envMap:{value:null},sigma:{value:0}},`

		#define SAMPLES ${Ab}
		#define GOLDEN_ANGLE 2.39996322973

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float sigma;

		#include <common>

		void main() {

			vec3 outputDirection = normalize( vWorldDirection );

			vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
			vec3 tangent = normalize( cross( up, outputDirection ) );
			vec3 bitangent = cross( outputDirection, tangent );

			// Truncate the kernel at three standard deviations or at the antipode.
			float thetaMax = min( 3.0 * sigma, PI );
			float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

			vec3 accumColor = vec3( 0.0 );
			float accumWeight = 0.0;

			for ( int i = 0; i < SAMPLES; i ++ ) {

				// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
				float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
				float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
				float phi = float( i ) * GOLDEN_ANGLE;

				vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
				vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

				// Correct the planar sample density to solid angle.
				float weight = sin( theta ) / theta;

				accumColor += weight * textureLod( envMap, sampleDirection, 0.0 ).rgb;
				accumWeight += weight;

			}

			gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

		}
	`)}function Lf(){return so("PMREMEquirectangularToCubemap",{envMap:{value:null}},`

		varying vec3 vWorldDirection;

		uniform sampler2D envMap;

		#include <common>

		void main() {

			// Average four subpixel samples to preserve small, bright features.
			vec3 direction = normalize( vWorldDirection );
			vec3 dx = dFdx( direction ) * 0.25;
			vec3 dy = dFdy( direction ) * 0.25;

			vec3 color = textureLod( envMap, equirectUv( normalize( direction - dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx - dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction - dx + dy ) ), 0.0 ).rgb;
			color += textureLod( envMap, equirectUv( normalize( direction + dx + dy ) ), 0.0 ).rgb;
			gl_FragColor = vec4( color * 0.25, 1.0 );

		}
	`)}function If(){return so("PMREMCubemapToCubemap",{envMap:{value:null},flipEnvMap:{value:-1}},`

		varying vec3 vWorldDirection;

		uniform samplerCube envMap;
		uniform float flipEnvMap;

		void main() {

			gl_FragColor = vec4( textureCube( envMap, vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) ).rgb, 1.0 );

		}
	`)}function Db(n){let e=new WeakMap,t=new WeakMap,i=null;function s(f,d=!1){return f==null?null:d?o(f):r(f)}function r(f){if(f&&f.isTexture){const d=f.mapping;if(d===dl||d===pl)if(e.has(f)){const p=e.get(f).texture;return a(p,f.mapping)}else{const p=f.image;if(p&&p.height>0){const x=new Ih(p.height);return x.fromEquirectangularTexture(n,f),e.set(f,x),f.addEventListener("dispose",l),a(x.texture,f.mapping)}else return null}}return f}function o(f){if(f&&f.isTexture&&f.isPMREMTexture!==!0){const d=f.mapping,p=d===dl||d===pl,x=d===Js||d===Vr;if(p||x){let m=t.get(f);const g=m!==void 0?m.texture.pmremVersion:0;if(f.isRenderTargetTexture&&f.pmremVersion!==g)return i===null&&(i=new Ea(n)),m=p?i.fromEquirectangular(f,m):i.fromCubemap(f,m),m.texture.pmremVersion=f.pmremVersion,t.set(f,m),m.texture;if(m!==void 0)return m.texture;{const M=f.image;return p&&M&&M.height>0||x&&M&&c(M)?(i===null&&(i=new Ea(n)),m=p?i.fromEquirectangular(f):i.fromCubemap(f),m.texture.pmremVersion=f.pmremVersion,t.set(f,m),f.addEventListener("dispose",h),m.texture):null}}}return f}function a(f,d){return d===dl?f.mapping=Js:d===pl&&(f.mapping=Vr),f}function c(f){let d=0;const p=6;for(let x=0;x<p;x++)f[x]!==void 0&&d++;return d===p}function l(f){const d=f.target;d.removeEventListener("dispose",l);const p=e.get(d);p!==void 0&&(e.delete(d),p.dispose())}function h(f){const d=f.target;d.removeEventListener("dispose",h);const p=t.get(d);p!==void 0&&(t.delete(d),p.dispose())}function u(){e=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:s,dispose:u}}function Nb(n){const e={};function t(i){if(e[i]!==void 0)return e[i];const s=n.getExtension(i);return e[i]=s,s}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){const s=t(i);return s===null&&ia("WebGLRenderer: "+i+" extension not supported."),s}}}function Fb(n,e,t,i){const s={},r=new WeakMap,o=new FinalizationRegistry(p=>delete s[p]);function a(p){c(p.target)}function c(p){p.index!==null&&e.remove(p.index);for(const m in p.attributes)e.remove(p.attributes[m]);p.removeEventListener("dispose",a),delete s[p.id],o.unregister(p);const x=r.get(p);x&&(e.remove(x),r.delete(p)),i.releaseStatesOfGeometry(p),p.isInstancedBufferGeometry===!0&&delete p._maxInstanceCount,t.memory.geometries--}function l(p,x){return s[x.id]!==void 0||(x.addEventListener("dispose",a),s[x.id]=new WeakRef(x),o.register(x,x.id,x),t.memory.geometries++),x}function h(p){const x=p.attributes;for(const m in x)e.update(x[m],n.ARRAY_BUFFER)}function u(p){const x=p.index,m=p.attributes.position;let g=0;if(m===void 0)return;const M=x!==null?x.array.length:m.array.length/3-1,E=m.count>=65535?nm:tm,y=new E(Math.ceil(M/3)*6,1),T=y.array;if(x!==null){const v=x.array;g=x.version;for(let _=0,R=0;_<M;_+=3){const C=v[_+0],L=v[_+1],D=v[_+2];T[R++]=C,T[R++]=L,T[R++]=L,T[R++]=D,T[R++]=D,T[R++]=C}}else{g=m.version;for(let v=0,_=0;v<M;v+=3){const R=v+0,C=v+1,L=v+2;T[_++]=R,T[_++]=C,T[_++]=C,T[_++]=L,T[_++]=L,T[_++]=R}}y.version=g;const b=r.get(p);b&&e.remove(b),r.set(p,y)}function f(p){const x=r.get(p);if(x){const m=p.index;m!==null&&x.version<m.version&&u(p)}else u(p);return r.get(p)}function d(){for(const p in s){const x=s[p].deref();x!==void 0&&c(x)}}return{get:l,update:h,getWireframeAttribute:f,dispose:d}}function Ub(n,e,t){let i;function s(u){i=u}let r,o;function a(u){r=u.type,o=u.bytesPerElement}function c(u,f){n.drawElements(i,f,r,u*o),t.update(f,i,1)}function l(u,f,d){d!==0&&(n.drawElementsInstanced(i,f,r,u*o,d),t.update(f,i,d))}function h(u,f,d){if(d===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,f,0,r,u,0,d);let x=0;for(let m=0;m<d;m++)x+=f[m];t.update(x,i,1)}this.setMode=s,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=h}function Ob(n){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(r,o,a){switch(t.calls++,o){case n.TRIANGLES:t.triangles+=a*(r/3);break;case n.LINES:t.lines+=a*(r/2);break;case n.LINE_STRIP:t.lines+=a*(r-1);break;case n.LINE_LOOP:t.lines+=a*r;break;case n.POINTS:t.points+=a*r;break;default:et("WebGLInfo: Unknown draw mode:",o);break}}function s(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:s,update:i}}function kb(n,e,t){const i=new WeakMap,s=new ct;function r(o,a,c){const l=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,u=h!==void 0?h.length:0;let f=i.get(a);if(f===void 0||f.count!==u){let C=function(){_.dispose(),i.delete(a),a.removeEventListener("dispose",C)};var d=C;f!==void 0&&f.texture.dispose();const p=a.morphAttributes.position!==void 0,x=a.morphAttributes.normal!==void 0,m=a.morphAttributes.color!==void 0,g=a.morphAttributes.position||[],M=a.morphAttributes.normal||[],E=a.morphAttributes.color||[];let y=0;p===!0&&(y=1),x===!0&&(y=2),m===!0&&(y=3);let T=a.attributes.position.count*y,b=1;T>e.maxTextureSize&&(b=Math.ceil(T/e.maxTextureSize),T=e.maxTextureSize);const v=new Float32Array(T*b*4*u),_=new Qp(v,T,b,u);_.type=wn,_.needsUpdate=!0;const R=y*4;for(let L=0;L<u;L++){const D=g[L],B=M[L],A=E[L],F=T*b*4*L;for(let O=0;O<D.count;O++){const N=O*R;p===!0&&(s.fromBufferAttribute(D,O),v[F+N+0]=s.x,v[F+N+1]=s.y,v[F+N+2]=s.z,v[F+N+3]=0),x===!0&&(s.fromBufferAttribute(B,O),v[F+N+4]=s.x,v[F+N+5]=s.y,v[F+N+6]=s.z,v[F+N+7]=0),m===!0&&(s.fromBufferAttribute(A,O),v[F+N+8]=s.x,v[F+N+9]=s.y,v[F+N+10]=s.z,v[F+N+11]=A.itemSize===4?s.w:1)}}f={count:u,texture:_,size:new ze(T,b)},i.set(a,f),a.addEventListener("dispose",C)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(n,"morphTexture",o.morphTexture,t);else{let p=0;for(let m=0;m<l.length;m++)p+=l[m];const x=a.morphTargetsRelative?1:1-p;c.getUniforms().setValue(n,"morphTargetBaseInfluence",x),c.getUniforms().setValue(n,"morphTargetInfluences",l)}c.getUniforms().setValue(n,"morphTargetsTexture",f.texture,t),c.getUniforms().setValue(n,"morphTargetsTextureSize",f.size)}return{update:r}}function Bb(n,e,t,i,s){let r=new WeakMap;function o(l){const h=s.render.frame,u=l.geometry,f=e.get(l,u);if(r.get(f)!==h&&(e.update(f),r.set(f,h)),l.isInstancedMesh&&(l.hasEventListener("dispose",c)===!1&&l.addEventListener("dispose",c),r.get(l)!==h&&(t.update(l.instanceMatrix,n.ARRAY_BUFFER),l.instanceColor!==null&&t.update(l.instanceColor,n.ARRAY_BUFFER),r.set(l,h))),l.isSkinnedMesh){const d=l.skeleton;r.get(d)!==h&&(d.update(),r.set(d,h))}return f}function a(){r=new WeakMap}function c(l){const h=l.target;h.removeEventListener("dispose",c),i.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:o,dispose:a}}const zb={[Lp]:"LINEAR_TONE_MAPPING",[Ip]:"REINHARD_TONE_MAPPING",[Dp]:"CINEON_TONE_MAPPING",[Np]:"ACES_FILMIC_TONE_MAPPING",[Up]:"AGX_TONE_MAPPING",[Op]:"NEUTRAL_TONE_MAPPING",[Fp]:"CUSTOM_TONE_MAPPING"};function Gb(n,e,t,i,s,r){const o=new On(e,t,{type:n,depthBuffer:s,stencilBuffer:r,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let a=null,c=null,l=null;const h=new An;h.setAttribute("position",new Pt([-1,3,0,-1,-1,0,3,-1,0],3)),h.setAttribute("uv",new Pt([0,2,0,0,2,0],2));const u=new NM({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),f=new Ht(h,u),d=new hm(-1,1,1,-1,0,1);let p=null,x=null,m=!1,g,M=null,E=[],y=!1;this.setSize=function(T,b){o.setSize(T,b),a!==null&&a.setSize(T,b),c!==null&&c.setSize(T,b);for(let v=0;v<E.length;v++){const _=E[v];_.setSize&&_.setSize(T,b)}},this.setEffects=function(T){E=T,y=E.length>0&&E[0].isRenderPass===!0;const b=o.width,v=o.height;E.length>0&&a===null&&(a=new On(b,v,{type:Jn,depthBuffer:!1,stencilBuffer:!1}),c=new On(b,v,{type:Jn,depthBuffer:!1,stencilBuffer:!1}));const _=s===!0&&E.some(R=>R.needsDepthTexture===!0);_!==(o.depthTexture!==null)&&(_===!0&&l===null&&(l=new js(b,v),r===!0&&(l.format=Di,l.type=Qs)),o.dispose(),o.depthTexture=_?l:null,o.resolveDepthBuffer=_,o.storeMultisampledDepthBuffer=_);for(let R=0;R<E.length;R++){const C=E[R];C.setSize&&C.setSize(b,v),_&&C.needsDepthTexture===!0&&C.setDepthTexture&&C.setDepthTexture(l)}},this.begin=function(T,b){if(m||T.toneMapping===pi&&E.length===0)return!1;if(M=b,b!==null){const v=b.width,_=b.height;(o.width!==v||o.height!==_)&&this.setSize(v,_)}return y===!1&&T.setRenderTarget(o),g=T.toneMapping,T.toneMapping=pi,!0},this.hasRenderPass=function(){return y},this.end=function(T,b){T.toneMapping=g,m=!0;let v=o,_=a;for(let R=0;R<E.length;R++){const C=E[R];C.enabled!==!1&&(C.render(T,_,v,b),C.needsSwap!==!1&&(v=_,_=_===a?c:a))}if(p!==T.outputColorSpace||x!==T.toneMapping){p=T.outputColorSpace,x=T.toneMapping,u.defines={},qe.getTransfer(p)===st&&(u.defines.SRGB_TRANSFER="");const R=zb[x];R&&(u.defines[R]=""),u.needsUpdate=!0}u.uniforms.tDiffuse.value=v.texture,T.setRenderTarget(M),T.render(f,d),M=null,m=!1},this.isCompositing=function(){return m},this.dispose=function(){o.dispose(),a!==null&&a.dispose(),c!==null&&c.dispose(),h.dispose(),u.dispose()}}const mm=new en,gm=new js(1,1),vm=new om(1),_m=new Qp,xm=new uM,Mm=new rm,Df=[],Nf=[],Ff=new Float32Array(16),Uf=new Float32Array(9),Of=new Float32Array(4);function sr(n,e,t){const i=n[0];if(i<=0||i>0)return n;const s=e*t;let r=Df[s];if(r===void 0&&(r=new Float32Array(s),Df[s]=r),e!==0){i.toArray(r,0);for(let o=1,a=0;o!==e;++o)a+=t,n[o].toArray(r,a)}return r}function Lt(n,e){if(n.length!==e.length)return!1;for(let t=0,i=n.length;t<i;t++)if(n[t]!==e[t])return!1;return!0}function It(n,e){for(let t=0,i=e.length;t<i;t++)n[t]=e[t]}function Fa(n,e){let t=Nf[e];t===void 0&&(t=new Int32Array(e),Nf[e]=t);for(let i=0;i!==e;++i)t[i]=n.allocateTextureUnit();return t}function Hb(n,e){const t=this.cache;t[0]!==e&&(n.uniform1f(this.addr,e),t[0]=e)}function Vb(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2fv(this.addr,e),It(t,e)}}function Wb(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(n.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Lt(t,e))return;n.uniform3fv(this.addr,e),It(t,e)}}function $b(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4fv(this.addr,e),It(t,e)}}function Xb(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix2fv(this.addr,!1,e),It(t,e)}else{if(Lt(t,i))return;Of.set(i),n.uniformMatrix2fv(this.addr,!1,Of),It(t,i)}}function qb(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix3fv(this.addr,!1,e),It(t,e)}else{if(Lt(t,i))return;Uf.set(i),n.uniformMatrix3fv(this.addr,!1,Uf),It(t,i)}}function Yb(n,e){const t=this.cache,i=e.elements;if(i===void 0){if(Lt(t,e))return;n.uniformMatrix4fv(this.addr,!1,e),It(t,e)}else{if(Lt(t,i))return;Ff.set(i),n.uniformMatrix4fv(this.addr,!1,Ff),It(t,i)}}function Kb(n,e){const t=this.cache;t[0]!==e&&(n.uniform1i(this.addr,e),t[0]=e)}function Zb(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2iv(this.addr,e),It(t,e)}}function Jb(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Lt(t,e))return;n.uniform3iv(this.addr,e),It(t,e)}}function Qb(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4iv(this.addr,e),It(t,e)}}function jb(n,e){const t=this.cache;t[0]!==e&&(n.uniform1ui(this.addr,e),t[0]=e)}function ew(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(n.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Lt(t,e))return;n.uniform2uiv(this.addr,e),It(t,e)}}function tw(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(n.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Lt(t,e))return;n.uniform3uiv(this.addr,e),It(t,e)}}function nw(n,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(n.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Lt(t,e))return;n.uniform4uiv(this.addr,e),It(t,e)}}function Ua(n){return n.version===0&&(n.compareFunction=qp,n.needsUpdate=!0),n}function iw(n,e,t){const i=this.cache,s=t.allocateTextureUnit();i[0]!==s&&(n.uniform1i(this.addr,s),i[0]=s);let r;this.type===n.SAMPLER_2D_SHADOW?r=Ua(gm):r=mm,t.setTexture2D(e||r,s)}function sw(n,e,t){const i=this.cache,s=t.allocateTextureUnit();i[0]!==s&&(n.uniform1i(this.addr,s),i[0]=s),t.setTexture3D(e||xm,s)}function rw(n,e,t){const i=this.cache,s=t.allocateTextureUnit();i[0]!==s&&(n.uniform1i(this.addr,s),i[0]=s);let r;this.type===n.SAMPLER_CUBE_SHADOW?r=Ua(vm):r=Mm,t.setTextureCube(e||r,s)}function ow(n,e,t){const i=this.cache,s=t.allocateTextureUnit();i[0]!==s&&(n.uniform1i(this.addr,s),i[0]=s),t.setTexture2DArray(e||_m,s)}function aw(n){switch(n){case 5126:return Hb;case 35664:return Vb;case 35665:return Wb;case 35666:return $b;case 35674:return Xb;case 35675:return qb;case 35676:return Yb;case 5124:case 35670:return Kb;case 35667:case 35671:return Zb;case 35668:case 35672:return Jb;case 35669:case 35673:return Qb;case 5125:return jb;case 36294:return ew;case 36295:return tw;case 36296:return nw;case 35678:case 36198:case 36298:case 36306:case 35682:return iw;case 35679:case 36299:case 36307:return sw;case 35680:case 36300:case 36308:case 36293:return rw;case 36289:case 36303:case 36311:case 36292:return ow}}function lw(n,e){n.uniform1fv(this.addr,e)}function cw(n,e){const t=sr(e,this.size,2);n.uniform2fv(this.addr,t)}function hw(n,e){const t=sr(e,this.size,3);n.uniform3fv(this.addr,t)}function uw(n,e){const t=sr(e,this.size,4);n.uniform4fv(this.addr,t)}function fw(n,e){const t=sr(e,this.size,4);n.uniformMatrix2fv(this.addr,!1,t)}function dw(n,e){const t=sr(e,this.size,9);n.uniformMatrix3fv(this.addr,!1,t)}function pw(n,e){const t=sr(e,this.size,16);n.uniformMatrix4fv(this.addr,!1,t)}function mw(n,e){n.uniform1iv(this.addr,e)}function gw(n,e){n.uniform2iv(this.addr,e)}function vw(n,e){n.uniform3iv(this.addr,e)}function _w(n,e){n.uniform4iv(this.addr,e)}function xw(n,e){n.uniform1uiv(this.addr,e)}function Mw(n,e){n.uniform2uiv(this.addr,e)}function yw(n,e){n.uniform3uiv(this.addr,e)}function Sw(n,e){n.uniform4uiv(this.addr,e)}function bw(n,e,t){const i=this.cache,s=e.length,r=Fa(t,s);Lt(i,r)||(n.uniform1iv(this.addr,r),It(i,r));let o;this.type===n.SAMPLER_2D_SHADOW?o=Ua(gm):o=mm;for(let a=0;a!==s;++a)t.setTexture2D(e[a]||o,r[a])}function ww(n,e,t){const i=this.cache,s=e.length,r=Fa(t,s);Lt(i,r)||(n.uniform1iv(this.addr,r),It(i,r));for(let o=0;o!==s;++o)t.setTexture3D(e[o]||xm,r[o])}function Ew(n,e,t){const i=this.cache,s=e.length,r=Fa(t,s);Lt(i,r)||(n.uniform1iv(this.addr,r),It(i,r));let o;this.type===n.SAMPLER_CUBE_SHADOW?o=Ua(vm):o=Mm;for(let a=0;a!==s;++a)t.setTextureCube(e[a]||o,r[a])}function Aw(n,e,t){const i=this.cache,s=e.length,r=Fa(t,s);Lt(i,r)||(n.uniform1iv(this.addr,r),It(i,r));for(let o=0;o!==s;++o)t.setTexture2DArray(e[o]||_m,r[o])}function Tw(n){switch(n){case 5126:return lw;case 35664:return cw;case 35665:return hw;case 35666:return uw;case 35674:return fw;case 35675:return dw;case 35676:return pw;case 5124:case 35670:return mw;case 35667:case 35671:return gw;case 35668:case 35672:return vw;case 35669:case 35673:return _w;case 5125:return xw;case 36294:return Mw;case 36295:return yw;case 36296:return Sw;case 35678:case 36198:case 36298:case 36306:case 35682:return bw;case 35679:case 36299:case 36307:return ww;case 35680:case 36300:case 36308:case 36293:return Ew;case 36289:case 36303:case 36311:case 36292:return Aw}}class Rw{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=aw(t.type)}}class Cw{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Tw(t.type)}}class Pw{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){const s=this.seq;for(let r=0,o=s.length;r!==o;++r){const a=s[r];a.setValue(e,t[a.id],i)}}}const Ol=/(\w+)(\])?(\[|\.)?/g;function kf(n,e){n.seq.push(e),n.map[e.id]=e}function Lw(n,e,t){const i=n.name,s=i.length;for(Ol.lastIndex=0;;){const r=Ol.exec(i),o=Ol.lastIndex;let a=r[1];const c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===s){kf(t,l===void 0?new Rw(a,n,e):new Cw(a,n,e));break}else{let u=t.map[a];u===void 0&&(u=new Pw(a),kf(t,u)),t=u}}}class sa{constructor(e,t){this.seq=[],this.map={};const i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let o=0;o<i;++o){const a=e.getActiveUniform(t,o),c=e.getUniformLocation(t,a.name);Lw(a,c,this)}const s=[],r=[];for(const o of this.seq)o.type===e.SAMPLER_2D_SHADOW||o.type===e.SAMPLER_CUBE_SHADOW||o.type===e.SAMPLER_2D_ARRAY_SHADOW?s.push(o):r.push(o);s.length>0&&(this.seq=s.concat(r))}setValue(e,t,i,s){const r=this.map[t];r!==void 0&&r.setValue(e,i,s)}setOptional(e,t,i){const s=t[i];s!==void 0&&this.setValue(e,i,s)}static upload(e,t,i,s){for(let r=0,o=t.length;r!==o;++r){const a=t[r],c=i[a.id];c.needsUpdate!==!1&&a.setValue(e,c.value,s)}}static seqWithValue(e,t){const i=[];for(let s=0,r=e.length;s!==r;++s){const o=e[s];o.id in t&&i.push(o)}return i}}function Bf(n,e,t){const i=n.createShader(e);return n.shaderSource(i,t),n.compileShader(i),i}const Iw=37297;let Dw=0;function Nw(n,e){const t=n.split(`
`),i=[],s=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let o=s;o<r;o++){const a=o+1;i.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return i.join(`
`)}const zf=new Oe;function Fw(n){qe._getMatrix(zf,qe.workingColorSpace,n);const e=`mat3( ${zf.elements.map(t=>t.toFixed(4))} )`;switch(qe.getTransfer(n)){case ya:return[e,"LinearTransferOETF"];case st:return[e,"sRGBTransferOETF"];default:return De("WebGLProgram: Unsupported color space: ",n),[e,"LinearTransferOETF"]}}function Gf(n,e,t){const i=n.getShaderParameter(e,n.COMPILE_STATUS),r=(n.getShaderInfoLog(e)||"").trim();if(i&&r==="")return"";const o=/ERROR: 0:(\d+)/.exec(r);if(o){const a=parseInt(o[1]);return t.toUpperCase()+`

`+r+`

`+Nw(n.getShaderSource(e),a)}else return r}function Uw(n,e){const t=Fw(e);return[`vec4 ${n}( vec4 value ) {`,`	return ${t[1]}( vec4( ${t[0]} * value.rgb, value.a ) );`,"}"].join(`
`)}const Ow={[Lp]:"Linear",[Ip]:"Reinhard",[Dp]:"Cineon",[Np]:"ACESFilmic",[Up]:"AgX",[Op]:"Neutral",[Fp]:"Custom"};function kw(n,e){const t=Ow[e];return t===void 0?(De("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+n+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+n+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const $o=new z;function Bw(){qe.getLuminanceCoefficients($o);const n=$o.x.toFixed(4),e=$o.y.toFixed(4),t=$o.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${n}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function zw(n){return[n.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",n.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(yr).join(`
`)}function Gw(n){const e=[];for(const t in n){const i=n[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function Hw(n,e){const t={},i=n.getProgramParameter(e,n.ACTIVE_ATTRIBUTES);for(let s=0;s<i;s++){const r=n.getActiveAttrib(e,s),o=r.name;let a=1;r.type===n.FLOAT_MAT2&&(a=2),r.type===n.FLOAT_MAT3&&(a=3),r.type===n.FLOAT_MAT4&&(a=4),t[o]={type:r.type,location:n.getAttribLocation(e,o),locationSize:a}}return t}function yr(n){return n!==""}function Hf(n,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return n.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows).replace(/NUM_LIGHT_PROBE_GRIDS/g,e.numLightProbeGrids)}function Vf(n,e){return n.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Vw=/^[ \t]*#include +<([\w\d./]+)>/gm;function Jc(n){return n.replace(Vw,Ww)}function Ww(n,e){const t=He[e];if(t===void 0)throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">");return Jc(t)}const $w=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Wf(n){return n.replace($w,Xw)}function Xw(n,e,t,i){let s="";for(let r=parseInt(e);r<parseInt(t);r++)s+=i.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return s}function $f(n){let e=`precision ${n.precision} float;
	precision ${n.precision} int;
	precision ${n.precision} sampler2D;
	precision ${n.precision} samplerCube;
	precision ${n.precision} sampler3D;
	precision ${n.precision} sampler2DArray;
	precision ${n.precision} sampler2DShadow;
	precision ${n.precision} samplerCubeShadow;
	precision ${n.precision} sampler2DArrayShadow;
	precision ${n.precision} isampler2D;
	precision ${n.precision} isampler3D;
	precision ${n.precision} isamplerCube;
	precision ${n.precision} isampler2DArray;
	precision ${n.precision} usampler2D;
	precision ${n.precision} usampler3D;
	precision ${n.precision} usamplerCube;
	precision ${n.precision} usampler2DArray;
	`;return n.precision==="highp"?e+=`
#define HIGH_PRECISION`:n.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:n.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}const qw={[Qo]:"SHADOWMAP_TYPE_PCF",[Mr]:"SHADOWMAP_TYPE_VSM"};function Yw(n){return qw[n.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const Kw={[Vr]:"ENVMAP_MODE_REFRACTION"};function Zw(n){return n.envMap===!1?"ENVMAP_MODE_REFLECTION":Kw[n.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Jw={[Pp]:"ENVMAP_BLENDING_MULTIPLY",[Rx]:"ENVMAP_BLENDING_MIX",[Cx]:"ENVMAP_BLENDING_ADD"};function Qw(n){return n.envMap===!1?"ENVMAP_BLENDING_NONE":Jw[n.combine]||"ENVMAP_BLENDING_NONE"}function jw(n,e,t,i){const s=n.getContext(),r=t.defines;let o=t.vertexShader,a=t.fragmentShader;const c=Yw(t),l=t.envMapPMREM===!0?"ENVMAP_TYPE_PMREM":"ENVMAP_TYPE_CUBE",h=Zw(t),u=Qw(t),f=zw(t),d=Gw(r),p=s.createProgram();let x,m,g=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(x=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d].filter(yr).join(`
`),x.length>0&&(x+=`
`),m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d].filter(yr).join(`
`),m.length>0&&(m+=`
`)):(x=[$f(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.diffuseRoughnessMapUv?"#define DIFFUSE_ROUGHNESSMAP_UV "+t.diffuseRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(yr).join(`
`),m=[$f(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,d,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",t.envMapPMREM?"#define ENVMAP_MAX_LOD "+t.envMapMaxLod+".0":"",t.envMapPMREM?"#define ENVMAP_SIZE "+t.envMapSize+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.diffuseRoughness?"#define USE_DIFFUSE_ROUGHNESS":"",t.diffuseRoughnessMap?"#define USE_DIFFUSE_ROUGHNESSMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==pi?"#define TONE_MAPPING":"",t.toneMapping!==pi?He.tonemapping_pars_fragment:"",t.toneMapping!==pi?kw("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",He.colorspace_pars_fragment,Uw("linearToOutputTexel",t.outputColorSpace),Bw(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(yr).join(`
`)),o=Jc(o),o=Hf(o,t),o=Vf(o,t),a=Jc(a),a=Hf(a,t),a=Vf(a,t),o=Wf(o),a=Wf(a),t.isRawShaderMaterial!==!0&&(g=`#version 300 es
`,x=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+x,m=["#define varying in",t.glslVersion===tf?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===tf?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+m);const M=g+x+o,E=g+m+a,y=Bf(s,s.VERTEX_SHADER,M),T=Bf(s,s.FRAGMENT_SHADER,E);s.attachShader(p,y),s.attachShader(p,T),t.index0AttributeName!==void 0?s.bindAttribLocation(p,0,t.index0AttributeName):t.hasPositionAttribute===!0&&s.bindAttribLocation(p,0,"position"),s.linkProgram(p);function b(C){if(n.debug.checkShaderErrors){const L=s.getProgramInfoLog(p)||"",D=s.getShaderInfoLog(y)||"",B=s.getShaderInfoLog(T)||"",A=L.trim(),F=D.trim(),O=B.trim();let N=!0,q=!0;if(s.getProgramParameter(p,s.LINK_STATUS)===!1)if(N=!1,typeof n.debug.onShaderError=="function")n.debug.onShaderError(s,p,y,T);else{const V=Gf(s,y,"vertex"),X=Gf(s,T,"fragment");et("WebGLProgram: Shader Error "+s.getError()+" - VALIDATE_STATUS "+s.getProgramParameter(p,s.VALIDATE_STATUS)+`

Material Name: `+C.name+`
Material Type: `+C.type+`

Program Info Log: `+A+`
`+V+`
`+X)}else A!==""?De("WebGLProgram: Program Info Log:",A):(F===""||O==="")&&(q=!1);q&&(C.diagnostics={runnable:N,programLog:A,vertexShader:{log:F,prefix:x},fragmentShader:{log:O,prefix:m}})}s.deleteShader(y),s.deleteShader(T),v=new sa(s,p),_=Hw(s,p)}let v;this.getUniforms=function(){return v===void 0&&b(this),v};let _;this.getAttributes=function(){return _===void 0&&b(this),_};let R=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=s.getProgramParameter(p,Iw)),R},this.destroy=function(){i.releaseStatesOfProgram(this),s.deleteProgram(p),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=Dw++,this.cacheKey=e,this.usedTimes=1,this.program=p,this.vertexShader=y,this.fragmentShader=T,this}let eE=0;class tE{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,i){const s=this._getShaderCacheForMaterial(e);return s.has(t)===!1&&(s.add(t),t.usedTimes++),s.has(i)===!1&&(s.add(i),i.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){const t=this.shaderCache;let i=t.get(e);return i===void 0&&(i=new nE(e),t.set(e,i)),i}}class nE{constructor(e){this.id=eE++,this.code=e,this.usedTimes=0}}function iE(n){return n===vs||n===xa||n===Ma}function sE(n,e,t,i,s,r){const o=new jp,a=new tE,c=new Set,l=[],h=new Map,u=i.logarithmicDepthBuffer,f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function d(v){return c.add(v),v===0?"uv":`uv${v}`}function p(v,_,R,C,L,D){const B=C.fog,A=L.geometry,F=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?C.environment:null,O=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap,N=e.get(v.envMap||F,O),q=f[v.type];let V=i.precision;v.precision!==null&&(V=i.getMaxPrecision(v.precision),V!==v.precision&&De("WebGLProgram.getParameters:",v.precision,"not supported, using",V,"instead."));const X=A.morphAttributes.position||A.morphAttributes.normal||A.morphAttributes.color,j=X!==void 0?X.length:0;let de=0;A.morphAttributes.position!==void 0&&(de=1),A.morphAttributes.normal!==void 0&&(de=2),A.morphAttributes.color!==void 0&&(de=3);let Re,K,fe,Me;if(q){const ge=Wn[q];Re=ge.vertexShader,K=ge.fragmentShader}else{Re=v.vertexShader,K=v.fragmentShader;const ge=a.getVertexShaderStage(v),nt=a.getFragmentShaderStage(v);a.update(v,ge,nt),fe=ge.id,Me=nt.id}const Ce=n.getRenderTarget(),me=n.state.buffers.depth.getReversed(),Ne=L.isInstancedMesh===!0,ut=L.isBatchedMesh===!0,$=!!v.map,xe=!!v.matcap,Le=!!N,Ae=Le&&N.isPMREMTexture===!0,ot=!!v.aoMap,ft=!!v.lightMap,Tt=!!v.bumpMap&&v.wireframe===!1,mt=!!v.normalMap,kn=!!v.displacementMap,Dt=!!v.emissiveMap,dn=!!v.metalnessMap,pn=!!v.roughnessMap,mn=v.anisotropy>0,k=v.clearcoat>0,gn=v.diffuseRoughness>0,dt=v.dispersion>0,pt=v.retroreflectivity>0,pe=v.iridescence>0,Rt=v.sheen>0,Ie=v.transmission>0,Fe=mn&&!!v.anisotropyMap,P=k&&!!v.clearcoatMap,S=k&&!!v.clearcoatNormalMap,H=k&&!!v.clearcoatRoughnessMap,ne=gn&&!!v.diffuseRoughnessMap,te=pe&&!!v.iridescenceMap,re=pe&&!!v.iridescenceThicknessMap,he=Rt&&!!v.sheenColorMap,J=Rt&&!!v.sheenRoughnessMap,Q=!!v.specularMap,ae=!!v.specularColorMap,I=!!v.specularIntensityMap,ee=Ie&&!!v.transmissionMap,Z=Ie&&!!v.thicknessMap,le=!!v.gradientMap,se=!!v.alphaMap,oe=v.alphaTest>0,Te=!!v.alphaHash,Ge=!!v.extensions;let ie=pi;v.toneMapped&&(Ce===null||Ce.isXRRenderTarget===!0)&&(ie=n.toneMapping);const Pe=Ae?N.isCompressedCubeTexture?N.image[0].mipmaps:N.mipmaps:null,ke={shaderID:q,shaderType:v.type,shaderName:v.name,vertexShader:Re,fragmentShader:K,defines:v.defines,customVertexShaderID:fe,customFragmentShaderID:Me,isRawShaderMaterial:v.isRawShaderMaterial===!0,glslVersion:v.glslVersion,precision:V,batching:ut,batchingColor:ut&&L._colorsTexture!==null,instancing:Ne,instancingColor:Ne&&L.instanceColor!==null,instancingMorph:Ne&&L.morphTexture!==null,outputColorSpace:Ce===null?n.outputColorSpace:Ce.isXRRenderTarget===!0?Ce.texture.colorSpace:qe.workingColorSpace,alphaToCoverage:!!v.alphaToCoverage,map:$,matcap:xe,envMap:Le,envMapMode:Le&&N.mapping,envMapPMREM:Ae,envMapMaxLod:Ae?Pe.length-1:null,envMapSize:Ae?Pe[0].width:null,aoMap:ot,lightMap:ft,bumpMap:Tt,normalMap:mt,displacementMap:kn,emissiveMap:Dt,normalMapObjectSpace:mt&&v.normalMapType===Ix,normalMapTangentSpace:mt&&v.normalMapType===ef,packedNormalMap:mt&&v.normalMapType===ef&&iE(v.normalMap.format),metalnessMap:dn,roughnessMap:pn,anisotropy:mn,anisotropyMap:Fe,clearcoat:k,clearcoatMap:P,clearcoatNormalMap:S,clearcoatRoughnessMap:H,diffuseRoughness:gn,diffuseRoughnessMap:ne,dispersion:dt,retroreflection:pt,iridescence:pe,iridescenceMap:te,iridescenceThicknessMap:re,sheen:Rt,sheenColorMap:he,sheenRoughnessMap:J,specularMap:Q,specularColorMap:ae,specularIntensityMap:I,transmission:Ie,transmissionMap:ee,thicknessMap:Z,gradientMap:le,opaque:v.transparent===!1&&v.blending===Nr&&v.alphaToCoverage===!1,alphaMap:se,alphaTest:oe,alphaHash:Te,combine:v.combine,mapUv:$&&d(v.map.channel),aoMapUv:ot&&d(v.aoMap.channel),lightMapUv:ft&&d(v.lightMap.channel),bumpMapUv:Tt&&d(v.bumpMap.channel),normalMapUv:mt&&d(v.normalMap.channel),displacementMapUv:kn&&d(v.displacementMap.channel),emissiveMapUv:Dt&&d(v.emissiveMap.channel),metalnessMapUv:dn&&d(v.metalnessMap.channel),roughnessMapUv:pn&&d(v.roughnessMap.channel),anisotropyMapUv:Fe&&d(v.anisotropyMap.channel),clearcoatMapUv:P&&d(v.clearcoatMap.channel),clearcoatNormalMapUv:S&&d(v.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:H&&d(v.clearcoatRoughnessMap.channel),diffuseRoughnessMapUv:ne&&d(v.diffuseRoughnessMap.channel),iridescenceMapUv:te&&d(v.iridescenceMap.channel),iridescenceThicknessMapUv:re&&d(v.iridescenceThicknessMap.channel),sheenColorMapUv:he&&d(v.sheenColorMap.channel),sheenRoughnessMapUv:J&&d(v.sheenRoughnessMap.channel),specularMapUv:Q&&d(v.specularMap.channel),specularColorMapUv:ae&&d(v.specularColorMap.channel),specularIntensityMapUv:I&&d(v.specularIntensityMap.channel),transmissionMapUv:ee&&d(v.transmissionMap.channel),thicknessMapUv:Z&&d(v.thicknessMap.channel),alphaMapUv:se&&d(v.alphaMap.channel),vertexTangents:!!A.attributes.tangent&&(mt||mn),vertexNormals:!!A.attributes.normal,vertexColors:v.vertexColors,vertexAlphas:v.vertexColors===!0&&!!A.attributes.color&&A.attributes.color.itemSize===4,pointsUvs:L.isPoints===!0&&!!A.attributes.uv&&($||se),fog:!!B,useFog:v.fog===!0,fogExp2:!!B&&B.isFogExp2,flatShading:v.wireframe===!1&&(v.flatShading===!0||A.attributes.normal===void 0&&mt===!1&&(v.isMeshLambertMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isMeshPhysicalMaterial)),sizeAttenuation:v.sizeAttenuation===!0,logarithmicDepthBuffer:u,reversedDepthBuffer:me,skinning:L.isSkinnedMesh===!0,hasPositionAttribute:A.attributes.position!==void 0,morphTargets:A.morphAttributes.position!==void 0,morphNormals:A.morphAttributes.normal!==void 0,morphColors:A.morphAttributes.color!==void 0,morphTargetsCount:j,morphTextureStride:de,numSunLights:_.sun.length,numDirLights:_.directional.length,numPointLights:_.point.length,numSpotLights:_.spot.length,numSpotLightMaps:_.spotLightMap.length,numRectAreaLights:_.rectArea.length,numHemiLights:_.hemi.length,numSunLightShadows:_.sunShadowMap.length,numDirLightShadows:_.directionalShadowMap.length,numPointLightShadows:_.pointShadowMap.length,numSpotLightShadows:_.spotShadowMap.length,numSpotLightShadowsWithMaps:_.numSpotLightShadowsWithMaps,numLightProbes:_.numLightProbes,numLightProbeGrids:D.filter(ge=>ge.texture!==null).length,numClippingPlanes:r.numPlanes,numClipIntersection:r.numIntersection,dithering:v.dithering,shadowMapEnabled:n.shadowMap.enabled&&R.length>0,shadowMapType:n.shadowMap.type,toneMapping:ie,decodeVideoTexture:$&&v.map.isVideoTexture===!0&&qe.getTransfer(v.map.colorSpace)===st,decodeVideoTextureEmissive:Dt&&v.emissiveMap.isVideoTexture===!0&&qe.getTransfer(v.emissiveMap.colorSpace)===st,premultipliedAlpha:v.premultipliedAlpha,doubleSided:v.side===qn,flipSided:v.side===kt,useDepthPacking:v.depthPacking>=0,depthPacking:v.depthPacking||0,index0AttributeName:v.index0AttributeName,extensionClipCullDistance:Ge&&v.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(Ge&&v.extensions.multiDraw===!0||ut)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:v.customProgramCacheKey()};return ke.vertexUv1s=c.has(1),ke.vertexUv2s=c.has(2),ke.vertexUv3s=c.has(3),c.clear(),ke}function x(v){const _=[];if(v.shaderID?_.push(v.shaderID):(_.push(v.customVertexShaderID),_.push(v.customFragmentShaderID)),v.defines!==void 0)for(const R in v.defines)_.push(R),_.push(v.defines[R]);return v.isRawShaderMaterial===!1&&(m(_,v),g(_,v),_.push(n.outputColorSpace)),_.push(v.customProgramCacheKey),_.join()}function m(v,_){v.push(_.precision),v.push(_.outputColorSpace),v.push(_.envMapMode),v.push(_.envMapPMREM),v.push(_.envMapMaxLod),v.push(_.envMapSize),v.push(_.mapUv),v.push(_.alphaMapUv),v.push(_.lightMapUv),v.push(_.aoMapUv),v.push(_.bumpMapUv),v.push(_.normalMapUv),v.push(_.displacementMapUv),v.push(_.emissiveMapUv),v.push(_.metalnessMapUv),v.push(_.roughnessMapUv),v.push(_.anisotropyMapUv),v.push(_.clearcoatMapUv),v.push(_.clearcoatNormalMapUv),v.push(_.clearcoatRoughnessMapUv),v.push(_.diffuseRoughnessMapUv),v.push(_.iridescenceMapUv),v.push(_.iridescenceThicknessMapUv),v.push(_.sheenColorMapUv),v.push(_.sheenRoughnessMapUv),v.push(_.specularMapUv),v.push(_.specularColorMapUv),v.push(_.specularIntensityMapUv),v.push(_.transmissionMapUv),v.push(_.thicknessMapUv),v.push(_.combine),v.push(_.fogExp2),v.push(_.sizeAttenuation),v.push(_.morphTargetsCount),v.push(_.numSunLights),v.push(_.numDirLights),v.push(_.numPointLights),v.push(_.numSpotLights),v.push(_.numSpotLightMaps),v.push(_.numHemiLights),v.push(_.numRectAreaLights),v.push(_.numSunLightShadows),v.push(_.numDirLightShadows),v.push(_.numPointLightShadows),v.push(_.numSpotLightShadows),v.push(_.numSpotLightShadowsWithMaps),v.push(_.numLightProbes),v.push(_.numLightProbeGrids),v.push(_.shadowMapType),v.push(_.toneMapping),v.push(_.numClippingPlanes),v.push(_.numClipIntersection),v.push(_.depthPacking)}function g(v,_){o.disableAll(),_.instancing&&o.enable(0),_.instancingColor&&o.enable(1),_.instancingMorph&&o.enable(2),_.matcap&&o.enable(3),_.envMap&&o.enable(4),_.normalMapObjectSpace&&o.enable(5),_.normalMapTangentSpace&&o.enable(6),_.clearcoat&&o.enable(7),_.iridescence&&o.enable(8),_.alphaTest&&o.enable(9),_.vertexColors&&o.enable(10),_.vertexAlphas&&o.enable(11),_.vertexUv1s&&o.enable(12),_.vertexUv2s&&o.enable(13),_.vertexUv3s&&o.enable(14),_.vertexTangents&&o.enable(15),_.anisotropy&&o.enable(16),_.alphaHash&&o.enable(17),_.batching&&o.enable(18),_.dispersion&&o.enable(19),_.retroreflection&&o.enable(24),_.diffuseRoughness&&o.enable(25),_.batchingColor&&o.enable(20),_.gradientMap&&o.enable(21),_.packedNormalMap&&o.enable(22),_.vertexNormals&&o.enable(23),v.push(o.mask),o.disableAll(),_.fog&&o.enable(0),_.useFog&&o.enable(1),_.flatShading&&o.enable(2),_.logarithmicDepthBuffer&&o.enable(3),_.reversedDepthBuffer&&o.enable(4),_.skinning&&o.enable(5),_.morphTargets&&o.enable(6),_.morphNormals&&o.enable(7),_.morphColors&&o.enable(8),_.premultipliedAlpha&&o.enable(9),_.shadowMapEnabled&&o.enable(10),_.doubleSided&&o.enable(11),_.flipSided&&o.enable(12),_.useDepthPacking&&o.enable(13),_.dithering&&o.enable(14),_.transmission&&o.enable(15),_.sheen&&o.enable(16),_.opaque&&o.enable(17),_.pointsUvs&&o.enable(18),_.decodeVideoTexture&&o.enable(19),_.decodeVideoTextureEmissive&&o.enable(20),_.alphaToCoverage&&o.enable(21),_.numLightProbeGrids>0&&o.enable(22),_.hasPositionAttribute&&o.enable(23),v.push(o.mask)}function M(v){const _=f[v.type];let R;if(_){const C=Wn[_];R=LM.clone(C.uniforms)}else R=v.uniforms;return R}function E(v,_){let R=h.get(_);return R!==void 0?++R.usedTimes:(R=new jw(n,_,v,s),l.push(R),h.set(_,R)),R}function y(v){if(--v.usedTimes===0){const _=l.indexOf(v);l[_]=l[l.length-1],l.pop(),h.delete(v.cacheKey),v.destroy()}}function T(v){a.remove(v)}function b(){a.dispose()}return{getParameters:p,getProgramCacheKey:x,getUniforms:M,acquireProgram:E,releaseProgram:y,releaseShaderCache:T,programs:l,dispose:b}}function rE(){let n=new WeakMap;function e(o){return n.has(o)}function t(o){let a=n.get(o);return a===void 0&&(a={},n.set(o,a)),a}function i(o){n.delete(o)}function s(o,a,c){n.get(o)[a]=c}function r(){n=new WeakMap}return{has:e,get:t,remove:i,update:s,dispose:r}}function oE(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.material.id!==e.material.id?n.material.id-e.material.id:n.materialVariant!==e.materialVariant?n.materialVariant-e.materialVariant:n.z!==e.z?n.z-e.z:n.id-e.id}function Xf(n,e){return n.groupOrder!==e.groupOrder?n.groupOrder-e.groupOrder:n.renderOrder!==e.renderOrder?n.renderOrder-e.renderOrder:n.z!==e.z?e.z-n.z:n.id-e.id}function qf(){const n=[];let e=0;const t=[],i=[],s=[];function r(){e=0,t.length=0,i.length=0,s.length=0}function o(f){let d=0;return f.isInstancedMesh&&(d+=2),f.isSkinnedMesh&&(d+=1),d}function a(f,d,p,x,m,g){let M=n[e];return M===void 0?(M={id:f.id,object:f,geometry:d,material:p,materialVariant:o(f),groupOrder:x,renderOrder:f.renderOrder,z:m,group:g},n[e]=M):(M.id=f.id,M.object=f,M.geometry=d,M.material=p,M.materialVariant=o(f),M.groupOrder=x,M.renderOrder=f.renderOrder,M.z=m,M.group=g),e++,M}function c(f,d,p,x,m,g,M){M.reversedDepth===!0&&(m=-m);const E=a(f,d,p,x,m,g);p.transmission>0?i.push(E):p.transparent===!0?s.push(E):t.push(E)}function l(f,d,p,x,m,g){const M=a(f,d,p,x,m,g);p.transmission>0?i.unshift(M):p.transparent===!0?s.unshift(M):t.unshift(M)}function h(f,d){t.length>1&&t.sort(f||oE),i.length>1&&i.sort(d||Xf),s.length>1&&s.sort(d||Xf)}function u(){for(let f=e,d=n.length;f<d;f++){const p=n[f];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:i,transparent:s,init:r,push:c,unshift:l,finish:u,sort:h}}function aE(){let n=new WeakMap;function e(i,s){const r=n.get(i);let o;return r===void 0?(o=new qf,n.set(i,[o])):s>=r.length?(o=new qf,r.push(o)):o=r[s],o}function t(){n=new WeakMap}return{get:e,dispose:t}}function lE(){const n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new z,color:new Qe};break;case"SpotLight":t={position:new z,direction:new z,color:new Qe,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new z,color:new Qe,distance:0,decay:0};break;case"HemisphereLight":t={direction:new z,skyColor:new Qe,groundColor:new Qe};break;case"RectAreaLight":t={color:new Qe,position:new z,halfWidth:new z,halfHeight:new z};break}return n[e.id]=t,t}}}function cE(){const n={};return{get:function(e){if(n[e.id]!==void 0)return n[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ze,shadowCameraNear:1,shadowCameraFar:1e3};break}return n[e.id]=t,t}}}let hE=0;function uE(n,e){return(e.castShadow?2:0)-(n.castShadow?2:0)+(e.map?1:0)-(n.map?1:0)}function fE(n){const e=new lE,t=cE(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)i.probe.push(new z);const s=new z,r=new Ve,o=new Ve;function a(l){let h=0,u=0,f=0;for(let D=0;D<9;D++)i.probe[D].set(0,0,0);let d=0,p=0,x=0,m=0,g=0,M=0,E=0,y=0,T=0,b=0,v=0,_=0,R=0,C=0;l.sort(uE);for(let D=0,B=l.length;D<B;D++){const A=l[D],F=A.color,O=A.intensity,N=A.distance;let q=null;if(A.shadow&&A.shadow.map&&(A.shadow.map.texture.format===vs?q=A.shadow.map.texture:q=A.shadow.map.depthTexture||A.shadow.map.texture),A.isAmbientLight)h+=F.r*O,u+=F.g*O,f+=F.b*O;else if(A.isLightProbe){for(let V=0;V<9;V++)i.probe[V].addScaledVector(A.sh.coefficients[V],O);C++}else if(A.isSunLight){const V=e.get(A);if(V.color.copy(A.color).multiplyScalar(A.intensity),A.castShadow){const X=A.shadow,j=t.get(A);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize.copy(X.mapSize).multiply(X.getFrameExtents()),i.sunShadow[p]=j,i.sunShadowMap[p]=q;const de=X.getViewportCount();for(let Re=0;Re<de;Re++)i.sunShadowMatrix[x+Re]=X.getMatrix(Re),i.sunShadowCascade[x+Re]=X._cascadeData[Re];x+=de,p++}i.sun[d]=V,d++}else if(A.isDirectionalLight){const V=e.get(A);if(V.color.copy(A.color).multiplyScalar(A.intensity),A.castShadow){const X=A.shadow,j=t.get(A);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,i.directionalShadow[m]=j,i.directionalShadowMap[m]=q,i.directionalShadowMatrix[m]=A.shadow.matrix,T++}i.directional[m]=V,m++}else if(A.isSpotLight){const V=e.get(A);V.position.setFromMatrixPosition(A.matrixWorld),V.color.copy(F).multiplyScalar(O),V.distance=N,V.coneCos=Math.cos(A.angle),V.penumbraCos=Math.cos(A.angle*(1-A.penumbra)),V.decay=A.decay,i.spot[M]=V;const X=A.shadow;if(A.map&&(i.spotLightMap[_]=A.map,_++,X.updateMatrices(A),A.castShadow&&R++),i.spotLightMatrix[M]=X.matrix,A.castShadow){const j=t.get(A);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,i.spotShadow[M]=j,i.spotShadowMap[M]=q,v++}M++}else if(A.isRectAreaLight){const V=e.get(A);V.color.copy(F).multiplyScalar(O),V.halfWidth.set(A.width*.5,0,0),V.halfHeight.set(0,A.height*.5,0),i.rectArea[E]=V,E++}else if(A.isPointLight){const V=e.get(A);if(V.color.copy(A.color).multiplyScalar(A.intensity),V.distance=A.distance,V.decay=A.decay,A.castShadow){const X=A.shadow,j=t.get(A);j.shadowIntensity=X.intensity,j.shadowBias=X.bias,j.shadowNormalBias=X.normalBias,j.shadowRadius=X.radius,j.shadowMapSize=X.mapSize,j.shadowCameraNear=X.camera.near,j.shadowCameraFar=X.camera.far,i.pointShadow[g]=j,i.pointShadowMap[g]=q,i.pointShadowMatrix[g]=A.shadow.matrix,b++}i.point[g]=V,g++}else if(A.isHemisphereLight){const V=e.get(A);V.skyColor.copy(A.color).multiplyScalar(O),V.groundColor.copy(A.groundColor).multiplyScalar(O),i.hemi[y]=V,y++}}E>0&&(n.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=ve.LTC_FLOAT_1,i.rectAreaLTC2=ve.LTC_FLOAT_2):(i.rectAreaLTC1=ve.LTC_HALF_1,i.rectAreaLTC2=ve.LTC_HALF_2)),i.ambient[0]=h,i.ambient[1]=u,i.ambient[2]=f;const L=i.hash;(L.sunLength!==d||L.directionalLength!==m||L.pointLength!==g||L.spotLength!==M||L.rectAreaLength!==E||L.hemiLength!==y||L.numSunShadows!==p||L.numDirectionalShadows!==T||L.numPointShadows!==b||L.numSpotShadows!==v||L.numSpotMaps!==_||L.numLightProbes!==C)&&(i.sun.length=d,i.directional.length=m,i.spot.length=M,i.rectArea.length=E,i.point.length=g,i.hemi.length=y,i.sunShadow.length=p,i.sunShadowMap.length=p,i.sunShadowMatrix.length=x,i.sunShadowCascade.length=x,i.directionalShadow.length=T,i.directionalShadowMap.length=T,i.directionalShadowMatrix.length=T,i.pointShadow.length=b,i.pointShadowMap.length=b,i.pointShadowMatrix.length=b,i.spotShadow.length=v,i.spotShadowMap.length=v,i.spotLightMatrix.length=v+_-R,i.spotLightMap.length=_,i.numSpotLightShadowsWithMaps=R,i.numLightProbes=C,L.sunLength=d,L.directionalLength=m,L.pointLength=g,L.spotLength=M,L.rectAreaLength=E,L.hemiLength=y,L.numSunShadows=p,L.numDirectionalShadows=T,L.numPointShadows=b,L.numSpotShadows=v,L.numSpotMaps=_,L.numLightProbes=C,i.version=hE++)}function c(l,h){let u=0,f=0,d=0,p=0,x=0,m=0;const g=h.matrixWorldInverse;for(let M=0,E=l.length;M<E;M++){const y=l[M];if(y.isSunLight){const T=i.sun[u];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),u++}else if(y.isDirectionalLight){const T=i.directional[f];T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),f++}else if(y.isSpotLight){const T=i.spot[p];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),T.direction.setFromMatrixPosition(y.matrixWorld),s.setFromMatrixPosition(y.target.matrixWorld),T.direction.sub(s),T.direction.transformDirection(g),p++}else if(y.isRectAreaLight){const T=i.rectArea[x];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),o.identity(),r.copy(y.matrixWorld),r.premultiply(g),o.extractRotation(r),T.halfWidth.set(y.width*.5,0,0),T.halfHeight.set(0,y.height*.5,0),T.halfWidth.applyMatrix4(o),T.halfHeight.applyMatrix4(o),x++}else if(y.isPointLight){const T=i.point[d];T.position.setFromMatrixPosition(y.matrixWorld),T.position.applyMatrix4(g),d++}else if(y.isHemisphereLight){const T=i.hemi[m];T.direction.setFromMatrixPosition(y.matrixWorld),T.direction.transformDirection(g),m++}}}return{setup:a,setupView:c,state:i}}function Yf(n){const e=new fE(n),t=[],i=[],s=[];function r(u){h.camera=u,t.length=0,i.length=0,s.length=0}function o(u){u.isLightProbeGrid?s.push(u):t.push(u)}function a(u){i.push(u)}function c(){e.setup(t),s.sort((u,f)=>u.priority-f.priority||u.id-f.id)}function l(u){e.setupView(t,u)}const h={lightsArray:t,shadowsArray:i,lightProbeGridArray:s,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:r,state:h,setupLights:c,setupLightsView:l,pushLight:o,pushShadow:a}}function dE(n){let e=new WeakMap;function t(s,r=0){const o=e.get(s);let a;return o===void 0?(a=new Yf(n),e.set(s,[a])):r>=o.length?(a=new Yf(n),o.push(a)):a=o[r],a}function i(){e=new WeakMap}return{get:t,dispose:i}}const pE=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,mE=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,gE=[new z(1,0,0),new z(-1,0,0),new z(0,1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1)],vE=[new z(0,-1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1),new z(0,-1,0),new z(0,-1,0)],Kf=new Ve,pr=new z,kl=new z;function _E(n,e,t){let i=new wa;const s=new ze,r=new ze,o=new ct,a=new FM,c=new UM,l={},h=t.maxTextureSize,u={[gs]:kt,[kt]:gs,[qn]:qn},f=new an({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ze},radius:{value:4}},vertexShader:pE,fragmentShader:mE}),d=f.clone();d.defines.HORIZONTAL_PASS=1;const p=new An;p.setAttribute("position",new Oi(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const x=new Ht(p,f),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Qo;let g=this.type;this.render=function(b,v,_){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||b.length===0)return;this.type===cx&&(De("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Qo);const R=n.getRenderTarget(),C=n.getActiveCubeFace(),L=n.getActiveMipmapLevel(),D=n.state;D.setBlending(Xs),D.buffers.depth.getReversed()===!0?D.buffers.color.setClear(0,0,0,0):D.buffers.color.setClear(1,1,1,1),D.buffers.depth.setTest(!0),D.setScissorTest(!1);const B=g!==this.type;B&&v.traverse(function(A){A.material&&(Array.isArray(A.material)?A.material.forEach(F=>F.needsUpdate=!0):A.material.needsUpdate=!0)});for(let A=0,F=b.length;A<F;A++){const O=b[A],N=O.shadow;if(N===void 0){De("WebGLShadowMap:",O,"has no shadow.");continue}if(N.autoUpdate===!1&&N.needsUpdate===!1)continue;s.copy(N.mapSize);const q=N.getFrameExtents();s.multiply(q),r.copy(N.mapSize),(s.x>h||s.y>h)&&(s.x>h&&(r.x=Math.floor(h/q.x),s.x=r.x*q.x,N.mapSize.x=r.x),s.y>h&&(r.y=Math.floor(h/q.y),s.y=r.y*q.y,N.mapSize.y=r.y));const V=n.state.buffers.depth.getReversed();if(N.camera._reversedDepth=V,N.map===null||B===!0){if(N.map!==null&&(N.map.depthTexture!==null&&(N.map.depthTexture.dispose(),N.map.depthTexture=null),N.map.dispose()),this.type===Mr){if(O.isPointLight){De("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}N.map=new On(s.x,s.y,{format:vs,type:Jn,minFilter:nn,magFilter:nn,generateMipmaps:!1}),N.map.texture.name=O.name+".shadowMap",N.map.depthTexture=new js(s.x,s.y,wn),N.map.depthTexture.name=O.name+".shadowMapDepth",N.map.depthTexture.format=Bi,N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=_t,N.map.depthTexture.magFilter=_t}else O.isPointLight?(N.map=new Ih(s.x),N.map.depthTexture=new om(s.x,Zn)):(N.map=new On(s.x,s.y),N.map.depthTexture=new js(s.x,s.y,Zn)),N.map.depthTexture.name=O.name+".shadowMap",N.map.depthTexture.format=Bi,this.type===Qo?(N.map.depthTexture.compareFunction=V?Xp:$p,N.map.depthTexture.minFilter=nn,N.map.depthTexture.magFilter=nn):(N.map.depthTexture.compareFunction=null,N.map.depthTexture.minFilter=_t,N.map.depthTexture.magFilter=_t);N.camera.updateProjectionMatrix()}N.map.isWebGLCubeRenderTarget!==!0&&(N.map.width!==s.x||N.map.height!==s.y)&&N.map.setSize(s.x,s.y);const X=N.map.isWebGLCubeRenderTarget?6:N.getViewportCount();O.isPointLight!==!0&&N.updateMatrices(O,_);const j=(N.camera.layers.mask&4294967294)!==0?N.camera.layers:_.layers;for(let de=0;de<X;de++){const Re=N.getCamera(de);if(O.isPointLight){const K=N.camera,fe=N.matrix,Me=O.distance||K.far;Me!==K.far&&(K.far=Me,K.updateProjectionMatrix()),pr.setFromMatrixPosition(O.matrixWorld),K.position.copy(pr),kl.copy(K.position),kl.add(gE[de]),K.up.copy(vE[de]),K.lookAt(kl),K.updateMatrixWorld(),fe.makeTranslation(-pr.x,-pr.y,-pr.z),Kf.multiplyMatrices(K.projectionMatrix,K.matrixWorldInverse),N._frustum.setFromProjectionMatrix(Kf,K.coordinateSystem,K.reversedDepth)}if(N.map.isWebGLCubeRenderTarget)n.setRenderTarget(N.map,de),n.clear();else{de===0&&(n.setRenderTarget(N.map),n.clear());const K=N.getViewport(de);o.set(r.x*K.x,r.y*K.y,r.x*K.z,r.y*K.w),D.viewport(o)}i=N.getFrustum(de),y(v,_,Re,O,j,this.type)}N.isPointLightShadow!==!0&&this.type===Mr&&M(N,_),N.needsUpdate=!1}g=this.type,m.needsUpdate=!1,n.setRenderTarget(R,C,L)};function M(b,v){const _=e.update(x);f.defines.VSM_SAMPLES!==b.blurSamples&&(f.defines.VSM_SAMPLES=b.blurSamples,d.defines.VSM_SAMPLES=b.blurSamples,f.needsUpdate=!0,d.needsUpdate=!0),b.mapPass===null?b.mapPass=new On(s.x,s.y,{format:vs,type:Jn}):(b.mapPass.width!==b.map.width||b.mapPass.height!==b.map.height)&&b.mapPass.setSize(b.map.width,b.map.height),f.uniforms.shadow_pass.value=b.map.depthTexture,f.uniforms.resolution.value.set(b.map.width,b.map.height),f.uniforms.radius.value=b.radius,n.setRenderTarget(b.mapPass),n.clear(),n.renderBufferDirect(v,null,_,f,x,null),d.uniforms.shadow_pass.value=b.mapPass.texture,d.uniforms.resolution.value.set(b.map.width,b.map.height),d.uniforms.radius.value=b.radius,n.setRenderTarget(b.map),n.clear(),n.renderBufferDirect(v,null,_,d,x,null)}function E(b,v,_,R){let C=null;const L=_.isPointLight===!0?b.customDistanceMaterial:b.customDepthMaterial;if(L!==void 0)C=L;else if(C=_.isPointLight===!0?c:a,n.localClippingEnabled&&v.clipShadows===!0&&Array.isArray(v.clippingPlanes)&&v.clippingPlanes.length!==0||v.displacementMap&&v.displacementScale!==0||v.alphaMap&&v.alphaTest>0||v.map&&v.alphaTest>0||v.alphaToCoverage===!0){const D=C.uuid,B=v.uuid;let A=l[D];A===void 0&&(A={},l[D]=A);let F=A[B];F===void 0&&(F=C.clone(),A[B]=F,v.addEventListener("dispose",T)),C=F}if(C.visible=v.visible,C.wireframe=v.wireframe,R===Mr?C.side=v.shadowSide!==null?v.shadowSide:v.side:C.side=v.shadowSide!==null?v.shadowSide:u[v.side],C.alphaMap=v.alphaMap,C.alphaTest=v.alphaToCoverage===!0?.5:v.alphaTest,C.map=v.map,C.clipShadows=v.clipShadows,C.clippingPlanes=v.clippingPlanes,C.clipIntersection=v.clipIntersection,C.displacementMap=v.displacementMap,C.displacementScale=v.displacementScale,C.displacementBias=v.displacementBias,C.wireframeLinewidth=v.wireframeLinewidth,C.linewidth=v.linewidth,_.isPointLight===!0&&C.isMeshDistanceMaterial===!0){const D=n.properties.get(C);D.light=_}return C}function y(b,v,_,R,C,L){if(b.visible===!1)return;if(b.layers.test(C)&&(b.isMesh||b.isLine||b.isPoints)&&(b.castShadow||b.receiveShadow&&L===Mr)&&(!b.frustumCulled||b.intersectsFrustum(i))){b.modelViewMatrix.multiplyMatrices(_.matrixWorldInverse,b.matrixWorld);const A=e.update(b),F=b.material;if(Array.isArray(F)){const O=A.groups;for(let N=0,q=O.length;N<q;N++){const V=O[N],X=F[V.materialIndex];if(X&&X.visible){const j=E(b,X,R,L);b.onBeforeShadow(n,b,v,_,A,j,V),n.renderBufferDirect(_,null,A,j,b,V),b.onAfterShadow(n,b,v,_,A,j,V)}}}else if(F.visible){const O=E(b,F,R,L);b.onBeforeShadow(n,b,v,_,A,O,null),n.renderBufferDirect(_,null,A,O,b,null),b.onAfterShadow(n,b,v,_,A,O,null)}}const B=b.children;for(let A=0,F=B.length;A<F;A++)y(B[A],v,_,R,C,L)}function T(b){b.target.removeEventListener("dispose",T);for(const _ in l){const R=l[_],C=b.target.uuid;C in R&&(R[C].dispose(),delete R[C])}}}function xE(n,e){function t(){let I=!1;const ee=new ct;let Z=null;const le=new ct(0,0,0,0);return{setMask:function(se){Z!==se&&!I&&(n.colorMask(se,se,se,se),Z=se)},setLocked:function(se){I=se},setClear:function(se,oe,Te,Ge,ie){ie===!0&&(se*=Ge,oe*=Ge,Te*=Ge),ee.set(se,oe,Te,Ge),le.equals(ee)===!1&&(n.clearColor(se,oe,Te,Ge),le.copy(ee))},reset:function(){I=!1,Z=null,le.set(-1,0,0,0)}}}function i(){let I=!1,ee=!1,Z=null,le=null,se=null;return{setReversed:function(oe){if(ee!==oe){const Te=e.get("EXT_clip_control");oe?Te.clipControlEXT(Te.LOWER_LEFT_EXT,Te.ZERO_TO_ONE_EXT):Te.clipControlEXT(Te.LOWER_LEFT_EXT,Te.NEGATIVE_ONE_TO_ONE_EXT),ee=oe;const Ge=se;se=null,this.setClear(Ge)}},getReversed:function(){return ee},setTest:function(oe){oe?me(n.DEPTH_TEST):Ne(n.DEPTH_TEST)},setMask:function(oe){Z!==oe&&!I&&(n.depthMask(oe),Z=oe)},setFunc:function(oe){if(ee&&(oe=Vx[oe]),le!==oe){switch(oe){case cc:n.depthFunc(n.NEVER);break;case hc:n.depthFunc(n.ALWAYS);break;case uc:n.depthFunc(n.LESS);break;case Hr:n.depthFunc(n.LEQUAL);break;case fc:n.depthFunc(n.EQUAL);break;case dc:n.depthFunc(n.GEQUAL);break;case pc:n.depthFunc(n.GREATER);break;case mc:n.depthFunc(n.NOTEQUAL);break;default:n.depthFunc(n.LEQUAL)}le=oe}},setLocked:function(oe){I=oe},setClear:function(oe){se!==oe&&(se=oe,ee&&(oe=1-oe),n.clearDepth(oe))},reset:function(){I=!1,Z=null,le=null,se=null,ee=!1}}}function s(){let I=!1,ee=null,Z=null,le=null,se=null,oe=null,Te=null,Ge=null,ie=null;return{setTest:function(Pe){I||(Pe?me(n.STENCIL_TEST):Ne(n.STENCIL_TEST))},setMask:function(Pe){ee!==Pe&&!I&&(n.stencilMask(Pe),ee=Pe)},setFunc:function(Pe,ke,ge){(Z!==Pe||le!==ke||se!==ge)&&(n.stencilFunc(Pe,ke,ge),Z=Pe,le=ke,se=ge)},setOp:function(Pe,ke,ge){(oe!==Pe||Te!==ke||Ge!==ge)&&(n.stencilOp(Pe,ke,ge),oe=Pe,Te=ke,Ge=ge)},setLocked:function(Pe){I=Pe},setClear:function(Pe){ie!==Pe&&(n.clearStencil(Pe),ie=Pe)},reset:function(){I=!1,ee=null,Z=null,le=null,se=null,oe=null,Te=null,Ge=null,ie=null}}}const r=new t,o=new i,a=new s;let c={};const l=new WeakMap;let h={},u={},f={},d=new WeakMap,p=[],x=null,m=!1,g=null,M=null,E=null,y=null,T=null,b=null,v=null,_=new Qe(0,0,0),R=0,C=!1,L=null,D=null,B=null,A=null,F=null;const O=n.getParameter(n.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let N=!1,q=0;const V=n.getParameter(n.VERSION);V.indexOf("WebGL")!==-1?(q=parseFloat(/^WebGL (\d)/.exec(V)[1]),N=q>=1):V.indexOf("OpenGL ES")!==-1&&(q=parseFloat(/^OpenGL ES (\d)/.exec(V)[1]),N=q>=2);let X=null,j={};const de=n.getParameter(n.SCISSOR_BOX),Re=n.getParameter(n.VIEWPORT),K=new ct().fromArray(de),fe=new ct().fromArray(Re);function Me(I,ee,Z,le){const se=new Uint8Array(4),oe=n.createTexture();n.bindTexture(I,oe),n.texParameteri(I,n.TEXTURE_MIN_FILTER,n.NEAREST),n.texParameteri(I,n.TEXTURE_MAG_FILTER,n.NEAREST);for(let Te=0;Te<Z;Te++)I===n.TEXTURE_3D||I===n.TEXTURE_2D_ARRAY?n.texImage3D(ee,0,n.RGBA,1,1,le,0,n.RGBA,n.UNSIGNED_BYTE,se):n.texImage2D(ee+Te,0,n.RGBA,1,1,0,n.RGBA,n.UNSIGNED_BYTE,se);return oe}const Ce={};Ce[n.TEXTURE_2D]=Me(n.TEXTURE_2D,n.TEXTURE_2D,1),Ce[n.TEXTURE_CUBE_MAP]=Me(n.TEXTURE_CUBE_MAP,n.TEXTURE_CUBE_MAP_POSITIVE_X,6),Ce[n.TEXTURE_2D_ARRAY]=Me(n.TEXTURE_2D_ARRAY,n.TEXTURE_2D_ARRAY,1,1),Ce[n.TEXTURE_3D]=Me(n.TEXTURE_3D,n.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),me(n.DEPTH_TEST),o.setFunc(Hr),Tt(!1),mt(Zu),me(n.CULL_FACE),ot(Xs);function me(I){h[I]!==!0&&(n.enable(I),h[I]=!0)}function Ne(I){h[I]!==!1&&(n.disable(I),h[I]=!1)}function ut(I,ee){return f[I]!==ee?(n.bindFramebuffer(I,ee),f[I]=ee,I===n.DRAW_FRAMEBUFFER&&(f[n.FRAMEBUFFER]=ee),I===n.FRAMEBUFFER&&(f[n.DRAW_FRAMEBUFFER]=ee),!0):!1}function $(I,ee){let Z=p,le=!1;if(I){Z=d.get(ee),Z===void 0&&(Z=[],d.set(ee,Z));const se=I.textures;if(Z.length!==se.length||Z[0]!==n.COLOR_ATTACHMENT0){for(let oe=0,Te=se.length;oe<Te;oe++)Z[oe]=n.COLOR_ATTACHMENT0+oe;Z.length=se.length,le=!0}}else Z[0]!==n.BACK&&(Z[0]=n.BACK,le=!0);le&&n.drawBuffers(Z)}function xe(I){return x!==I?(n.useProgram(I),x=I,!0):!1}const Le={[Vs]:n.FUNC_ADD,[ux]:n.FUNC_SUBTRACT,[fx]:n.FUNC_REVERSE_SUBTRACT};Le[dx]=n.MIN,Le[px]=n.MAX;const Ae={[mx]:n.ZERO,[gx]:n.ONE,[vx]:n.SRC_COLOR,[Rp]:n.SRC_ALPHA,[bx]:n.SRC_ALPHA_SATURATE,[yx]:n.DST_COLOR,[xx]:n.DST_ALPHA,[_x]:n.ONE_MINUS_SRC_COLOR,[Cp]:n.ONE_MINUS_SRC_ALPHA,[Sx]:n.ONE_MINUS_DST_COLOR,[Mx]:n.ONE_MINUS_DST_ALPHA,[wx]:n.CONSTANT_COLOR,[Ex]:n.ONE_MINUS_CONSTANT_COLOR,[Ax]:n.CONSTANT_ALPHA,[Tx]:n.ONE_MINUS_CONSTANT_ALPHA};function ot(I,ee,Z,le,se,oe,Te,Ge,ie,Pe){if(I===Xs){m===!0&&(Ne(n.BLEND),m=!1);return}if(m===!1&&(me(n.BLEND),m=!0),I!==hx){if(I!==g||Pe!==C){if((M!==Vs||T!==Vs)&&(n.blendEquation(n.FUNC_ADD),M=Vs,T=Vs),Pe)switch(I){case Nr:n.blendFuncSeparate(n.ONE,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case Ju:n.blendFunc(n.ONE,n.ONE);break;case Qu:n.blendFuncSeparate(n.ZERO,n.ONE_MINUS_SRC_COLOR,n.ZERO,n.ONE);break;case ju:n.blendFuncSeparate(n.DST_COLOR,n.ONE_MINUS_SRC_ALPHA,n.ZERO,n.ONE);break;default:et("WebGLState: Invalid blending: ",I);break}else switch(I){case Nr:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE_MINUS_SRC_ALPHA,n.ONE,n.ONE_MINUS_SRC_ALPHA);break;case Ju:n.blendFuncSeparate(n.SRC_ALPHA,n.ONE,n.ONE,n.ONE);break;case Qu:et("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case ju:et("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:et("WebGLState: Invalid blending: ",I);break}E=null,y=null,b=null,v=null,_.set(0,0,0),R=0,g=I,C=Pe}return}se=se||ee,oe=oe||Z,Te=Te||le,(ee!==M||se!==T)&&(n.blendEquationSeparate(Le[ee],Le[se]),M=ee,T=se),(Z!==E||le!==y||oe!==b||Te!==v)&&(n.blendFuncSeparate(Ae[Z],Ae[le],Ae[oe],Ae[Te]),E=Z,y=le,b=oe,v=Te),(Ge.equals(_)===!1||ie!==R)&&(n.blendColor(Ge.r,Ge.g,Ge.b,ie),_.copy(Ge),R=ie),g=I,C=!1}function ft(I,ee){I.side===qn?Ne(n.CULL_FACE):me(n.CULL_FACE);let Z=I.side===kt;ee&&(Z=!Z),Tt(Z),I.blending===Nr&&I.transparent===!1?ot(Xs):ot(I.blending,I.blendEquation,I.blendSrc,I.blendDst,I.blendEquationAlpha,I.blendSrcAlpha,I.blendDstAlpha,I.blendColor,I.blendAlpha,I.premultipliedAlpha),o.setFunc(I.depthFunc),o.setTest(I.depthTest),o.setMask(I.depthWrite),r.setMask(I.colorWrite);const le=I.stencilWrite;a.setTest(le),le&&(a.setMask(I.stencilWriteMask),a.setFunc(I.stencilFunc,I.stencilRef,I.stencilFuncMask),a.setOp(I.stencilFail,I.stencilZFail,I.stencilZPass)),Dt(I.polygonOffset,I.polygonOffsetFactor,I.polygonOffsetUnits),I.alphaToCoverage===!0?me(n.SAMPLE_ALPHA_TO_COVERAGE):Ne(n.SAMPLE_ALPHA_TO_COVERAGE)}function Tt(I){L!==I&&(I?n.frontFace(n.CW):n.frontFace(n.CCW),L=I)}function mt(I){I!==ax?(me(n.CULL_FACE),I!==D&&(I===Zu?n.cullFace(n.BACK):I===lx?n.cullFace(n.FRONT):n.cullFace(n.FRONT_AND_BACK))):Ne(n.CULL_FACE),D=I}function kn(I){I!==B&&(N&&n.lineWidth(I),B=I)}function Dt(I,ee,Z){I?(me(n.POLYGON_OFFSET_FILL),(A!==ee||F!==Z)&&(A=ee,F=Z,o.getReversed()&&(ee=-ee,Z=-Z),n.polygonOffset(ee,Z))):Ne(n.POLYGON_OFFSET_FILL)}function dn(I){I?me(n.SCISSOR_TEST):Ne(n.SCISSOR_TEST)}function pn(I){I===void 0&&(I=n.TEXTURE0+O-1),X!==I&&(n.activeTexture(I),X=I)}function mn(I,ee,Z){Z===void 0&&(X===null?Z=n.TEXTURE0+O-1:Z=X);let le=j[Z];le===void 0&&(le={type:void 0,texture:void 0},j[Z]=le),(le.type!==I||le.texture!==ee)&&(X!==Z&&(n.activeTexture(Z),X=Z),n.bindTexture(I,ee||Ce[I]),le.type=I,le.texture=ee)}function k(){const I=j[X];I!==void 0&&I.type!==void 0&&(n.bindTexture(I.type,null),I.type=void 0,I.texture=void 0)}function gn(){try{n.compressedTexImage2D(...arguments)}catch(I){et("WebGLState:",I)}}function dt(){try{n.compressedTexImage3D(...arguments)}catch(I){et("WebGLState:",I)}}function pt(){try{n.texSubImage2D(...arguments)}catch(I){et("WebGLState:",I)}}function pe(){try{n.texSubImage3D(...arguments)}catch(I){et("WebGLState:",I)}}function Rt(){try{n.compressedTexSubImage2D(...arguments)}catch(I){et("WebGLState:",I)}}function Ie(){try{n.compressedTexSubImage3D(...arguments)}catch(I){et("WebGLState:",I)}}function Fe(){try{n.texStorage2D(...arguments)}catch(I){et("WebGLState:",I)}}function P(){try{n.texStorage3D(...arguments)}catch(I){et("WebGLState:",I)}}function S(){try{n.texImage2D(...arguments)}catch(I){et("WebGLState:",I)}}function H(){try{n.texImage3D(...arguments)}catch(I){et("WebGLState:",I)}}function ne(I){return u[I]!==void 0?u[I]:n.getParameter(I)}function te(I,ee){u[I]!==ee&&(n.pixelStorei(I,ee),u[I]=ee)}function re(I){K.equals(I)===!1&&(n.scissor(I.x,I.y,I.z,I.w),K.copy(I))}function he(I){fe.equals(I)===!1&&(n.viewport(I.x,I.y,I.z,I.w),fe.copy(I))}function J(I,ee){let Z=l.get(ee);Z===void 0&&(Z=new WeakMap,l.set(ee,Z));let le=Z.get(I);le===void 0&&(le=n.getUniformBlockIndex(ee,I.name),n.uniformBlockBinding(ee,le,le),Z.set(I,le))}function Q(I,ee,Z){const se=l.get(ee).get(I);c[se]!==Z&&(n.bindBufferBase(n.UNIFORM_BUFFER,se,Z),c[se]=Z)}function ae(){n.disable(n.BLEND),n.disable(n.CULL_FACE),n.disable(n.DEPTH_TEST),n.disable(n.POLYGON_OFFSET_FILL),n.disable(n.SCISSOR_TEST),n.disable(n.STENCIL_TEST),n.disable(n.SAMPLE_ALPHA_TO_COVERAGE),n.blendEquation(n.FUNC_ADD),n.blendFunc(n.ONE,n.ZERO),n.blendFuncSeparate(n.ONE,n.ZERO,n.ONE,n.ZERO),n.blendColor(0,0,0,0),n.colorMask(!0,!0,!0,!0),n.clearColor(0,0,0,0),n.depthMask(!0),n.depthFunc(n.LESS),o.setReversed(!1),n.clearDepth(1),n.stencilMask(4294967295),n.stencilFunc(n.ALWAYS,0,4294967295),n.stencilOp(n.KEEP,n.KEEP,n.KEEP),n.clearStencil(0),n.cullFace(n.BACK),n.frontFace(n.CCW),n.polygonOffset(0,0),n.activeTexture(n.TEXTURE0),n.bindFramebuffer(n.FRAMEBUFFER,null),n.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),n.bindFramebuffer(n.READ_FRAMEBUFFER,null),n.useProgram(null),n.lineWidth(1),n.scissor(0,0,n.canvas.width,n.canvas.height),n.viewport(0,0,n.canvas.width,n.canvas.height),n.pixelStorei(n.PACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_ALIGNMENT,4),n.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,!1),n.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,n.BROWSER_DEFAULT_WEBGL),n.pixelStorei(n.PACK_ROW_LENGTH,0),n.pixelStorei(n.PACK_SKIP_PIXELS,0),n.pixelStorei(n.PACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_ROW_LENGTH,0),n.pixelStorei(n.UNPACK_IMAGE_HEIGHT,0),n.pixelStorei(n.UNPACK_SKIP_PIXELS,0),n.pixelStorei(n.UNPACK_SKIP_ROWS,0),n.pixelStorei(n.UNPACK_SKIP_IMAGES,0),h={},u={},X=null,j={},f={},c={},d=new WeakMap,p=[],x=null,m=!1,g=null,M=null,E=null,y=null,T=null,b=null,v=null,_=new Qe(0,0,0),R=0,C=!1,L=null,D=null,B=null,A=null,F=null,K.set(0,0,n.canvas.width,n.canvas.height),fe.set(0,0,n.canvas.width,n.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:me,disable:Ne,bindFramebuffer:ut,drawBuffers:$,useProgram:xe,setBlending:ot,setMaterial:ft,setFlipSided:Tt,setCullFace:mt,setLineWidth:kn,setPolygonOffset:Dt,setScissorTest:dn,activeTexture:pn,bindTexture:mn,unbindTexture:k,compressedTexImage2D:gn,compressedTexImage3D:dt,texImage2D:S,texImage3D:H,pixelStorei:te,getParameter:ne,updateUBOMapping:J,uniformBlockBinding:Q,texStorage2D:Fe,texStorage3D:P,texSubImage2D:pt,texSubImage3D:pe,compressedTexSubImage2D:Rt,compressedTexSubImage3D:Ie,scissor:re,viewport:he,reset:ae}}function ME(n,e,t,i,s,r,o){const a=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new ze,h=new WeakMap,u=new Set;let f;const d=new WeakMap,p=new Set,x=new FinalizationRegistry(P=>p.delete(P));let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(P,S){return m?new OffscreenCanvas(P,S):ba("canvas")}function M(P,S,H){let ne=1;const te=Fe(P);if((te.width>H||te.height>H)&&(ne=H/Math.max(te.width,te.height)),ne<1)if(typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&P instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&P instanceof ImageBitmap||typeof VideoFrame<"u"&&P instanceof VideoFrame){const re=Math.floor(ne*te.width),he=Math.floor(ne*te.height);f===void 0&&(f=g(re,he));const J=S?g(re,he):f;return J.width=re,J.height=he,J.getContext("2d").drawImage(P,0,0,re,he),De("WebGLRenderer: Texture has been resized from ("+te.width+"x"+te.height+") to ("+re+"x"+he+")."),J}else return"data"in P&&De("WebGLRenderer: Image in DataTexture is too big ("+te.width+"x"+te.height+")."),P;return P}function E(P){return P.generateMipmaps}function y(P){n.generateMipmap(P)}function T(P){return P.isWebGLCubeRenderTarget?n.TEXTURE_CUBE_MAP:P.isWebGL3DRenderTarget?n.TEXTURE_3D:P.isWebGLArrayRenderTarget||P.isCompressedArrayTexture?n.TEXTURE_2D_ARRAY:n.TEXTURE_2D}function b(P,S,H,ne,te,re=!1){if(P!==null){if(n[P]!==void 0)return n[P];De("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+P+"'")}let he;ne&&(he=e.get("EXT_texture_norm16"),he||De("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let J=S;if(S===n.RED&&(H===n.FLOAT&&(J=n.R32F),H===n.HALF_FLOAT&&(J=n.R16F),H===n.UNSIGNED_BYTE&&(J=n.R8),H===n.UNSIGNED_SHORT&&he&&(J=he.R16_EXT),H===n.SHORT&&he&&(J=he.R16_SNORM_EXT)),S===n.RED_INTEGER&&(H===n.UNSIGNED_BYTE&&(J=n.R8UI),H===n.UNSIGNED_SHORT&&(J=n.R16UI),H===n.UNSIGNED_INT&&(J=n.R32UI),H===n.BYTE&&(J=n.R8I),H===n.SHORT&&(J=n.R16I),H===n.INT&&(J=n.R32I)),S===n.RG&&(H===n.FLOAT&&(J=n.RG32F),H===n.HALF_FLOAT&&(J=n.RG16F),H===n.UNSIGNED_BYTE&&(J=n.RG8),H===n.UNSIGNED_SHORT&&he&&(J=he.RG16_EXT),H===n.SHORT&&he&&(J=he.RG16_SNORM_EXT)),S===n.RG_INTEGER&&(H===n.UNSIGNED_BYTE&&(J=n.RG8UI),H===n.UNSIGNED_SHORT&&(J=n.RG16UI),H===n.UNSIGNED_INT&&(J=n.RG32UI),H===n.BYTE&&(J=n.RG8I),H===n.SHORT&&(J=n.RG16I),H===n.INT&&(J=n.RG32I)),S===n.RGB_INTEGER&&(H===n.UNSIGNED_BYTE&&(J=n.RGB8UI),H===n.UNSIGNED_SHORT&&(J=n.RGB16UI),H===n.UNSIGNED_INT&&(J=n.RGB32UI),H===n.BYTE&&(J=n.RGB8I),H===n.SHORT&&(J=n.RGB16I),H===n.INT&&(J=n.RGB32I)),S===n.RGBA_INTEGER&&(H===n.UNSIGNED_BYTE&&(J=n.RGBA8UI),H===n.UNSIGNED_SHORT&&(J=n.RGBA16UI),H===n.UNSIGNED_INT&&(J=n.RGBA32UI),H===n.BYTE&&(J=n.RGBA8I),H===n.SHORT&&(J=n.RGBA16I),H===n.INT&&(J=n.RGBA32I)),S===n.RGB&&(H===n.UNSIGNED_SHORT&&he&&(J=he.RGB16_EXT),H===n.SHORT&&he&&(J=he.RGB16_SNORM_EXT),H===n.UNSIGNED_INT_5_9_9_9_REV&&(J=n.RGB9_E5),H===n.UNSIGNED_INT_10F_11F_11F_REV&&(J=n.R11F_G11F_B10F)),S===n.RGBA){const Q=re?ya:qe.getTransfer(te);H===n.FLOAT&&(J=n.RGBA32F),H===n.HALF_FLOAT&&(J=n.RGBA16F),H===n.UNSIGNED_BYTE&&(J=Q===st?n.SRGB8_ALPHA8:n.RGBA8),H===n.UNSIGNED_SHORT&&he&&(J=he.RGBA16_EXT),H===n.SHORT&&he&&(J=he.RGBA16_SNORM_EXT),H===n.UNSIGNED_SHORT_4_4_4_4&&(J=n.RGBA4),H===n.UNSIGNED_SHORT_5_5_5_1&&(J=n.RGB5_A1)}return(J===n.R16F||J===n.R32F||J===n.RG16F||J===n.RG32F||J===n.RGBA16F||J===n.RGBA32F)&&e.get("EXT_color_buffer_float"),J}function v(P,S){let H;return P?S===null||S===Zn||S===Qs?H=n.DEPTH24_STENCIL8:S===wn?H=n.DEPTH32F_STENCIL8:S===Wr&&(H=n.DEPTH24_STENCIL8,De("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):S===null||S===Zn||S===Qs?H=n.DEPTH_COMPONENT24:S===wn?H=n.DEPTH_COMPONENT32F:S===Wr&&(H=n.DEPTH_COMPONENT16),H}function _(P,S){return E(P)===!0||P.isFramebufferTexture&&P.minFilter!==_t&&P.minFilter!==nn?Math.log2(Math.max(S.width,S.height))+1:P.mipmaps.length>0?P.mipmaps.length:P.isCompressedTexture&&Array.isArray(P.image)?S.mipmaps.length:1}function R(P){const S=new WeakRef(P);i.get(P).__ref=S,p.add(S),x.register(P,S,S)}function C(P){const S=i.get(P).__ref;S!==void 0&&(p.delete(S),x.unregister(S))}function L(P){B(P.target)}function D(P){A(P.target)}function B(P){P.removeEventListener("dispose",L),C(P),O(P),P.isVideoTexture&&h.delete(P),P.isHTMLTexture&&u.delete(P)}function A(P){P.removeEventListener("dispose",D),C(P),q(P)}function F(){for(const P of p){const S=P.deref();S!==void 0&&(S.isRenderTarget===!0?A(S):B(S))}p.clear(),u.clear()}function O(P){const S=i.get(P);if(S.__webglInit===void 0)return;const H=P.source,ne=d.get(H);if(ne){const te=ne[S.__cacheKey];te.usedTimes--,te.usedTimes===0&&N(P),Object.keys(ne).length===0&&d.delete(H)}i.remove(P)}function N(P){const S=i.get(P);n.deleteTexture(S.__webglTexture);const H=P.source,ne=d.get(H);delete ne[S.__cacheKey],o.memory.textures--}function q(P){const S=i.get(P);S.__depthDisposeCallback&&S.__depthDisposeCallback();const H=P.depthTexture;if(H&&H.renderTarget===P&&B(H),P.isWebGLCubeRenderTarget)for(let te=0;te<6;te++){if(Array.isArray(S.__webglFramebuffer[te]))for(let re=0;re<S.__webglFramebuffer[te].length;re++)n.deleteFramebuffer(S.__webglFramebuffer[te][re]);else n.deleteFramebuffer(S.__webglFramebuffer[te]);S.__webglDepthbuffer&&n.deleteRenderbuffer(S.__webglDepthbuffer[te])}else{if(Array.isArray(S.__webglFramebuffer))for(let te=0;te<S.__webglFramebuffer.length;te++)n.deleteFramebuffer(S.__webglFramebuffer[te]);else n.deleteFramebuffer(S.__webglFramebuffer);if(S.__webglDepthbuffer&&n.deleteRenderbuffer(S.__webglDepthbuffer),S.__webglMultisampledFramebuffer&&n.deleteFramebuffer(S.__webglMultisampledFramebuffer),S.__webglColorRenderbuffer)for(let te=0;te<S.__webglColorRenderbuffer.length;te++)S.__webglColorRenderbuffer[te]&&n.deleteRenderbuffer(S.__webglColorRenderbuffer[te]);S.__webglDepthRenderbuffer&&n.deleteRenderbuffer(S.__webglDepthRenderbuffer)}const ne=P.textures;for(let te=0,re=ne.length;te<re;te++){const he=i.get(ne[te]);he.__webglTexture&&(n.deleteTexture(he.__webglTexture),o.memory.textures--),i.remove(ne[te])}i.remove(P)}let V=0;function X(){V=0}function j(){return V}function de(P){V=P}function Re(){const P=V;return P>=s.maxTextures&&De("WebGLTextures: Trying to use "+(P+1)+" texture units while this GPU supports only "+s.maxTextures),V+=1,P}function K(P){const S=[];return S.push(P.wrapS),S.push(P.wrapT),S.push(P.wrapR||0),S.push(P.magFilter),S.push(P.minFilter),S.push(P.anisotropy),S.push(P.internalFormat),S.push(P.format),S.push(P.type),S.push(P.generateMipmaps),S.push(P.mipmapsAutoUpdate),S.push(P.premultiplyAlpha),S.push(P.flipY),S.push(P.unpackAlignment),S.push(P.colorSpace),S.join()}function fe(P,S){const H=i.get(P);if(P.isVideoTexture&&Rt(P),P.isRenderTargetTexture===!1&&P.isExternalTexture!==!0&&P.version>0&&H.__version!==P.version){const ne=P.image;if(ne===null)De("WebGLRenderer: Texture marked for update but no image data found.");else if(ne.complete===!1)De("WebGLRenderer: Texture marked for update but image is incomplete");else{ft(H,P,S);return}}else P.isExternalTexture&&(H.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(n.TEXTURE_2D,H.__webglTexture,n.TEXTURE0+S)}function Me(P,S){const H=i.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&H.__version!==P.version){ft(H,P,S);return}else P.isExternalTexture&&(H.__webglTexture=P.sourceTexture?P.sourceTexture:null);t.bindTexture(n.TEXTURE_2D_ARRAY,H.__webglTexture,n.TEXTURE0+S)}function Ce(P,S){const H=i.get(P);if(P.isRenderTargetTexture===!1&&P.version>0&&H.__version!==P.version){ft(H,P,S);return}t.bindTexture(n.TEXTURE_3D,H.__webglTexture,n.TEXTURE0+S)}function me(P,S){const H=i.get(P);if(P.version>0&&H.__version!==P.version){Tt(H,P,S);return}t.bindTexture(n.TEXTURE_CUBE_MAP,H.__webglTexture,n.TEXTURE0+S)}const Ne={[gc]:n.REPEAT,[hi]:n.CLAMP_TO_EDGE,[vc]:n.MIRRORED_REPEAT},ut={[_t]:n.NEAREST,[Px]:n.NEAREST_MIPMAP_NEAREST,[yo]:n.NEAREST_MIPMAP_LINEAR,[nn]:n.LINEAR,[ml]:n.LINEAR_MIPMAP_NEAREST,[Ii]:n.LINEAR_MIPMAP_LINEAR},$={[Nx]:n.NEVER,[qp]:n.ALWAYS,[Fx]:n.LESS,[$p]:n.LEQUAL,[Ux]:n.EQUAL,[Xp]:n.GEQUAL,[Ox]:n.GREATER,[kx]:n.NOTEQUAL};function xe(P,S){if(S.type===wn&&e.has("OES_texture_float_linear")===!1&&(S.magFilter===nn||S.magFilter===ml||S.magFilter===yo||S.magFilter===Ii||S.minFilter===nn||S.minFilter===ml||S.minFilter===yo||S.minFilter===Ii)&&De("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),n.texParameteri(P,n.TEXTURE_WRAP_S,Ne[S.wrapS]),n.texParameteri(P,n.TEXTURE_WRAP_T,Ne[S.wrapT]),(P===n.TEXTURE_3D||P===n.TEXTURE_2D_ARRAY)&&n.texParameteri(P,n.TEXTURE_WRAP_R,Ne[S.wrapR]),n.texParameteri(P,n.TEXTURE_MAG_FILTER,ut[S.magFilter]),n.texParameteri(P,n.TEXTURE_MIN_FILTER,ut[S.minFilter]),S.compareFunction&&(n.texParameteri(P,n.TEXTURE_COMPARE_MODE,n.COMPARE_REF_TO_TEXTURE),n.texParameteri(P,n.TEXTURE_COMPARE_FUNC,$[S.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(S.magFilter===_t||S.minFilter!==yo&&S.minFilter!==Ii||S.type===wn&&e.has("OES_texture_float_linear")===!1)return;if(S.anisotropy>1||i.get(S).__currentAnisotropy){const H=e.get("EXT_texture_filter_anisotropic");n.texParameterf(P,H.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(S.anisotropy,s.getMaxAnisotropy())),i.get(S).__currentAnisotropy=S.anisotropy}}}function Le(P,S){let H=!1;P.__webglInit===void 0&&(P.__webglInit=!0,S.addEventListener("dispose",L),R(S));const ne=S.source;let te=d.get(ne);te===void 0&&(te={},d.set(ne,te));const re=K(S);if(re!==P.__cacheKey){te[re]===void 0&&(te[re]={texture:n.createTexture(),usedTimes:0},o.memory.textures++,H=!0),te[re].usedTimes++;const he=te[P.__cacheKey];he!==void 0&&(te[P.__cacheKey].usedTimes--,he.usedTimes===0&&N(S)),P.__cacheKey=re,P.__webglTexture=te[re].texture}return H}function Ae(P,S,H){return Math.floor(Math.floor(P/H)/S)}function ot(P,S,H,ne){const re=P.updateRanges;if(re.length===0)t.texSubImage2D(n.TEXTURE_2D,0,0,0,S.width,S.height,H,ne,S.data);else{re.sort((I,ee)=>I.start-ee.start);let he=0;for(let I=1;I<re.length;I++){const ee=re[he],Z=re[I],le=ee.start+ee.count,se=Ae(Z.start,S.width,4),oe=Ae(ee.start,S.width,4);Z.start<=le+1&&se===oe&&Ae(Z.start+Z.count-1,S.width,4)===se?ee.count=Math.max(ee.count,Z.start+Z.count-ee.start):(++he,re[he]=Z)}re.length=he+1;const J=t.getParameter(n.UNPACK_ROW_LENGTH),Q=t.getParameter(n.UNPACK_SKIP_PIXELS),ae=t.getParameter(n.UNPACK_SKIP_ROWS);t.pixelStorei(n.UNPACK_ROW_LENGTH,S.width);for(let I=0,ee=re.length;I<ee;I++){const Z=re[I],le=Math.floor(Z.start/4),se=Math.ceil(Z.count/4),oe=le%S.width,Te=Math.floor(le/S.width),Ge=se,ie=1;t.pixelStorei(n.UNPACK_SKIP_PIXELS,oe),t.pixelStorei(n.UNPACK_SKIP_ROWS,Te),t.texSubImage2D(n.TEXTURE_2D,0,oe,Te,Ge,ie,H,ne,S.data)}P.clearUpdateRanges(),t.pixelStorei(n.UNPACK_ROW_LENGTH,J),t.pixelStorei(n.UNPACK_SKIP_PIXELS,Q),t.pixelStorei(n.UNPACK_SKIP_ROWS,ae)}}function ft(P,S,H){let ne=n.TEXTURE_2D;(S.isDataArrayTexture||S.isCompressedArrayTexture)&&(ne=n.TEXTURE_2D_ARRAY),S.isData3DTexture&&(ne=n.TEXTURE_3D);const te=Le(P,S),re=S.source;t.bindTexture(ne,P.__webglTexture,n.TEXTURE0+H);const he=i.get(re);if(re.version!==he.__version||te===!0){if(t.activeTexture(n.TEXTURE0+H),(typeof ImageBitmap<"u"&&S.image instanceof ImageBitmap)===!1){const ie=qe.getPrimaries(qe.workingColorSpace),Pe=S.colorSpace===Pi?null:qe.getPrimaries(S.colorSpace),ke=S.colorSpace===Pi||ie===Pe?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,ke)}t.pixelStorei(n.UNPACK_ALIGNMENT,S.unpackAlignment);let Q=M(S.image,!1,s.maxTextureSize);Q=Ie(S,Q);const ae=r.convert(S.format,S.colorSpace),I=r.convert(S.type);let ee=b(S.internalFormat,ae,I,S.normalized,S.colorSpace,S.isVideoTexture);xe(ne,S);let Z;const le=S.mipmaps,se=S.isVideoTexture!==!0,oe=he.__version===void 0||te===!0,Te=re.dataReady,Ge=_(S,Q);if(S.isDepthTexture)ee=v(S.format===Di,S.type),oe&&(se?t.texStorage2D(n.TEXTURE_2D,1,ee,Q.width,Q.height):t.texImage2D(n.TEXTURE_2D,0,ee,Q.width,Q.height,0,ae,I,null));else if(S.isDataTexture)if(le.length>0){se&&oe&&t.texStorage2D(n.TEXTURE_2D,Ge,ee,le[0].width,le[0].height);for(let ie=0,Pe=le.length;ie<Pe;ie++)Z=le[ie],se?Te&&t.texSubImage2D(n.TEXTURE_2D,ie,0,0,Z.width,Z.height,ae,I,Z.data):t.texImage2D(n.TEXTURE_2D,ie,ee,Z.width,Z.height,0,ae,I,Z.data);S.generateMipmaps=!1}else se?(oe&&t.texStorage2D(n.TEXTURE_2D,Ge,ee,Q.width,Q.height),Te&&ot(S,Q,ae,I)):t.texImage2D(n.TEXTURE_2D,0,ee,Q.width,Q.height,0,ae,I,Q.data);else if(S.isCompressedTexture)if(S.isCompressedArrayTexture){se&&oe&&t.texStorage3D(n.TEXTURE_2D_ARRAY,Ge,ee,le[0].width,le[0].height,Q.depth);for(let ie=0,Pe=le.length;ie<Pe;ie++)if(Z=le[ie],S.format!==En)if(ae!==null)if(se){if(Te)if(S.layerUpdates.size>0){const ke=Rf(Z.width,Z.height,S.format,S.type);for(const ge of S.layerUpdates){const nt=Z.data.subarray(ge*ke/Z.data.BYTES_PER_ELEMENT,(ge+1)*ke/Z.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ie,0,0,ge,Z.width,Z.height,1,ae,nt)}}else t.compressedTexSubImage3D(n.TEXTURE_2D_ARRAY,ie,0,0,0,Z.width,Z.height,Q.depth,ae,Z.data)}else t.compressedTexImage3D(n.TEXTURE_2D_ARRAY,ie,ee,Z.width,Z.height,Q.depth,0,Z.data,0,0);else De("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else se?Te&&t.texSubImage3D(n.TEXTURE_2D_ARRAY,ie,0,0,0,Z.width,Z.height,Q.depth,ae,I,Z.data):t.texImage3D(n.TEXTURE_2D_ARRAY,ie,ee,Z.width,Z.height,Q.depth,0,ae,I,Z.data);S.layerUpdates.size>0&&S.clearLayerUpdates()}else{se&&oe&&t.texStorage2D(n.TEXTURE_2D,Ge,ee,le[0].width,le[0].height);for(let ie=0,Pe=le.length;ie<Pe;ie++)Z=le[ie],S.format!==En?ae!==null?se?Te&&t.compressedTexSubImage2D(n.TEXTURE_2D,ie,0,0,Z.width,Z.height,ae,Z.data):t.compressedTexImage2D(n.TEXTURE_2D,ie,ee,Z.width,Z.height,0,Z.data):De("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):se?Te&&t.texSubImage2D(n.TEXTURE_2D,ie,0,0,Z.width,Z.height,ae,I,Z.data):t.texImage2D(n.TEXTURE_2D,ie,ee,Z.width,Z.height,0,ae,I,Z.data)}else if(S.isDataArrayTexture)if(se){if(oe&&t.texStorage3D(n.TEXTURE_2D_ARRAY,Ge,ee,Q.width,Q.height,Q.depth),Te)if(S.layerUpdates.size>0){const ie=Rf(Q.width,Q.height,S.format,S.type);for(const Pe of S.layerUpdates){const ke=Q.data.subarray(Pe*ie/Q.data.BYTES_PER_ELEMENT,(Pe+1)*ie/Q.data.BYTES_PER_ELEMENT);t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,Pe,Q.width,Q.height,1,ae,I,ke)}S.clearLayerUpdates()}else t.texSubImage3D(n.TEXTURE_2D_ARRAY,0,0,0,0,Q.width,Q.height,Q.depth,ae,I,Q.data)}else t.texImage3D(n.TEXTURE_2D_ARRAY,0,ee,Q.width,Q.height,Q.depth,0,ae,I,Q.data);else if(S.isData3DTexture)se?(oe&&t.texStorage3D(n.TEXTURE_3D,Ge,ee,Q.width,Q.height,Q.depth),Te&&t.texSubImage3D(n.TEXTURE_3D,0,0,0,0,Q.width,Q.height,Q.depth,ae,I,Q.data)):t.texImage3D(n.TEXTURE_3D,0,ee,Q.width,Q.height,Q.depth,0,ae,I,Q.data);else if(S.isFramebufferTexture){if(oe)if(se)t.texStorage2D(n.TEXTURE_2D,Ge,ee,Q.width,Q.height);else{let ie=Q.width,Pe=Q.height;for(let ke=0;ke<Ge;ke++)t.texImage2D(n.TEXTURE_2D,ke,ee,ie,Pe,0,ae,I,null),ie>>=1,Pe>>=1}}else if(S.isHTMLTexture){if("texElementImage2D"in n){const ie=n.canvas;if(ie.hasAttribute("layoutsubtree")||ie.setAttribute("layoutsubtree","true"),Q.parentNode!==ie){ie.appendChild(Q),u.add(S),ie.onpaint=Pe=>{const ke=Pe.changedElements;for(const ge of u)ke.includes(ge.image)&&(ge.needsUpdate=!0)},ie.requestPaint();return}if(n.texElementImage2D.length===3)n.texElementImage2D(n.TEXTURE_2D,n.RGBA8,Q);else{const ke=n.RGBA,ge=n.RGBA,nt=n.UNSIGNED_BYTE;n.texElementImage2D(n.TEXTURE_2D,0,ke,ge,nt,Q)}n.texParameteri(n.TEXTURE_2D,n.TEXTURE_MIN_FILTER,n.LINEAR),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_S,n.CLAMP_TO_EDGE),n.texParameteri(n.TEXTURE_2D,n.TEXTURE_WRAP_T,n.CLAMP_TO_EDGE)}}else if(le.length>0){if(se&&oe){const ie=Fe(le[0]);t.texStorage2D(n.TEXTURE_2D,Ge,ee,ie.width,ie.height)}for(let ie=0,Pe=le.length;ie<Pe;ie++)Z=le[ie],se?Te&&t.texSubImage2D(n.TEXTURE_2D,ie,0,0,ae,I,Z):t.texImage2D(n.TEXTURE_2D,ie,ee,ae,I,Z);S.generateMipmaps=!1}else if(se){if(oe){const ie=Fe(Q);t.texStorage2D(n.TEXTURE_2D,Ge,ee,ie.width,ie.height)}Te&&t.texSubImage2D(n.TEXTURE_2D,0,0,0,ae,I,Q)}else t.texImage2D(n.TEXTURE_2D,0,ee,ae,I,Q);E(S)&&S.mipmapsAutoUpdate===!0&&y(ne),he.__version=re.version,S.onUpdate&&S.onUpdate(S)}P.__version=S.version}function Tt(P,S,H){if(S.image.length!==6)return;const ne=Le(P,S),te=S.source;t.bindTexture(n.TEXTURE_CUBE_MAP,P.__webglTexture,n.TEXTURE0+H);const re=i.get(te);if(te.version!==re.__version||ne===!0){t.activeTexture(n.TEXTURE0+H);const he=qe.getPrimaries(qe.workingColorSpace),J=S.colorSpace===Pi?null:qe.getPrimaries(S.colorSpace),Q=S.colorSpace===Pi||he===J?n.NONE:n.BROWSER_DEFAULT_WEBGL;t.pixelStorei(n.UNPACK_FLIP_Y_WEBGL,S.flipY),t.pixelStorei(n.UNPACK_PREMULTIPLY_ALPHA_WEBGL,S.premultiplyAlpha),t.pixelStorei(n.UNPACK_ALIGNMENT,S.unpackAlignment),t.pixelStorei(n.UNPACK_COLORSPACE_CONVERSION_WEBGL,Q);const ae=S.isCompressedTexture||S.image[0].isCompressedTexture,I=S.image[0]&&S.image[0].isDataTexture,ee=[];for(let ge=0;ge<6;ge++)!ae&&!I?ee[ge]=M(S.image[ge],!0,s.maxCubemapSize):ee[ge]=I?S.image[ge].image:S.image[ge],ee[ge]=Ie(S,ee[ge]);const Z=ee[0],le=r.convert(S.format,S.colorSpace),se=r.convert(S.type);let oe=b(S.internalFormat,le,se,S.normalized,S.colorSpace);const Te=S.isVideoTexture!==!0,Ge=re.__version===void 0||ne===!0,ie=te.dataReady;let Pe=_(S,Z);xe(n.TEXTURE_CUBE_MAP,S);let ke;if(S.isDepthTexture){if(oe=v(S.format===Di,S.type),Ge)if(Te)t.texStorage2D(n.TEXTURE_CUBE_MAP,1,oe,Z.width,Z.height);else for(let ge=0;ge<6;ge++)t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,oe,Z.width,Z.height,0,le,se,null)}else if(ae){Te&&Ge&&t.texStorage2D(n.TEXTURE_CUBE_MAP,Pe,oe,Z.width,Z.height);for(let ge=0;ge<6;ge++){ke=ee[ge].mipmaps;for(let nt=0;nt<ke.length;nt++){const Nt=ke[nt];S.format!==En?le!==null?Te?ie&&t.compressedTexSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt,0,0,Nt.width,Nt.height,le,Nt.data):t.compressedTexImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt,oe,Nt.width,Nt.height,0,Nt.data):De("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):Te?ie&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt,0,0,Nt.width,Nt.height,le,se,Nt.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt,oe,Nt.width,Nt.height,0,le,se,Nt.data)}}}else{if(ke=S.mipmaps,Te&&Ge){ke.length>0&&Pe++;const ge=Fe(ee[0]);t.texStorage2D(n.TEXTURE_CUBE_MAP,Pe,oe,ge.width,ge.height)}for(let ge=0;ge<6;ge++)if(I){Te?ie&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,0,0,ee[ge].width,ee[ge].height,le,se,ee[ge].data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,oe,ee[ge].width,ee[ge].height,0,le,se,ee[ge].data);for(let nt=0;nt<ke.length;nt++){const xi=ke[nt].image[ge].image;Te?ie&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt+1,0,0,xi.width,xi.height,le,se,xi.data):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt+1,oe,xi.width,xi.height,0,le,se,xi.data)}}else{Te?ie&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,0,0,le,se,ee[ge]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,0,oe,le,se,ee[ge]);for(let nt=0;nt<ke.length;nt++){const Nt=ke[nt];Te?ie&&t.texSubImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt+1,0,0,le,se,Nt.image[ge]):t.texImage2D(n.TEXTURE_CUBE_MAP_POSITIVE_X+ge,nt+1,oe,le,se,Nt.image[ge])}}}E(S)&&S.mipmapsAutoUpdate===!0&&y(n.TEXTURE_CUBE_MAP),re.__version=te.version,S.onUpdate&&S.onUpdate(S)}P.__version=S.version}function mt(P,S,H,ne,te,re){const he=r.convert(H.format,H.colorSpace),J=r.convert(H.type),Q=b(H.internalFormat,he,J,H.normalized,H.colorSpace),ae=i.get(S),I=i.get(H);if(I.__renderTarget=S,!ae.__hasExternalTextures){const ee=Math.max(1,S.width>>re),Z=Math.max(1,S.height>>re);te===n.TEXTURE_3D||te===n.TEXTURE_2D_ARRAY?t.texImage3D(te,re,Q,ee,Z,S.depth,0,he,J,null):t.texImage2D(te,re,Q,ee,Z,0,he,J,null)}t.bindFramebuffer(n.FRAMEBUFFER,P),pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ne,te,I.__webglTexture,0,pt(S)):(te===n.TEXTURE_2D||te>=n.TEXTURE_CUBE_MAP_POSITIVE_X&&te<=n.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&n.framebufferTexture2D(n.FRAMEBUFFER,ne,te,I.__webglTexture,re),t.bindFramebuffer(n.FRAMEBUFFER,null)}function kn(P,S,H){if(n.bindRenderbuffer(n.RENDERBUFFER,P),S.depthBuffer){const ne=S.depthTexture,te=ne&&ne.isDepthTexture?ne.type:null,re=v(S.stencilBuffer,te),he=S.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;pe(S)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,pt(S),re,S.width,S.height):H?n.renderbufferStorageMultisample(n.RENDERBUFFER,pt(S),re,S.width,S.height):n.renderbufferStorage(n.RENDERBUFFER,re,S.width,S.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,he,n.RENDERBUFFER,P)}else{const ne=S.textures;for(let te=0;te<ne.length;te++){const re=ne[te],he=r.convert(re.format,re.colorSpace),J=r.convert(re.type),Q=b(re.internalFormat,he,J,re.normalized,re.colorSpace);pe(S)?a.renderbufferStorageMultisampleEXT(n.RENDERBUFFER,pt(S),Q,S.width,S.height):H?n.renderbufferStorageMultisample(n.RENDERBUFFER,pt(S),Q,S.width,S.height):n.renderbufferStorage(n.RENDERBUFFER,Q,S.width,S.height)}}n.bindRenderbuffer(n.RENDERBUFFER,null)}function Dt(P,S,H){const ne=S.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(n.FRAMEBUFFER,P),!(S.depthTexture&&S.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const te=i.get(S.depthTexture);te.__renderTarget=S;const re=ne?S.depthTexture.image[0]:S.depthTexture.image;(!te.__webglTexture||re.width!==S.width||re.height!==S.height)&&(re.width=S.width,re.height=S.height,S.depthTexture.needsUpdate=!0),ne?me(S.depthTexture,0):fe(S.depthTexture,0);const he=te.__webglTexture,J=pt(S),Q=ne?n.TEXTURE_CUBE_MAP_POSITIVE_X+H:n.TEXTURE_2D,ae=S.depthTexture.format===Di?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;if(S.depthTexture.format===Bi)pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ae,Q,he,0,J):n.framebufferTexture2D(n.FRAMEBUFFER,ae,Q,he,0);else if(S.depthTexture.format===Di)pe(S)?a.framebufferTexture2DMultisampleEXT(n.FRAMEBUFFER,ae,Q,he,0,J):n.framebufferTexture2D(n.FRAMEBUFFER,ae,Q,he,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function dn(P){const S=i.get(P),H=P.isWebGLCubeRenderTarget===!0;if(S.__boundDepthTexture!==P.depthTexture){const ne=P.depthTexture;if(S.__depthDisposeCallback&&S.__depthDisposeCallback(),ne){const te=()=>{delete S.__boundDepthTexture,delete S.__depthDisposeCallback,ne.removeEventListener("dispose",te)};ne.addEventListener("dispose",te),S.__depthDisposeCallback=te}S.__boundDepthTexture=ne}if(P.depthTexture&&!S.__autoAllocateDepthBuffer)if(H)for(let ne=0;ne<6;ne++)Dt(S.__webglFramebuffer[ne],P,ne);else P.texture.mipmaps.length>0?Dt(S.__webglFramebuffer[0],P,0):Dt(S.__webglFramebuffer,P,0);else if(H){S.__webglDepthbuffer=[];for(let ne=0;ne<6;ne++)if(t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer[ne]),S.__webglDepthbuffer[ne]===void 0)S.__webglDepthbuffer[ne]=n.createRenderbuffer(),kn(S.__webglDepthbuffer[ne],P,!1);else{const te=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,re=S.__webglDepthbuffer[ne];n.bindRenderbuffer(n.RENDERBUFFER,re),n.framebufferRenderbuffer(n.FRAMEBUFFER,te,n.RENDERBUFFER,re)}}else if(P.texture.mipmaps.length>0?t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer[0]):t.bindFramebuffer(n.FRAMEBUFFER,S.__webglFramebuffer),S.__webglDepthbuffer===void 0)S.__webglDepthbuffer=n.createRenderbuffer(),kn(S.__webglDepthbuffer,P,!1);else{const te=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,re=S.__webglDepthbuffer;n.bindRenderbuffer(n.RENDERBUFFER,re),n.framebufferRenderbuffer(n.FRAMEBUFFER,te,n.RENDERBUFFER,re)}t.bindFramebuffer(n.FRAMEBUFFER,null)}function pn(P,S,H){const ne=i.get(P);S!==void 0&&mt(ne.__webglFramebuffer,P,P.texture,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,0),H!==void 0&&dn(P)}function mn(P){const S=P.texture,H=i.get(P),ne=i.get(S);P.addEventListener("dispose",D),R(P);const te=P.textures,re=P.isWebGLCubeRenderTarget===!0,he=te.length>1;if(he||(ne.__webglTexture===void 0&&(ne.__webglTexture=n.createTexture()),ne.__version=S.version,o.memory.textures++),re){H.__webglFramebuffer=[];for(let J=0;J<6;J++)if(S.mipmaps.length>0){H.__webglFramebuffer[J]=[];for(let Q=0;Q<S.mipmaps.length;Q++)H.__webglFramebuffer[J][Q]=n.createFramebuffer()}else H.__webglFramebuffer[J]=n.createFramebuffer()}else{if(S.mipmaps.length>0){H.__webglFramebuffer=[];for(let J=0;J<S.mipmaps.length;J++)H.__webglFramebuffer[J]=n.createFramebuffer()}else H.__webglFramebuffer=n.createFramebuffer();if(he)for(let J=0,Q=te.length;J<Q;J++){const ae=i.get(te[J]);ae.__webglTexture===void 0&&(ae.__webglTexture=n.createTexture(),o.memory.textures++)}if(P.samples>0&&pe(P)===!1){H.__webglMultisampledFramebuffer=n.createFramebuffer(),H.__webglColorRenderbuffer=[],t.bindFramebuffer(n.FRAMEBUFFER,H.__webglMultisampledFramebuffer);for(let J=0;J<te.length;J++){const Q=te[J];H.__webglColorRenderbuffer[J]=n.createRenderbuffer(),n.bindRenderbuffer(n.RENDERBUFFER,H.__webglColorRenderbuffer[J]);const ae=r.convert(Q.format,Q.colorSpace),I=r.convert(Q.type),ee=b(Q.internalFormat,ae,I,Q.normalized,Q.colorSpace,P.isXRRenderTarget===!0),Z=pt(P);n.renderbufferStorageMultisample(n.RENDERBUFFER,Z,ee,P.width,P.height),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+J,n.RENDERBUFFER,H.__webglColorRenderbuffer[J])}n.bindRenderbuffer(n.RENDERBUFFER,null),P.depthBuffer&&(H.__webglDepthRenderbuffer=n.createRenderbuffer(),kn(H.__webglDepthRenderbuffer,P,!0)),t.bindFramebuffer(n.FRAMEBUFFER,null)}}if(re){t.bindTexture(n.TEXTURE_CUBE_MAP,ne.__webglTexture),xe(n.TEXTURE_CUBE_MAP,S);for(let J=0;J<6;J++)if(S.mipmaps.length>0)for(let Q=0;Q<S.mipmaps.length;Q++)mt(H.__webglFramebuffer[J][Q],P,S,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+J,Q);else mt(H.__webglFramebuffer[J],P,S,n.COLOR_ATTACHMENT0,n.TEXTURE_CUBE_MAP_POSITIVE_X+J,0);E(S)?y(n.TEXTURE_CUBE_MAP):S.mipmaps.length>0&&n.texParameteri(n.TEXTURE_CUBE_MAP,n.TEXTURE_MAX_LEVEL,S.mipmaps.length-1),t.unbindTexture()}else if(he){for(let J=0,Q=te.length;J<Q;J++){const ae=te[J],I=i.get(ae);let ee=n.TEXTURE_2D;(P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(ee=P.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(ee,I.__webglTexture),xe(ee,ae),mt(H.__webglFramebuffer,P,ae,n.COLOR_ATTACHMENT0+J,ee,0),E(ae)&&y(ee)}t.unbindTexture()}else{let J=n.TEXTURE_2D;if((P.isWebGL3DRenderTarget||P.isWebGLArrayRenderTarget)&&(J=P.isWebGL3DRenderTarget?n.TEXTURE_3D:n.TEXTURE_2D_ARRAY),t.bindTexture(J,ne.__webglTexture),xe(J,S),S.mipmaps.length>0)for(let Q=0;Q<S.mipmaps.length;Q++)mt(H.__webglFramebuffer[Q],P,S,n.COLOR_ATTACHMENT0,J,Q);else mt(H.__webglFramebuffer,P,S,n.COLOR_ATTACHMENT0,J,0);E(S)?y(J):S.mipmaps.length>0&&n.texParameteri(J,n.TEXTURE_MAX_LEVEL,S.mipmaps.length-1),t.unbindTexture()}P.depthBuffer&&dn(P)}function k(P){const S=P.textures;for(let H=0,ne=S.length;H<ne;H++){const te=S[H];if(E(te)&&te.mipmapsAutoUpdate===!0){const re=T(P),he=i.get(te).__webglTexture;t.bindTexture(re,he),y(re),t.unbindTexture()}}}const gn=[];function dt(P){if(P.samples>0){if(pe(P)===!1){const S=P.textures,H=P.width,ne=P.height;let te=n.COLOR_BUFFER_BIT;const re=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT,he=i.get(P),J=S.length>1;if(J)for(let ae=0;ae<S.length;ae++)t.bindFramebuffer(n.FRAMEBUFFER,he.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ae,n.RENDERBUFFER,null),t.bindFramebuffer(n.FRAMEBUFFER,he.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+ae,n.TEXTURE_2D,null,0);t.bindFramebuffer(n.READ_FRAMEBUFFER,he.__webglMultisampledFramebuffer),P.texture.mipmaps.length>0?t.bindFramebuffer(n.DRAW_FRAMEBUFFER,he.__webglFramebuffer[0]):t.bindFramebuffer(n.DRAW_FRAMEBUFFER,he.__webglFramebuffer);for(let ae=0;ae<S.length;ae++){if(P.resolveDepthBuffer&&(P.depthBuffer&&(te|=n.DEPTH_BUFFER_BIT),P.stencilBuffer&&P.resolveStencilBuffer&&(te|=n.STENCIL_BUFFER_BIT)),J){n.framebufferRenderbuffer(n.READ_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.RENDERBUFFER,he.__webglColorRenderbuffer[ae]);const I=i.get(S[ae]).__webglTexture;n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0,n.TEXTURE_2D,I,0)}n.blitFramebuffer(0,0,H,ne,0,0,H,ne,te,n.NEAREST),c===!0&&(gn.length=0,gn.push(n.COLOR_ATTACHMENT0+ae),P.depthBuffer&&P.storeMultisampledDepthBuffer===!1&&gn.push(re),n.invalidateFramebuffer(n.READ_FRAMEBUFFER,gn))}if(t.bindFramebuffer(n.READ_FRAMEBUFFER,null),t.bindFramebuffer(n.DRAW_FRAMEBUFFER,null),J)for(let ae=0;ae<S.length;ae++){t.bindFramebuffer(n.FRAMEBUFFER,he.__webglMultisampledFramebuffer),n.framebufferRenderbuffer(n.FRAMEBUFFER,n.COLOR_ATTACHMENT0+ae,n.RENDERBUFFER,he.__webglColorRenderbuffer[ae]);const I=i.get(S[ae]).__webglTexture;t.bindFramebuffer(n.FRAMEBUFFER,he.__webglFramebuffer),n.framebufferTexture2D(n.DRAW_FRAMEBUFFER,n.COLOR_ATTACHMENT0+ae,n.TEXTURE_2D,I,0)}t.bindFramebuffer(n.DRAW_FRAMEBUFFER,he.__webglMultisampledFramebuffer)}else if(P.depthBuffer&&P.storeMultisampledDepthBuffer===!1&&c){const S=P.stencilBuffer?n.DEPTH_STENCIL_ATTACHMENT:n.DEPTH_ATTACHMENT;n.invalidateFramebuffer(n.DRAW_FRAMEBUFFER,[S])}}}function pt(P){return Math.min(s.maxSamples,P.samples)}function pe(P){const S=i.get(P);return P.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&S.__useRenderToTexture!==!1}function Rt(P){const S=o.render.frame;h.get(P)!==S&&(h.set(P,S),P.update())}function Ie(P,S){const H=P.colorSpace,ne=P.format,te=P.type;return P.isCompressedTexture===!0||P.isVideoTexture===!0||H!==$r&&H!==Pi&&(qe.getTransfer(H)===st?(ne!==En||te!==fn)&&De("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):et("WebGLTextures: Unsupported texture color space:",H)),S}function Fe(P){return typeof HTMLImageElement<"u"&&P instanceof HTMLImageElement?(l.width=P.naturalWidth||P.width,l.height=P.naturalHeight||P.height):typeof VideoFrame<"u"&&P instanceof VideoFrame?(l.width=P.displayWidth,l.height=P.displayHeight):(l.width=P.width,l.height=P.height),l}this.allocateTextureUnit=Re,this.resetTextureUnits=X,this.getTextureUnits=j,this.setTextureUnits=de,this.setTexture2D=fe,this.setTexture2DArray=Me,this.setTexture3D=Ce,this.setTextureCube=me,this.rebindTextures=pn,this.setupRenderTarget=mn,this.updateRenderTargetMipmap=k,this.updateMultisampleRenderTarget=dt,this.setupDepthRenderbuffer=dn,this.setupFrameBufferTexture=mt,this.useMultisampledRTT=pe,this.dispose=F}function yE(n,e){function t(i,s=Pi){let r;const o=qe.getTransfer(s);if(i===fn)return n.UNSIGNED_BYTE;if(i===yh)return n.UNSIGNED_SHORT_4_4_4_4;if(i===Sh)return n.UNSIGNED_SHORT_5_5_5_1;if(i===Gp)return n.UNSIGNED_INT_5_9_9_9_REV;if(i===Hp)return n.UNSIGNED_INT_10F_11F_11F_REV;if(i===Bp)return n.BYTE;if(i===zp)return n.SHORT;if(i===Wr)return n.UNSIGNED_SHORT;if(i===Mh)return n.INT;if(i===Zn)return n.UNSIGNED_INT;if(i===wn)return n.FLOAT;if(i===Jn)return n.HALF_FLOAT;if(i===Vp)return n.ALPHA;if(i===Wp)return n.RGB;if(i===En)return n.RGBA;if(i===Bi)return n.DEPTH_COMPONENT;if(i===Di)return n.DEPTH_STENCIL;if(i===bh)return n.RED;if(i===wh)return n.RED_INTEGER;if(i===vs)return n.RG;if(i===Eh)return n.RG_INTEGER;if(i===Ah)return n.RGBA_INTEGER;if(i===jo||i===ea||i===ta||i===na)if(o===st)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(i===jo)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===ea)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===ta)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===na)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(i===jo)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===ea)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===ta)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===na)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===_c||i===xc||i===Mc||i===yc)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(i===_c)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===xc)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===Mc)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===yc)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===Sc||i===bc||i===wc||i===Ec||i===Ac||i===xa||i===Tc)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(i===Sc||i===bc)return o===st?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(i===wc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC;if(i===Ec)return r.COMPRESSED_R11_EAC;if(i===Ac)return r.COMPRESSED_SIGNED_R11_EAC;if(i===xa)return r.COMPRESSED_RG11_EAC;if(i===Tc)return r.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===Rc||i===Cc||i===Pc||i===Lc||i===Ic||i===Dc||i===Nc||i===Fc||i===Uc||i===Oc||i===kc||i===Bc||i===zc||i===Gc)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(i===Rc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===Cc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Pc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Lc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Ic)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Dc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Nc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Fc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Uc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Oc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===kc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===Bc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===zc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Gc)return o===st?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Hc||i===Vc||i===Wc)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(i===Hc)return o===st?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Vc)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===Wc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===$c||i===Xc||i===Ma||i===qc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(i===$c)return r.COMPRESSED_RED_RGTC1_EXT;if(i===Xc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Ma)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===qc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===Qs?n.UNSIGNED_INT_24_8:n[i]!==void 0?n[i]:null}return{convert:t}}const SE=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,bE=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class wE{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const i=new am(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,i=new an({vertexShader:SE,fragmentShader:bE,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Ht(new no(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class EE extends _s{constructor(e,t){super();const i=this;let s=null,r=1,o=null,a="local-floor",c=1,l=null,h=null,u=null,f=null,d=null,p=null;const x=typeof XRWebGLBinding<"u",m=new wE,g={},M=t.getContextAttributes();let E=null,y=null;const T=[],b=[],v=new ze;let _=null,R=null;const C=new In;C.viewport=new ct;const L=new In;L.viewport=new ct;const D=[C,L],B=new OM;let A=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(K){let fe=T[K];return fe===void 0&&(fe=new Sl,T[K]=fe),fe.getTargetRaySpace()},this.getControllerGrip=function(K){let fe=T[K];return fe===void 0&&(fe=new Sl,T[K]=fe),fe.getGripSpace()},this.getHand=function(K){let fe=T[K];return fe===void 0&&(fe=new Sl,T[K]=fe),fe.getHandSpace()};function O(K){const fe=b.indexOf(K.inputSource);if(fe===-1)return;const Me=T[fe];Me!==void 0&&(Me.update(K.inputSource,K.frame,l||o),Me.dispatchEvent({type:K.type,data:K.inputSource}))}function N(){s.removeEventListener("select",O),s.removeEventListener("selectstart",O),s.removeEventListener("selectend",O),s.removeEventListener("squeeze",O),s.removeEventListener("squeezestart",O),s.removeEventListener("squeezeend",O),s.removeEventListener("end",N),s.removeEventListener("inputsourceschange",q);for(let K=0;K<T.length;K++){const fe=b[K];fe!==null&&(b[K]=null,T[K].disconnect(fe))}A=null,F=null,m.reset();for(const K in g)delete g[K];if(e.setRenderTarget(E),d=null,f=null,u=null,s=null,y=null,Re.stop(),i.isPresenting=!1,e.setPixelRatio(_),e.setSize(v.width,v.height,!1),R!==null){const K=R.camera;K.fov=R.fov,K.zoom=R.zoom,K.updateProjectionMatrix(),R=null}i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(K){r=K,i.isPresenting===!0&&De("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(K){a=K,i.isPresenting===!0&&De("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function(K){l=K},this.getBaseLayer=function(){return f!==null?f:d},this.getBinding=function(){return u===null&&x&&(u=new XRWebGLBinding(s,t)),u},this.getFrame=function(){return p},this.getSession=function(){return s},this.setSession=async function(K){if(s=K,s!==null){if(E=e.getRenderTarget(),s.addEventListener("select",O),s.addEventListener("selectstart",O),s.addEventListener("selectend",O),s.addEventListener("squeeze",O),s.addEventListener("squeezestart",O),s.addEventListener("squeezeend",O),s.addEventListener("end",N),s.addEventListener("inputsourceschange",q),M.xrCompatible!==!0&&await t.makeXRCompatible(),_=e.getPixelRatio(),e.getSize(v),x&&"createProjectionLayer"in XRWebGLBinding.prototype){let Me=null,Ce=null,me=null;M.depth&&(me=M.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Me=M.stencil?Di:Bi,Ce=M.stencil?Qs:Zn);const Ne={colorFormat:t.RGBA8,depthFormat:me,scaleFactor:r};u=this.getBinding(),f=u.createProjectionLayer(Ne),s.updateRenderState({layers:[f]}),e.setPixelRatio(1),e.setSize(f.textureWidth,f.textureHeight,!1),y=new On(f.textureWidth,f.textureHeight,{format:En,type:fn,depthTexture:new js(f.textureWidth,f.textureHeight,Ce,void 0,void 0,void 0,void 0,void 0,void 0,Me),stencilBuffer:M.stencil,colorSpace:e.outputColorSpace,samples:M.antialias?4:0,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}else{const Me={antialias:M.antialias,alpha:!0,depth:M.depth,stencil:M.stencil,framebufferScaleFactor:r};d=new XRWebGLLayer(s,t,Me),s.updateRenderState({baseLayer:d}),e.setPixelRatio(1),e.setSize(d.framebufferWidth,d.framebufferHeight,!1),y=new On(d.framebufferWidth,d.framebufferHeight,{format:En,type:fn,colorSpace:e.outputColorSpace,stencilBuffer:M.stencil,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1,storeMultisampledDepthBuffer:d.ignoreDepthValues===!1,storeMultisampledStencilBuffer:d.ignoreDepthValues===!1})}y.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await s.requestReferenceSpace(a),Re.setContext(s),Re.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(s!==null)return s.environmentBlendMode},this.getDepthTexture=function(){return m.getDepthTexture()};function q(K){for(let fe=0;fe<K.removed.length;fe++){const Me=K.removed[fe],Ce=b.indexOf(Me);Ce>=0&&(b[Ce]=null,T[Ce].disconnect(Me))}for(let fe=0;fe<K.added.length;fe++){const Me=K.added[fe];let Ce=b.indexOf(Me);if(Ce===-1){for(let Ne=0;Ne<T.length;Ne++)if(Ne>=b.length){b.push(Me),Ce=Ne;break}else if(b[Ne]===null){b[Ne]=Me,Ce=Ne;break}if(Ce===-1)break}const me=T[Ce];me&&me.connect(Me)}}function V(K,fe){fe===null?K.matrixWorld.copy(K.matrix):K.matrixWorld.multiplyMatrices(fe.matrixWorld,K.matrix),K.matrixWorldInverse.copy(K.matrixWorld).invert()}this.updateCamera=function(K){if(s===null)return;let fe=K.near,Me=K.far;m.texture!==null&&(m.depthNear>0&&(fe=m.depthNear),m.depthFar>0&&(Me=m.depthFar)),B.near=L.near=C.near=fe,B.far=L.far=C.far=Me,(A!==B.near||F!==B.far)&&(s.updateRenderState({depthNear:B.near,depthFar:B.far}),A=B.near,F=B.far),B.layers.mask=K.layers.mask|6,C.layers.mask=B.layers.mask&-5,L.layers.mask=B.layers.mask&-3;const Ce=K.parent,me=B.cameras;V(B,Ce);for(let Ne=0;Ne<me.length;Ne++)V(me[Ne],Ce);B.projectionMatrix.copy(C.projectionMatrix),B.projectionMatrixInverse.copy(C.projectionMatrixInverse),R===null&&K.isPerspectiveCamera&&(R={camera:K,fov:K.fov,zoom:K.zoom}),X(K,B,Ce)};function X(K,fe,Me){Me===null?K.matrix.copy(fe.matrixWorld):(K.matrix.copy(Me.matrixWorld),K.matrix.invert(),K.matrix.multiply(fe.matrixWorld)),K.matrix.decompose(K.position,K.quaternion,K.scale),K.updateMatrixWorld(!0),K.projectionMatrix.copy(fe.projectionMatrix),K.projectionMatrixInverse.copy(fe.projectionMatrixInverse),K.isPerspectiveCamera&&(K.fov=Xr*2*Math.atan(1/K.projectionMatrix.elements[5]),K.zoom=1)}this.getCamera=function(){return B},this.getFoveation=function(){if(!(f===null&&d===null))return c},this.setFoveation=function(K){c=K,f!==null&&(f.fixedFoveation=K),d!==null&&d.fixedFoveation!==void 0&&(d.fixedFoveation=K)},this.hasDepthSensing=function(){return m.texture!==null},this.getDepthSensingMesh=function(){return m.getMesh(B)},this.getCameraTexture=function(K){return g[K]};let j=null;function de(K,fe){if(h=fe.getViewerPose(l||o),p=fe,h!==null){const Me=h.views;d!==null&&(e.setRenderTargetFramebuffer(y,d.framebuffer),e.setRenderTarget(y));let Ce=!1;Me.length!==B.cameras.length&&(B.cameras.length=0,Ce=!0);for(let $=0;$<Me.length;$++){const xe=Me[$];let Le=null;if(d!==null)Le=d.getViewport(xe);else{const ot=u.getViewSubImage(f,xe);Le=ot.viewport,$===0&&(e.setRenderTargetTextures(y,ot.colorTexture,ot.depthStencilTexture),e.setRenderTarget(y))}let Ae=D[$];Ae===void 0&&(Ae=new In,Ae.layers.enable($),Ae.viewport=new ct,D[$]=Ae),Ae.matrix.fromArray(xe.transform.matrix),Ae.matrix.decompose(Ae.position,Ae.quaternion,Ae.scale),Ae.projectionMatrix.fromArray(xe.projectionMatrix),Ae.projectionMatrixInverse.copy(Ae.projectionMatrix).invert(),Ae.viewport.set(Le.x,Le.y,Le.width,Le.height),$===0&&(B.matrix.copy(Ae.matrix),B.matrix.decompose(B.position,B.quaternion,B.scale)),Ce===!0&&B.cameras.push(Ae)}const me=s.enabledFeatures;if(me&&me.includes("depth-sensing")&&s.depthUsage=="gpu-optimized"&&x){u=i.getBinding();const $=u.getDepthInformation(Me[0]);$&&$.isValid&&$.texture&&m.init($,s.renderState)}if(me&&me.includes("camera-access")&&x){e.state.unbindTexture(),u=i.getBinding();for(let $=0;$<Me.length;$++){const xe=Me[$].camera;if(xe){let Le=g[xe];Le||(Le=new am,g[xe]=Le);const Ae=u.getCameraImage(xe);Le.sourceTexture=Ae}}}}for(let Me=0;Me<T.length;Me++){const Ce=b[Me],me=T[Me];Ce!==null&&me!==void 0&&me.update(Ce,fe,l||o)}j&&j(K,fe),fe.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:fe}),p=null}const Re=new um;Re.setAnimationLoop(de),this.setAnimationLoop=function(K){j=K},this.dispose=function(){}}}const AE=new Ve,ym=new Oe;ym.set(-1,0,0,0,1,0,0,0,1);function TE(n,e){function t(m,g){m.matrixAutoUpdate===!0&&m.updateMatrix(),g.value.copy(m.matrix)}function i(m,g){g.color.getRGB(m.fogColor.value,lm(n)),g.isFog?(m.fogNear.value=g.near,m.fogFar.value=g.far):g.isFogExp2&&(m.fogDensity.value=g.density)}function s(m,g,M,E,y){g.isNodeMaterial?g.uniformsNeedUpdate=!1:g.isMeshBasicMaterial?r(m,g):g.isMeshLambertMaterial?(r(m,g),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)):g.isMeshToonMaterial?(r(m,g),u(m,g)):g.isMeshPhongMaterial?(r(m,g),h(m,g),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)):g.isMeshStandardMaterial?(r(m,g),f(m,g),g.isMeshPhysicalMaterial&&d(m,g,y)):g.isMeshMatcapMaterial?(r(m,g),p(m,g)):g.isMeshDepthMaterial?r(m,g):g.isMeshDistanceMaterial?(r(m,g),x(m,g)):g.isMeshNormalMaterial?r(m,g):g.isLineBasicMaterial?(o(m,g),g.isLineDashedMaterial&&a(m,g)):g.isPointsMaterial?c(m,g,M,E):g.isSpriteMaterial?l(m,g):g.isShadowMaterial?(m.color.value.copy(g.color),m.opacity.value=g.opacity):g.isShaderMaterial&&(g.uniformsNeedUpdate=!1)}function r(m,g){m.opacity.value=g.opacity,g.color&&m.diffuse.value.copy(g.color),g.emissive&&m.emissive.value.copy(g.emissive).multiplyScalar(g.emissiveIntensity),g.map&&(m.map.value=g.map,t(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.bumpMap&&(m.bumpMap.value=g.bumpMap,t(g.bumpMap,m.bumpMapTransform),m.bumpScale.value=g.bumpScale,g.side===kt&&(m.bumpScale.value*=-1)),g.normalMap&&(m.normalMap.value=g.normalMap,t(g.normalMap,m.normalMapTransform),m.normalScale.value.copy(g.normalScale),g.side===kt&&m.normalScale.value.negate()),g.displacementMap&&(m.displacementMap.value=g.displacementMap,t(g.displacementMap,m.displacementMapTransform),m.displacementScale.value=g.displacementScale,m.displacementBias.value=g.displacementBias),g.emissiveMap&&(m.emissiveMap.value=g.emissiveMap,t(g.emissiveMap,m.emissiveMapTransform)),g.specularMap&&(m.specularMap.value=g.specularMap,t(g.specularMap,m.specularMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest);const M=e.get(g),E=M.envMap,y=M.envMapRotation;E&&(m.envMap.value=E,m.envMapRotation.value.setFromMatrix4(AE.makeRotationFromEuler(y)).transpose(),E.isCubeTexture&&E.isRenderTargetTexture===!1&&m.envMapRotation.value.premultiply(ym),m.reflectivity.value=g.reflectivity,m.ior.value=g.ior,m.refractionRatio.value=g.refractionRatio),g.lightMap&&(m.lightMap.value=g.lightMap,m.lightMapIntensity.value=g.lightMapIntensity,t(g.lightMap,m.lightMapTransform)),g.aoMap&&(m.aoMap.value=g.aoMap,m.aoMapIntensity.value=g.aoMapIntensity,t(g.aoMap,m.aoMapTransform))}function o(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,g.map&&(m.map.value=g.map,t(g.map,m.mapTransform))}function a(m,g){m.dashSize.value=g.dashSize,m.totalSize.value=g.dashSize+g.gapSize,m.scale.value=g.scale}function c(m,g,M,E){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.size.value=g.size*M,m.scale.value=E*.5,g.map&&(m.map.value=g.map,t(g.map,m.uvTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function l(m,g){m.diffuse.value.copy(g.color),m.opacity.value=g.opacity,m.rotation.value=g.rotation,g.map&&(m.map.value=g.map,t(g.map,m.mapTransform)),g.alphaMap&&(m.alphaMap.value=g.alphaMap,t(g.alphaMap,m.alphaMapTransform)),g.alphaTest>0&&(m.alphaTest.value=g.alphaTest)}function h(m,g){m.specular.value.copy(g.specular),m.shininess.value=Math.max(g.shininess,1e-4)}function u(m,g){g.gradientMap&&(m.gradientMap.value=g.gradientMap)}function f(m,g){m.metalness.value=g.metalness,g.metalnessMap&&(m.metalnessMap.value=g.metalnessMap,t(g.metalnessMap,m.metalnessMapTransform)),m.roughness.value=g.roughness,g.roughnessMap&&(m.roughnessMap.value=g.roughnessMap,t(g.roughnessMap,m.roughnessMapTransform)),g.envMap&&(m.envMapIntensity.value=g.envMapIntensity)}function d(m,g,M){m.ior.value=g.ior,g.diffuseRoughness>0&&(m.diffuseRoughness.value=g.diffuseRoughness,g.diffuseRoughnessMap&&(m.diffuseRoughnessMap.value=g.diffuseRoughnessMap,t(g.diffuseRoughnessMap,m.diffuseRoughnessMapTransform))),g.sheen>0&&(m.sheenColor.value.copy(g.sheenColor).multiplyScalar(g.sheen),m.sheenRoughness.value=g.sheenRoughness,g.sheenColorMap&&(m.sheenColorMap.value=g.sheenColorMap,t(g.sheenColorMap,m.sheenColorMapTransform)),g.sheenRoughnessMap&&(m.sheenRoughnessMap.value=g.sheenRoughnessMap,t(g.sheenRoughnessMap,m.sheenRoughnessMapTransform))),g.clearcoat>0&&(m.clearcoat.value=g.clearcoat,m.clearcoatRoughness.value=g.clearcoatRoughness,g.clearcoatMap&&(m.clearcoatMap.value=g.clearcoatMap,t(g.clearcoatMap,m.clearcoatMapTransform)),g.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=g.clearcoatRoughnessMap,t(g.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),g.clearcoatNormalMap&&(m.clearcoatNormalMap.value=g.clearcoatNormalMap,t(g.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(g.clearcoatNormalScale),g.side===kt&&m.clearcoatNormalScale.value.negate())),g.dispersion>0&&(m.dispersion.value=g.dispersion),g.retroreflectivity>0&&(m.retroreflectivity.value=g.retroreflectivity),g.iridescence>0&&(m.iridescence.value=g.iridescence,m.iridescenceIOR.value=g.iridescenceIOR,m.iridescenceThicknessMinimum.value=g.iridescenceThicknessMinimum,m.iridescenceThicknessMaximum.value=g.iridescenceThicknessMaximum,g.iridescenceMap&&(m.iridescenceMap.value=g.iridescenceMap,t(g.iridescenceMap,m.iridescenceMapTransform)),g.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=g.iridescenceThicknessMap,t(g.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),g.transmission>0&&(m.transmission.value=g.transmission,m.transmissionSamplerMap.value=M.texture,m.transmissionSamplerSize.value.set(M.width,M.height),g.transmissionMap&&(m.transmissionMap.value=g.transmissionMap,t(g.transmissionMap,m.transmissionMapTransform)),m.thickness.value=g.thickness,g.thicknessMap&&(m.thicknessMap.value=g.thicknessMap,t(g.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=g.attenuationDistance,m.attenuationColor.value.copy(g.attenuationColor)),g.anisotropy>0&&(m.anisotropyVector.value.set(g.anisotropy*Math.cos(g.anisotropyRotation),g.anisotropy*Math.sin(g.anisotropyRotation)),g.anisotropyMap&&(m.anisotropyMap.value=g.anisotropyMap,t(g.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=g.specularIntensity,m.specularColor.value.copy(g.specularColor),g.specularColorMap&&(m.specularColorMap.value=g.specularColorMap,t(g.specularColorMap,m.specularColorMapTransform)),g.specularIntensityMap&&(m.specularIntensityMap.value=g.specularIntensityMap,t(g.specularIntensityMap,m.specularIntensityMapTransform))}function p(m,g){g.matcap&&(m.matcap.value=g.matcap)}function x(m,g){const M=e.get(g).light;m.referencePosition.value.setFromMatrixPosition(M.matrixWorld),m.nearDistance.value=M.shadow.camera.near,m.farDistance.value=M.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:s}}function RE(n,e,t,i){let s={},r={};function o(M,E){const y=E.program;i.uniformBlockBinding(M,y,s[M.id])}function a(M,E){let y=s[M.id];y===void 0&&(p(M),y=c(M),s[M.id]=y,M.addEventListener("dispose",m));const T=E.program;i.updateUBOMapping(M,T);const b=e.render.frame;r[M.id]!==b&&(l(M),r[M.id]=b)}function c(M){const E=n.createBuffer(),y=M.__size,T=M.usage;return n.bindBuffer(n.UNIFORM_BUFFER,E),n.bufferData(n.UNIFORM_BUFFER,y,T),n.bindBuffer(n.UNIFORM_BUFFER,null),E}function l(M){const E=s[M.id],y=M.uniforms,T=M.__cache;n.bindBuffer(n.UNIFORM_BUFFER,E);for(let b=0,v=y.length;b<v;b++){const _=y[b];if(Array.isArray(_))for(let R=0,C=_.length;R<C;R++)h(_[R],b,R,T);else h(_,b,0,T)}n.bindBuffer(n.UNIFORM_BUFFER,null)}function h(M,E,y,T){if(f(M,E,y,T)===!0){const b=M.__offset,v=M.value;if(Array.isArray(v)){let _=0;for(let R=0;R<v.length;R++){const C=v[R],L=x(C,!0);u(C,M.__data,_),_+=L.storage/Float32Array.BYTES_PER_ELEMENT}}else u(v,M.__data,0);n.bufferSubData(n.UNIFORM_BUFFER,b,M.__data)}}function u(M,E,y){typeof M=="number"||typeof M=="boolean"?E[y]=M:M.isMatrix3?(E[y]=M.elements[0],E[y+1]=M.elements[1],E[y+2]=M.elements[2],E[y+3]=0,E[y+4]=M.elements[3],E[y+5]=M.elements[4],E[y+6]=M.elements[5],E[y+7]=0,E[y+8]=M.elements[6],E[y+9]=M.elements[7],E[y+10]=M.elements[8],E[y+11]=0):ArrayBuffer.isView(M)?E.set(M.subarray(0,E.length-y),y):M.toArray(E,y)}function f(M,E,y,T){const b=M.value,v=E+"_"+y;if(Array.isArray(b)){T[v]===void 0&&(T[v]=[]);const _=T[v];let R=!1;for(let C=0;C<b.length;C++)d(b[C],_,C)===!0&&(R=!0);return R}return d(b,T,v)}function d(M,E,y){if(E[y]===void 0)return typeof M=="number"||typeof M=="boolean"?E[y]=M:ArrayBuffer.isView(M)?E[y]=M.slice():E[y]=M.clone(),!0;{const T=E[y];if(typeof M=="number"||typeof M=="boolean"){if(T!==M)return E[y]=M,!0}else{if(ArrayBuffer.isView(M))return!0;if(T.equals(M)===!1)return T.copy(M),!0}}return!1}function p(M){const E=M.uniforms;let y=0;const T=16;for(let v=0,_=E.length;v<_;v++){const R=Array.isArray(E[v])?E[v]:[E[v]];for(let C=0,L=R.length;C<L;C++){const D=R[C],B=Array.isArray(D.value)?D.value:[D.value],A=Array.isArray(E[v])||Array.isArray(D.value);let F=y;for(let N=0,q=B.length;N<q;N++){const V=B[N],X=x(V,A),j=y%T,de=j%X.boundary,Re=j+de;y+=de,Re!==0&&T-Re<X.storage&&(y+=T-Re),N===0&&(F=y),y+=X.storage}const O=D.type==="int"?Int32Array:D.type==="uint"?Uint32Array:Float32Array;D.__data=new O((y-F)/Float32Array.BYTES_PER_ELEMENT),D.__offset=F}}const b=y%T;return b>0&&(y+=T-b),M.__size=y,M.__cache={},this}function x(M,E){const y={boundary:0,storage:0};return typeof M=="number"||typeof M=="boolean"?(y.boundary=4,y.storage=4):M.isVector2?(y.boundary=8,y.storage=8):M.isVector3||M.isColor?(y.boundary=16,y.storage=12):M.isVector4?(y.boundary=16,y.storage=16):M.isMatrix3?(y.boundary=16,y.storage=48):M.isMatrix4?(y.boundary=16,y.storage=64):M.isTexture?De("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(M)?(y.boundary=16,y.storage=M.byteLength):De("WebGLRenderer: Unsupported uniform value type.",M),E===!0&&(y.boundary=16,y.storage=Math.ceil(y.storage/16)*16),y}function m(M){const E=M.target;E.removeEventListener("dispose",m),n.deleteBuffer(s[E.id]),delete s[E.id],delete r[E.id]}function g(){for(const M in s)n.deleteBuffer(s[M]);s={},r={}}return{bind:o,update:a,dispose:g}}const CE=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let Gn=null;function PE(){return Gn===null&&(Gn=new Ia(CE,16,16,vs,Jn),Gn.name="DFG_LUT",Gn.minFilter=nn,Gn.magFilter=nn,Gn.wrapS=hi,Gn.wrapT=hi,Gn.generateMipmaps=!1,Gn.needsUpdate=!0),Gn}class LE{constructor(e={}){const{canvas:t=Gx(),context:i=null,depth:s=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reversedDepthBuffer:f=!1,outputBufferType:d=fn}=e;this.isWebGLRenderer=!0;let p;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=i.getContextAttributes().alpha}else p=o;const x=d,m=new Set([Ah,Eh,wh]),g=new Set([fn,Zn,Wr,Qs,yh,Sh]),M=new Uint32Array(4),E=new Int32Array(4),y={textures:[],min:[],max:[],resolution:[]};let T=null,b=null;const v=[],_=[];let R=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=pi,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const C=this;let L=!1,D=null,B=null,A=null,F=null;this._outputColorSpace=bn;let O=0,N=0,q=null,V=-1,X=null;const j=new ct,de=new ct;let Re=null;const K=new Qe(0);let fe=0,Me=t.width,Ce=t.height,me=1,Ne=null,ut=null;const $=new ct(0,0,Me,Ce),xe=new ct(0,0,Me,Ce);let Le=!1;const Ae=new wa,ot=new Ph;let ft=!1,Tt=!1;const mt=new Ve,kn=new z,Dt=new ct,dn={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let pn=!1;function mn(){return q===null?me:1}let k=i;function gn(w,U){return t.getContext(w,U)}let dt,pt,pe,Rt,Ie,Fe,P,S,H,ne,te,re,he,J,Q,ae,I,ee,Z,le,se,oe,Te;try{const w={alpha:!0,depth:s,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${xh}`),t.addEventListener("webglcontextlost",Pe,!1),t.addEventListener("webglcontextrestored",ke,!1),t.addEventListener("webglcontextcreationerror",ge,!1),k===null){const U="webgl2";if(k=gn(U,w),k===null)throw gn(U)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}Ge()}catch(w){throw t.removeEventListener("webglcontextlost",Pe,!1),t.removeEventListener("webglcontextrestored",ke,!1),t.removeEventListener("webglcontextcreationerror",ge,!1),et("WebGLRenderer: "+w.message),w}function Ge(){dt=new Nb(k),dt.init(),se=new yE(k,dt),pt=new bb(k,dt,e,se),pe=new xE(k,dt),pt.reversedDepthBuffer&&f&&pe.buffers.depth.setReversed(!0),B=k.createFramebuffer(),A=k.createFramebuffer(),F=k.createFramebuffer(),Rt=new Ob(k),Ie=new rE,Fe=new ME(k,dt,pe,Ie,pt,se,Rt),P=new Db(C),S=new BM(k),oe=new yb(k,S),H=new Fb(k,S,Rt,oe),ne=new Bb(k,H,S,oe,Rt),ee=new kb(k,pt,Fe),Q=new wb(Ie),te=new sE(C,P,dt,pt,oe,Q),re=new TE(C,Ie),he=new aE,J=new dE(dt),I=new Mb(C,P,pe,ne,p,c),ae=new _E(C,ne,pt),Te=new RE(k,Rt,pt,pe),Z=new Sb(k,dt,Rt),le=new Ub(k,dt,Rt),Rt.programs=te.programs,C.capabilities=pt,C.extensions=dt,C.properties=Ie,C.renderLists=he,C.shadowMap=ae,C.state=pe,C.info=Rt}x!==fn&&(R=new Gb(x,t.width,t.height,a,s,r));const ie=new EE(C,k);this.xr=ie,this.getContext=function(){return k},this.getContextAttributes=function(){return k.getContextAttributes()},this.forceContextLoss=function(){const w=dt.get("WEBGL_lose_context");w&&w.loseContext()},this.forceContextRestore=function(){const w=dt.get("WEBGL_lose_context");w&&w.restoreContext()},this.getPixelRatio=function(){return me},this.setPixelRatio=function(w){w!==void 0&&(me=w,this.setSize(Me,Ce,!1))},this.getSize=function(w){return w.set(Me,Ce)},this.setSize=function(w,U,Y=!0){if(ie.isPresenting){De("WebGLRenderer: Can't change size while VR device is presenting.");return}Me=w,Ce=U,t.width=Math.floor(w*me),t.height=Math.floor(U*me),Y===!0&&(t.style.width=w+"px",t.style.height=U+"px"),R!==null&&R.setSize(t.width,t.height),this.setViewport(0,0,w,U)},this.getDrawingBufferSize=function(w){return w.set(Me*me,Ce*me).floor()},this.setDrawingBufferSize=function(w,U,Y){Me=w,Ce=U,me=Y,t.width=Math.floor(w*Y),t.height=Math.floor(U*Y),this.setViewport(0,0,w,U)},this.setEffects=function(w){if(x===fn){et("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(w){for(let U=0;U<w.length;U++)if(w[U].isOutputPass===!0){De("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}R.setEffects(w||[])},this.getCurrentViewport=function(w){return w.copy(j)},this.getViewport=function(w){return w.copy($)},this.setViewport=function(w,U,Y,G){w.isVector4?$.set(w.x,w.y,w.z,w.w):$.set(w,U,Y,G),pe.viewport(j.copy($).multiplyScalar(mn()).round())},this.getScissor=function(w){return w.copy(xe)},this.setScissor=function(w,U,Y,G){w.isVector4?xe.set(w.x,w.y,w.z,w.w):xe.set(w,U,Y,G),pe.scissor(de.copy(xe).multiplyScalar(mn()).round())},this.getScissorTest=function(){return Le},this.setScissorTest=function(w){pe.setScissorTest(Le=w)},this.setOpaqueSort=function(w){Ne=w},this.setTransparentSort=function(w){ut=w},this.getClearColor=function(w){return w.copy(I.getClearColor())},this.setClearColor=function(){I.setClearColor(...arguments)},this.getClearAlpha=function(){return I.getClearAlpha()},this.setClearAlpha=function(){I.setClearAlpha(...arguments)},this.clear=function(w=!0,U=!0,Y=!0){let G=0;if(w){let W=!1;if(q!==null){const ue=q.texture.format;W=m.has(ue)}if(W){const ue=q.texture.type,ye=g.has(ue),ce=I.getClearColor(),_e=I.getClearAlpha(),Ee=ce.r,Ue=ce.g,$e=ce.b;ye?(M[0]=Ee,M[1]=Ue,M[2]=$e,M[3]=_e,k.clearBufferuiv(k.COLOR,0,M)):(E[0]=Ee,E[1]=Ue,E[2]=$e,E[3]=_e,k.clearBufferiv(k.COLOR,0,E))}else G|=k.COLOR_BUFFER_BIT}U&&(G|=k.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),Y&&(G|=k.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),G!==0&&k.clear(G)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(w){w.setRenderer(this),D=w},this.dispose=function(){t.removeEventListener("webglcontextlost",Pe,!1),t.removeEventListener("webglcontextrestored",ke,!1),t.removeEventListener("webglcontextcreationerror",ge,!1),I.dispose(),he.dispose(),J.dispose(),Fe.dispose(),Ie.dispose(),P.dispose(),ne.dispose(),H.dispose(),oe.dispose(),Te.dispose(),te.dispose(),ie.dispose(),ie.removeEventListener("sessionstart",Uh),ie.removeEventListener("sessionend",Oh),Wi.stop()};function Pe(w){w.preventDefault(),sf("WebGLRenderer: Context Lost."),L=!0}function ke(){sf("WebGLRenderer: Context Restored."),L=!1;const w=Rt.autoReset,U=ae.enabled,Y=ae.autoUpdate,G=ae.needsUpdate,W=ae.type;Ge(),Rt.autoReset=w,ae.enabled=U,ae.autoUpdate=Y,ae.needsUpdate=G,ae.type=W}function ge(w){et("WebGLRenderer: A WebGL context could not be created. Reason: ",w.statusMessage)}function nt(w){const U=w.target;U.removeEventListener("dispose",nt),Nt(U)}function Nt(w){xi(w),Ie.remove(w)}function xi(w){const U=Ie.get(w).programs;U!==void 0&&(U.forEach(function(Y){te.releaseProgram(Y)}),w.isShaderMaterial&&te.releaseShaderCache(w))}this.renderBufferDirect=function(w,U,Y,G,W,ue){U===null&&(U=dn);const ye=W.isMesh&&W.matrixWorld.determinantAffine()<0,ce=Qm(w,U,Y,G,W);pe.setMaterial(G,ye);let _e=Y.index,Ee=1;if(G.wireframe===!0){if(_e=H.getWireframeAttribute(Y),_e===void 0)return;Ee=2}const Ue=Y.drawRange,$e=Y.attributes.position;let Se=Ue.start*Ee,Xe=(Ue.start+Ue.count)*Ee;ue!==null&&(Se=Math.max(Se,ue.start*Ee),Xe=Math.min(Xe,(ue.start+ue.count)*Ee)),_e!==null?(Se=Math.max(Se,0),Xe=Math.min(Xe,_e.count)):$e!=null&&(Se=Math.max(Se,0),Xe=Math.min(Xe,$e.count));const yt=Xe-Se;if(yt<0||yt===1/0)return;oe.setup(W,G,ce,Y,_e);let lt,at=Z;if(_e!==null&&(lt=S.get(_e),at=le,at.setIndex(lt)),W.isMesh)G.wireframe===!0?(pe.setLineWidth(G.wireframeLinewidth*mn()),at.setMode(k.LINES)):at.setMode(k.TRIANGLES);else if(W.isLine){let Vt=G.linewidth;Vt===void 0&&(Vt=1),pe.setLineWidth(Vt*mn()),W.isLineSegments?at.setMode(k.LINES):W.isLineLoop?at.setMode(k.LINE_LOOP):at.setMode(k.LINE_STRIP)}else W.isPoints?at.setMode(k.POINTS):W.isSprite&&at.setMode(k.TRIANGLES);if(W.isBatchedMesh)if(dt.get("WEBGL_multi_draw"))at.renderMultiDraw(W._multiDrawStarts,W._multiDrawCounts,W._multiDrawCount);else{const Vt=W._multiDrawStarts,be=W._multiDrawCounts,Zt=W._multiDrawCount,je=_e?S.get(_e).bytesPerElement:1,$i=Ie.get(G).currentProgram.getUniforms();for(let Wt=0;Wt<Zt;Wt++)$i.setValue(k,"_gl_DrawID",Wt),at.render(Vt[Wt]/je,be[Wt])}else if(W.isInstancedMesh)at.renderInstances(Se,yt,W.count);else if(Y.isInstancedBufferGeometry){const Vt=Y._maxInstanceCount!==void 0?Y._maxInstanceCount:1/0,be=Math.min(Y.instanceCount,Vt);at.renderInstances(Se,yt,be)}else at.render(Se,yt)};function Fh(w,U,Y,G){D!==null&&w.isNodeMaterial&&D.setObject(G,w),ft===!0&&Q.setState(w,Y,!1),w.transparent===!0&&w.side===qn&&w.forceSinglePass===!1?(w.side=kt,w.needsUpdate=!0,rr(w,U,G),w.side=gs,w.needsUpdate=!0,rr(w,U,G),w.side=qn):rr(w,U,G)}this.compile=function(w,U,Y=null){Y===null&&(Y=w),D!==null&&D.renderStart(w,U,Y),b=J.get(Y),b.init(U),_.push(b),Y.traverseVisible(function(W){W.isLight&&W.layers.test(U.layers)&&(b.pushLight(W),W.castShadow&&b.pushShadow(W))}),w!==Y&&w.traverseVisible(function(W){W.isLight&&W.layers.test(U.layers)&&(b.pushLight(W),W.castShadow&&b.pushShadow(W))}),b.setupLights(),D!==null&&D.updateLights(b.state.lightsArray),Tt=this.localClippingEnabled,ft=Q.init(this.clippingPlanes,Tt),ft===!0&&Q.setGlobalState(this.clippingPlanes,U),D!==null&&ae.render(b.state.shadowsArray,Y,U);const G=new Set;return w.traverse(function(W){if(!(W.isMesh||W.isPoints||W.isLine||W.isSprite))return;const ue=W.material;if(ue)if(Array.isArray(ue))for(let ye=0;ye<ue.length;ye++){const ce=ue[ye];Fh(ce,Y,U,W),G.add(ce)}else Fh(ue,Y,U,W),G.add(ue)}),b=_.pop(),D!==null&&D.renderEnd(),G},this.compileAsync=function(w,U,Y=null){const G=this.compile(w,U,Y);return new Promise(W=>{function ue(){if(G.forEach(function(ye){const _e=Ie.get(ye).currentProgram;(_e===void 0||_e.isReady())&&G.delete(ye)}),G.size===0){W(w);return}setTimeout(ue,10)}dt.get("KHR_parallel_shader_compile")!==null?ue():setTimeout(ue,10)})};let ka=null;function Zm(w){ka&&ka(w)}function Uh(){Wi.stop()}function Oh(){Wi.start()}const Wi=new um;Wi.setAnimationLoop(Zm),typeof self<"u"&&Wi.setContext(self),this.setAnimationLoop=function(w){ka=w,ie.setAnimationLoop(w),w===null?Wi.stop():Wi.start()},ie.addEventListener("sessionstart",Uh),ie.addEventListener("sessionend",Oh),this.render=function(w,U){if(U!==void 0&&U.isCamera!==!0){et("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(L===!0)return;D!==null&&D.renderStart(w,U);const Y=ie.enabled===!0&&ie.isPresenting===!0,G=R!==null&&(q===null||Y)&&R.begin(C,q);if(w.matrixWorldAutoUpdate===!0&&w.updateMatrixWorld(),U.parent===null&&U.matrixWorldAutoUpdate===!0&&U.updateMatrixWorld(),ie.enabled===!0&&ie.isPresenting===!0&&(R===null||R.isCompositing()===!1)&&(ie.cameraAutoUpdate===!0&&ie.updateCamera(U),U=ie.getCamera()),w.isScene===!0&&w.onBeforeRender(C,w,U,q),b=J.get(w,_.length),b.init(U),b.state.textureUnits=Fe.getTextureUnits(),_.push(b),mt.multiplyMatrices(U.projectionMatrix,U.matrixWorldInverse),U.isArrayCamera?ot.setFromArrayCamera(U):Ae.setFromProjectionMatrix(mt,Fn,U.reversedDepth),Tt=this.localClippingEnabled,ft=Q.init(this.clippingPlanes,Tt),T=he.get(w,v.length),T.init(),v.push(T),this.info.render.frame++,ie.enabled===!0&&ie.isPresenting===!0){const ye=C.xr.getDepthSensingMesh();ye!==null&&Ba(ye,U,-1/0,C.sortObjects)}Ba(w,U,0,C.sortObjects),T.finish(),D!==null&&D.updateLights(b.state.lightsArray),C.sortObjects===!0&&T.sort(Ne,ut),pn=ie.enabled===!1||ie.isPresenting===!1||ie.hasDepthSensing()===!1,pn&&I.addToRenderList(T,w),this.info.autoReset===!0&&this.info.reset(),ft===!0&&Q.beginShadows();const W=b.state.shadowsArray;if(ae.render(W,w,U),ft===!0&&Q.endShadows(),(G&&R.hasRenderPass())===!1){const ye=T.opaque,ce=T.transmissive;if(b.setupLights(),U.isArrayCamera){const _e=U.cameras;if(ce.length>0)for(let Ee=0,Ue=_e.length;Ee<Ue;Ee++){const $e=_e[Ee];Bh(ye,ce,w,$e)}pn&&I.render(w);for(let Ee=0,Ue=_e.length;Ee<Ue;Ee++){const $e=_e[Ee];kh(T,w,$e,$e.viewport)}}else ce.length>0&&Bh(ye,ce,w,U),pn&&I.render(w),kh(T,w,U)}q!==null&&N===0&&(Fe.updateMultisampleRenderTarget(q),Fe.updateRenderTargetMipmap(q)),G&&R.end(C),w.isScene===!0&&w.onAfterRender(C,w,U),oe.resetDefaultState(),V=-1,X=null,_.pop(),_.length>0?(b=_[_.length-1],Fe.setTextureUnits(b.state.textureUnits),ft===!0&&Q.setGlobalState(C.clippingPlanes,b.state.camera)):b=null,v.pop(),v.length>0?T=v[v.length-1]:T=null,D!==null&&D.renderEnd()};function Ba(w,U,Y,G){if(w.visible===!1)return;if(w.layers.test(U.layers)){if(w.isGroup)Y=w.renderOrder;else if(w.isLOD)w.autoUpdate===!0&&w.update(U);else if(w.isLight)b.pushLight(w),w.castShadow&&b.pushShadow(w);else if(w.isSprite){const ye=U.isArrayCamera?ot:Ae;if(!w.frustumCulled||w.intersectsFrustum(ye)){G&&Dt.setFromMatrixPosition(w.matrixWorld).applyMatrix4(mt);const ce=ne.update(w),_e=w.material;_e.visible&&T.push(w,ce,_e,Y,Dt.z,null,U)}}else if(w.isMesh||w.isLine||w.isPoints){const ye=U.isArrayCamera?ot:Ae;if(!w.frustumCulled||w.intersectsFrustum(ye)){const ce=ne.update(w),_e=w.material;if(G&&(w.boundingSphere!==void 0?(w.boundingSphere===null&&w.computeBoundingSphere(),Dt.copy(w.boundingSphere.center)):(ce.boundingSphere===null&&ce.computeBoundingSphere(),Dt.copy(ce.boundingSphere.center)),Dt.applyMatrix4(w.matrixWorld).applyMatrix4(mt)),Array.isArray(_e)){const Ee=ce.groups;for(let Ue=0,$e=Ee.length;Ue<$e;Ue++){const Se=Ee[Ue],Xe=_e[Se.materialIndex];Xe&&Xe.visible&&T.push(w,ce,Xe,Y,Dt.z,Se,U)}}else _e.visible&&T.push(w,ce,_e,Y,Dt.z,null,U)}}}const ue=w.children;for(let ye=0,ce=ue.length;ye<ce;ye++)Ba(ue[ye],U,Y,G)}function kh(w,U,Y,G){const{opaque:W,transmissive:ue,transparent:ye}=w;b.setupLightsView(Y),ft===!0&&Q.setGlobalState(C.clippingPlanes,Y),G&&pe.viewport(j.copy(G)),W.length>0&&ro(W,U,Y),ue.length>0&&ro(ue,U,Y),ye.length>0&&ro(ye,U,Y),pe.buffers.depth.setTest(!0),pe.buffers.depth.setMask(!0),pe.buffers.color.setMask(!0),pe.setPolygonOffset(!1)}function Bh(w,U,Y,G){if((Y.isScene===!0?Y.overrideMaterial:null)!==null)return;if(b.state.transmissionRenderTarget[G.id]===void 0){const Se=dt.has("EXT_color_buffer_half_float")||dt.has("EXT_color_buffer_float");b.state.transmissionRenderTarget[G.id]=new On(1,1,{generateMipmaps:!0,type:Se?Jn:fn,minFilter:Ii,samples:Math.max(4,pt.samples),stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:qe.workingColorSpace})}const ue=b.state.transmissionRenderTarget[G.id],ye=G.viewport||j;ue.setSize(ye.z*C.transmissionResolutionScale,ye.w*C.transmissionResolutionScale);const ce=C.getRenderTarget(),_e=C.getActiveCubeFace(),Ee=C.getActiveMipmapLevel();C.setRenderTarget(ue),C.getClearColor(K),fe=C.getClearAlpha(),fe<1&&C.setClearColor(16777215,.5),C.clear(),pn&&I.render(Y);const Ue=C.toneMapping;C.toneMapping=pi;const $e=G.viewport;if(G.viewport!==void 0&&(G.viewport=void 0),b.setupLightsView(G),ft===!0&&Q.setGlobalState(C.clippingPlanes,G),ro(w,Y,G),Fe.updateMultisampleRenderTarget(ue),Fe.updateRenderTargetMipmap(ue),dt.has("WEBGL_multisampled_render_to_texture")===!1){let Se=!1;for(let Xe=0,yt=U.length;Xe<yt;Xe++){const lt=U[Xe],{object:at,geometry:Vt,material:be,group:Zt}=lt;if(be.side===qn&&at.layers.test(G.layers)){const je=be.side;be.side=kt,be.needsUpdate=!0,zh(at,Y,G,Vt,be,Zt),be.side=je,be.needsUpdate=!0,Se=!0}}Se===!0&&(Fe.updateMultisampleRenderTarget(ue),Fe.updateRenderTargetMipmap(ue))}C.setRenderTarget(ce,_e,Ee),C.setClearColor(K,fe),$e!==void 0&&(G.viewport=$e),C.toneMapping=Ue}function ro(w,U,Y){const G=U.isScene===!0?U.overrideMaterial:null;for(let W=0,ue=w.length;W<ue;W++){const ye=w[W],{object:ce,geometry:_e,group:Ee}=ye;let Ue=ye.material;Ue.allowOverride===!0&&G!==null&&(Ue=G),ce.layers.test(Y.layers)&&zh(ce,U,Y,_e,Ue,Ee)}}function zh(w,U,Y,G,W,ue){D!==null&&W.isNodeMaterial&&D.setObject(w,W),w.onBeforeRender(C,U,Y,G,W,ue),w.modelViewMatrix.multiplyMatrices(Y.matrixWorldInverse,w.matrixWorld),w.normalMatrix.getNormalMatrix(w.modelViewMatrix),W.onBeforeRender(C,U,Y,G,w,ue),W.transparent===!0&&W.side===qn&&W.forceSinglePass===!1?(W.side=kt,W.needsUpdate=!0,C.renderBufferDirect(Y,U,G,W,w,ue),W.side=gs,W.needsUpdate=!0,C.renderBufferDirect(Y,U,G,W,w,ue),W.side=qn):C.renderBufferDirect(Y,U,G,W,w,ue),w.onAfterRender(C,U,Y,G,W,ue)}function Gh(w){let U=0;for(const Y of w)Y.texture!==null&&U++;return U}function rr(w,U,Y){U.isScene!==!0&&(U=dn);const G=Ie.get(w),W=b.state.lights,ue=b.state.shadowsArray,ye=W.state.version,ce=te.getParameters(w,W.state,ue,U,Y,b.state.lightProbeGridArray),_e=te.getProgramCacheKey(ce);let Ee=G.programs;G.environment=w.isMeshStandardMaterial||w.isMeshLambertMaterial||w.isMeshPhongMaterial?U.environment:null,G.fog=U.fog;const Ue=w.isMeshStandardMaterial||w.isMeshLambertMaterial&&!w.envMap||w.isMeshPhongMaterial&&!w.envMap;G.envMap=P.get(w.envMap||G.environment,Ue),G.envMapRotation=G.environment!==null&&w.envMap===null?U.environmentRotation:w.envMapRotation,Ee===void 0&&(w.addEventListener("dispose",nt),Ee=new Map,G.programs=Ee,G.programVariants=new Map);let $e=Ee.get(_e);if($e!==void 0){if(G.currentProgram===$e&&G.lightsStateVersion===ye)return Vh(w,ce),$e}else ce.uniforms=te.getUniforms(w),D!==null&&w.isNodeMaterial&&D.build(w,Y,ce),w.onBeforeCompile(ce,C),$e=te.acquireProgram(ce,_e),Ee.set(_e,$e),G.uniforms=ce.uniforms;const Se=G.uniforms;return(!w.isShaderMaterial&&!w.isRawShaderMaterial||w.clipping===!0)&&(Se.clippingPlanes=Q.uniform),Vh(w,ce),G.needsLights=e0(w),G.lightsStateVersion=ye,G.needsLights&&(Se.ambientLightColor.value=W.state.ambient,Se.lightProbe.value=W.state.probe,Se.sunLights.value=W.state.sun,Se.sunLightShadows.value=W.state.sunShadow,Se.directionalLights.value=W.state.directional,Se.directionalLightShadows.value=W.state.directionalShadow,Se.spotLights.value=W.state.spot,Se.spotLightShadows.value=W.state.spotShadow,Se.rectAreaLights.value=W.state.rectArea,Se.ltc_1.value=W.state.rectAreaLTC1,Se.ltc_2.value=W.state.rectAreaLTC2,Se.pointLights.value=W.state.point,Se.pointLightShadows.value=W.state.pointShadow,Se.hemisphereLights.value=W.state.hemi,Se.sunShadowMatrix.value=W.state.sunShadowMatrix,Se.sunShadowCascade.value=W.state.sunShadowCascade,Se.directionalShadowMatrix.value=W.state.directionalShadowMatrix,Se.spotLightMatrix.value=W.state.spotLightMatrix,Se.spotLightMap.value=W.state.spotLightMap,Se.pointShadowMatrix.value=W.state.pointShadowMatrix),G.numLightProbeGrids=Gh(b.state.lightProbeGridArray),G.currentProgram=$e,G.uniformsList=null,$e}function Jm(w,U,Y,G,W){const ue=Ie.get(w),ye=ue.currentProgram.id+","+G+","+W;let ce=ue.programVariants.get(ye);return ce===void 0?(ce=rr(w,U,Y),ue.programVariants.set(ye,ce)):(ue.currentProgram=ce,ue.uniformsList=null,ue.outputColorSpace=G,ue.toneMapping=W),ce}function Hh(w){if(w.uniformsList===null){const U=w.currentProgram.getUniforms();w.uniformsList=sa.seqWithValue(U.seq,w.uniforms)}return w.uniformsList}function Vh(w,U){const Y=Ie.get(w);Y.outputColorSpace=U.outputColorSpace,Y.batching=U.batching,Y.batchingColor=U.batchingColor,Y.instancing=U.instancing,Y.instancingColor=U.instancingColor,Y.instancingMorph=U.instancingMorph,Y.skinning=U.skinning,Y.morphTargets=U.morphTargets,Y.morphNormals=U.morphNormals,Y.morphColors=U.morphColors,Y.morphTargetsCount=U.morphTargetsCount,Y.numClippingPlanes=U.numClippingPlanes,Y.numIntersection=U.numClipIntersection,Y.vertexAlphas=U.vertexAlphas,Y.vertexTangents=U.vertexTangents,Y.toneMapping=U.toneMapping}function Qm(w,U,Y,G,W){U.isScene!==!0&&(U=dn),Fe.resetTextureUnits();const ue=U.fog,ye=G.isMeshStandardMaterial||G.isMeshLambertMaterial||G.isMeshPhongMaterial?U.environment:null,ce=q===null?C.outputColorSpace:q.isXRRenderTarget===!0?q.texture.colorSpace:qe.workingColorSpace,_e=G.isMeshStandardMaterial||G.isMeshLambertMaterial&&!G.envMap||G.isMeshPhongMaterial&&!G.envMap,Ee=P.get(G.envMap||ye,_e),Ue=G.vertexColors===!0&&!!Y.attributes.color&&Y.attributes.color.itemSize===4,$e=!!Y.attributes.tangent&&(!!G.normalMap||G.anisotropy>0),Se=!!Y.morphAttributes.position,Xe=!!Y.morphAttributes.normal,yt=!!Y.morphAttributes.color;let lt=pi;G.toneMapped&&(q===null||q.isXRRenderTarget===!0)&&(lt=C.toneMapping);const at=Y.morphAttributes.position||Y.morphAttributes.normal||Y.morphAttributes.color,Vt=at!==void 0?at.length:0,be=Ie.get(G),Zt=b.state.lights;if(ft===!0&&(Tt===!0||w!==X)){const gt=w===X&&G.id===V;Q.setState(G,w,gt)}let je=!1,$i=!1;G.version===be.__version?be.needsLights&&be.lightsStateVersion!==Zt.state.version||W.isBatchedMesh&&be.batching===!1||!W.isBatchedMesh&&be.batching===!0||W.isBatchedMesh&&be.batchingColor===!0&&W._colorsTexture===null||W.isBatchedMesh&&be.batchingColor===!1&&W._colorsTexture!==null||W.isInstancedMesh&&be.instancing===!1||!W.isInstancedMesh&&be.instancing===!0||W.isSkinnedMesh&&be.skinning===!1||!W.isSkinnedMesh&&be.skinning===!0||W.isInstancedMesh&&be.instancingColor===!0&&W.instanceColor===null||W.isInstancedMesh&&be.instancingColor===!1&&W.instanceColor!==null||W.isInstancedMesh&&be.instancingMorph===!0&&W.morphTexture===null||W.isInstancedMesh&&be.instancingMorph===!1&&W.morphTexture!==null||be.envMap!==Ee||G.fog===!0&&be.fog!==ue||be.numClippingPlanes!==void 0&&(be.numClippingPlanes!==Q.numPlanes||be.numIntersection!==Q.numIntersection)||be.vertexAlphas!==Ue||be.vertexTangents!==$e||be.morphTargets!==Se||be.morphNormals!==Xe||be.morphColors!==yt||be.morphTargetsCount!==Vt||be.numLightProbeGrids!==Gh(b.state.lightProbeGridArray)?je=!0:(be.outputColorSpace!==ce||be.toneMapping!==lt)&&($i=!0):(je=!0,be.__version=G.version);let Wt=be.currentProgram;(je===!0||$i===!0)&&(Wt=$i===!0?Jm(G,U,W,ce,lt):rr(G,U,W),D&&G.isNodeMaterial&&D.onUpdateProgram(G,Wt,be));let oo=!1,Mi=!1,Xi=!1;const Ze=Wt.getUniforms(),Bt=be.uniforms;if(pe.useProgram(Wt.program)&&(oo=!0,Mi=!0,Xi=!0),G.id!==V&&(V=G.id,Mi=!0),oo||X!==w){pe.buffers.depth.getReversed()&&w.reversedDepth!==!0&&(w._reversedDepth=!0,w.updateProjectionMatrix()),Ze.setValue(k,"projectionMatrix",w.projectionMatrix),Ze.setValue(k,"viewMatrix",w.matrixWorldInverse);const Ft=Ze.map.cameraPosition;Ft!==void 0&&Ft.setValue(k,kn.setFromMatrixPosition(w.matrixWorld)),pt.logarithmicDepthBuffer&&Ze.setValue(k,"logDepthBufFC",2/(Math.log(w.far+1)/Math.LN2)),(G.isMeshPhongMaterial||G.isMeshToonMaterial||G.isMeshLambertMaterial||G.isMeshBasicMaterial||G.isMeshStandardMaterial||G.isShaderMaterial)&&Ze.setValue(k,"isOrthographic",w.isOrthographicCamera===!0),X!==w&&(X=w,Mi=!0,Xi=!0)}if(be.needsLights&&(Zt.state.sunShadowMap.length>0&&Ze.setValue(k,"sunShadowMap",Zt.state.sunShadowMap,Fe),Zt.state.directionalShadowMap.length>0&&Ze.setValue(k,"directionalShadowMap",Zt.state.directionalShadowMap,Fe),Zt.state.spotShadowMap.length>0&&Ze.setValue(k,"spotShadowMap",Zt.state.spotShadowMap,Fe),Zt.state.pointShadowMap.length>0&&Ze.setValue(k,"pointShadowMap",Zt.state.pointShadowMap,Fe)),W.isSkinnedMesh){Ze.setOptional(k,W,"bindMatrix"),Ze.setOptional(k,W,"bindMatrixInverse");const gt=W.skeleton;gt&&(gt.boneTexture===null&&gt.computeBoneTexture(),Ze.setValue(k,"boneTexture",gt.boneTexture,Fe))}W.isBatchedMesh&&(Ze.setOptional(k,W,"batchingTexture"),Ze.setValue(k,"batchingTexture",W._matricesTexture,Fe),Ze.setOptional(k,W,"batchingIdTexture"),Ze.setValue(k,"batchingIdTexture",W._indirectTexture,Fe),Ze.setOptional(k,W,"batchingColorTexture"),W._colorsTexture!==null&&Ze.setValue(k,"batchingColorTexture",W._colorsTexture,Fe));const Tn=Y.morphAttributes;if((Tn.position!==void 0||Tn.normal!==void 0||Tn.color!==void 0)&&ee.update(W,Y,Wt),(Mi||be.receiveShadow!==W.receiveShadow)&&(be.receiveShadow=W.receiveShadow,Ze.setValue(k,"receiveShadow",W.receiveShadow)),(G.isMeshStandardMaterial||G.isMeshLambertMaterial||G.isMeshPhongMaterial)&&G.envMap===null&&U.environment!==null&&(Bt.envMapIntensity.value=U.environmentIntensity),Bt.dfgLUT!==void 0&&(Bt.dfgLUT.value=PE()),Mi){if(Ze.setValue(k,"toneMappingExposure",C.toneMappingExposure),be.needsLights&&jm(Bt,Xi),ue&&G.fog===!0&&re.refreshFogUniforms(Bt,ue),re.refreshMaterialUniforms(Bt,G,me,Ce,b.state.transmissionRenderTarget[w.id]),be.needsLights&&be.numLightProbeGrids>0){const gt=y;let Ft=0;for(const jn of b.state.lightProbeGridArray)jn.texture!==null&&(gt.textures[Ft]=jn.texture,gt.min[Ft]=jn.boundingBox.min,gt.max[Ft]=jn.boundingBox.max,gt.resolution[Ft]=jn.resolution,Ft++);for(const jn in gt)gt[jn].length=Ft;Bt.probesSH.value=gt.textures,Bt.probesMin.value=gt.min,Bt.probesMax.value=gt.max,Bt.probesResolution.value=gt.resolution}sa.upload(k,Hh(be),Bt,Fe)}if(G.isShaderMaterial&&G.uniformsNeedUpdate===!0&&(sa.upload(k,Hh(be),Bt,Fe),G.uniformsNeedUpdate=!1),G.isSpriteMaterial&&Ze.setValue(k,"center",W.center),Ze.setValue(k,"modelViewMatrix",W.modelViewMatrix),Ze.setValue(k,"normalMatrix",W.normalMatrix),Ze.setValue(k,"modelMatrix",W.matrixWorld),G.uniformsGroups!==void 0){const gt=G.uniformsGroups;for(let Ft=0,jn=gt.length;Ft<jn;Ft++){const $h=gt[Ft];Te.update($h,Wt),Te.bind($h,Wt)}}return Wt}function jm(w,U){w.ambientLightColor.needsUpdate=U,w.lightProbe.needsUpdate=U,w.sunLights.needsUpdate=U,w.sunLightShadows.needsUpdate=U,w.directionalLights.needsUpdate=U,w.directionalLightShadows.needsUpdate=U,w.pointLights.needsUpdate=U,w.pointLightShadows.needsUpdate=U,w.spotLights.needsUpdate=U,w.spotLightShadows.needsUpdate=U,w.rectAreaLights.needsUpdate=U,w.hemisphereLights.needsUpdate=U}function e0(w){return w.isMeshLambertMaterial||w.isMeshToonMaterial||w.isMeshPhongMaterial||w.isMeshStandardMaterial||w.isShadowMaterial||w.isShaderMaterial&&w.lights===!0}this.getActiveCubeFace=function(){return O},this.getActiveMipmapLevel=function(){return N},this.getRenderTarget=function(){return q},this.setRenderTargetTextures=function(w,U,Y){const G=Ie.get(w);G.__autoAllocateDepthBuffer=w.resolveDepthBuffer===!1,G.__autoAllocateDepthBuffer===!1&&(G.__useRenderToTexture=!1),Ie.get(w.texture).__webglTexture=U,Ie.get(w.depthTexture).__webglTexture=G.__autoAllocateDepthBuffer?void 0:Y,G.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(w,U){const Y=Ie.get(w);Y.__webglFramebuffer=U,Y.__useDefaultFramebuffer=U===void 0},this.setRenderTarget=function(w,U=0,Y=0){q=w,O=U,N=Y;let G=null,W=!1,ue=!1;if(w){const ce=Ie.get(w);if(ce.__useDefaultFramebuffer!==void 0){pe.bindFramebuffer(k.FRAMEBUFFER,ce.__webglFramebuffer),j.copy(w.viewport),de.copy(w.scissor),Re=w.scissorTest,pe.viewport(j),pe.scissor(de),pe.setScissorTest(Re),V=-1;return}else if(ce.__webglFramebuffer===void 0)Fe.setupRenderTarget(w);else if(ce.__hasExternalTextures)Fe.rebindTextures(w,Ie.get(w.texture).__webglTexture,Ie.get(w.depthTexture).__webglTexture);else if(w.depthBuffer){const Ue=w.depthTexture;if(ce.__boundDepthTexture!==Ue){if(Ue!==null&&Ie.has(Ue)&&(w.width!==Ue.image.width||w.height!==Ue.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");Fe.setupDepthRenderbuffer(w)}}const _e=w.texture;(_e.isData3DTexture||_e.isDataArrayTexture||_e.isCompressedArrayTexture)&&(ue=!0);const Ee=Ie.get(w).__webglFramebuffer;w.isWebGLCubeRenderTarget?(Array.isArray(Ee[U])?G=Ee[U][Y]:G=Ee[U],W=!0):w.samples>0&&Fe.useMultisampledRTT(w)===!1?G=Ie.get(w).__webglMultisampledFramebuffer:Array.isArray(Ee)?G=Ee[Y]:G=Ee,j.copy(w.viewport),de.copy(w.scissor),Re=w.scissorTest}else j.copy($).multiplyScalar(me).floor(),de.copy(xe).multiplyScalar(me).floor(),Re=Le;if(Y!==0&&(G=B),pe.bindFramebuffer(k.FRAMEBUFFER,G)&&pe.drawBuffers(w,G),pe.viewport(j),pe.scissor(de),pe.setScissorTest(Re),W){const ce=Ie.get(w.texture);k.framebufferTexture2D(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_CUBE_MAP_POSITIVE_X+U,ce.__webglTexture,Y)}else if(ue){const ce=U;for(let _e=0;_e<w.textures.length;_e++){const Ee=Ie.get(w.textures[_e]);k.framebufferTextureLayer(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0+_e,Ee.__webglTexture,Y,ce)}}else if(w!==null&&Y!==0){const ce=Ie.get(w.texture);k.framebufferTexture2D(k.FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,ce.__webglTexture,Y)}V=-1};function Wh(w){const U=Ie.get(w);return(U.__readFormat!==w.format||U.__readType!==w.type)&&(U.__readFormat=w.format,U.__readType=w.type,U.__formatReadable=pt.textureFormatReadable(w.format),U.__typeReadable=pt.textureTypeReadable(w.type)),U}this.readRenderTargetPixels=function(w,U,Y,G,W,ue,ye,ce=0){if(!(w&&w.isWebGLRenderTarget)){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let _e=Ie.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&ye!==void 0&&(_e=_e[ye],Array.isArray(_e)&&(_e=_e[0])),_e){pe.bindFramebuffer(k.FRAMEBUFFER,_e);try{const Ee=w.textures[ce],Ue=Ee.format,$e=Ee.type;w.textures.length>1&&k.readBuffer(k.COLOR_ATTACHMENT0+ce);const Se=Wh(Ee);if(Se.__formatReadable===!1){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(Se.__typeReadable===!1){et("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}U>=0&&U<=w.width-G&&Y>=0&&Y<=w.height-W&&k.readPixels(U,Y,G,W,se.convert(Ue),se.convert($e),ue)}finally{const Ee=q!==null?Ie.get(q).__webglFramebuffer:null;pe.bindFramebuffer(k.FRAMEBUFFER,Ee)}}},this.readRenderTargetPixelsAsync=async function(w,U,Y,G,W,ue,ye,ce=0){if(!(w&&w.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let _e=Ie.get(w).__webglFramebuffer;if(w.isWebGLCubeRenderTarget&&ye!==void 0&&(_e=_e[ye],Array.isArray(_e)&&(_e=_e[0])),_e)if(U>=0&&U<=w.width-G&&Y>=0&&Y<=w.height-W){pe.bindFramebuffer(k.FRAMEBUFFER,_e);const Ee=w.textures[ce],Ue=Ee.format,$e=Ee.type;w.textures.length>1&&k.readBuffer(k.COLOR_ATTACHMENT0+ce);const Se=Wh(Ee);if(Se.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(Se.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Xe=k.createBuffer();k.bindBuffer(k.PIXEL_PACK_BUFFER,Xe),k.bufferData(k.PIXEL_PACK_BUFFER,ue.byteLength,k.STREAM_READ),k.readPixels(U,Y,G,W,se.convert(Ue),se.convert($e),0),k.bindBuffer(k.PIXEL_PACK_BUFFER,null);const yt=q!==null?Ie.get(q).__webglFramebuffer:null;pe.bindFramebuffer(k.FRAMEBUFFER,yt);const lt=k.fenceSync(k.SYNC_GPU_COMMANDS_COMPLETE,0);return k.flush(),await Hx(k,lt,4),k.bindBuffer(k.PIXEL_PACK_BUFFER,Xe),k.getBufferSubData(k.PIXEL_PACK_BUFFER,0,ue),k.bindBuffer(k.PIXEL_PACK_BUFFER,null),k.deleteBuffer(Xe),k.deleteSync(lt),ue}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(w,U=null,Y=0){const G=Math.pow(2,-Y),W=Math.floor(w.image.width*G),ue=Math.floor(w.image.height*G),ye=U!==null?U.x:0,ce=U!==null?U.y:0;Fe.setTexture2D(w,0),k.copyTexSubImage2D(k.TEXTURE_2D,Y,0,0,ye,ce,W,ue),pe.unbindTexture()},this.copyTextureToTexture=function(w,U,Y=null,G=null,W=0,ue=0){let ye,ce,_e,Ee,Ue,$e,Se,Xe,yt;const lt=w.isCompressedTexture?w.mipmaps[ue]:w.image;if(Y!==null)ye=Y.max.x-Y.min.x,ce=Y.max.y-Y.min.y,_e=Y.isBox3?Y.max.z-Y.min.z:1,Ee=Y.min.x,Ue=Y.min.y,$e=Y.isBox3?Y.min.z:0;else{const Ze=Math.pow(2,-W);ye=Math.floor(lt.width*Ze),ce=Math.floor(lt.height*Ze),w.isDataArrayTexture?_e=lt.depth:w.isData3DTexture?_e=Math.floor(lt.depth*Ze):_e=1,Ee=0,Ue=0,$e=0}G!==null?(Se=G.x,Xe=G.y,yt=G.z):(Se=0,Xe=0,yt=0);const at=se.convert(U.format),Vt=se.convert(U.type);let be;U.isData3DTexture?(Fe.setTexture3D(U,0),be=k.TEXTURE_3D):U.isDataArrayTexture||U.isCompressedArrayTexture?(Fe.setTexture2DArray(U,0),be=k.TEXTURE_2D_ARRAY):(Fe.setTexture2D(U,0),be=k.TEXTURE_2D),pe.activeTexture(k.TEXTURE0),pe.pixelStorei(k.UNPACK_FLIP_Y_WEBGL,U.flipY),pe.pixelStorei(k.UNPACK_PREMULTIPLY_ALPHA_WEBGL,U.premultiplyAlpha),pe.pixelStorei(k.UNPACK_ALIGNMENT,U.unpackAlignment);const Zt=pe.getParameter(k.UNPACK_ROW_LENGTH),je=pe.getParameter(k.UNPACK_IMAGE_HEIGHT),$i=pe.getParameter(k.UNPACK_SKIP_PIXELS),Wt=pe.getParameter(k.UNPACK_SKIP_ROWS),oo=pe.getParameter(k.UNPACK_SKIP_IMAGES);pe.pixelStorei(k.UNPACK_ROW_LENGTH,lt.width),pe.pixelStorei(k.UNPACK_IMAGE_HEIGHT,lt.height),pe.pixelStorei(k.UNPACK_SKIP_PIXELS,Ee),pe.pixelStorei(k.UNPACK_SKIP_ROWS,Ue),pe.pixelStorei(k.UNPACK_SKIP_IMAGES,$e);const Mi=w.isDataArrayTexture||w.isData3DTexture,Xi=U.isDataArrayTexture||U.isData3DTexture;if(w.isDepthTexture){const Ze=Ie.get(w),Bt=Ie.get(U),Tn=Ie.get(Ze.__renderTarget),gt=Ie.get(Bt.__renderTarget);pe.bindFramebuffer(k.READ_FRAMEBUFFER,Tn.__webglFramebuffer),pe.bindFramebuffer(k.DRAW_FRAMEBUFFER,gt.__webglFramebuffer);for(let Ft=0;Ft<_e;Ft++)Mi&&(k.framebufferTextureLayer(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Ie.get(w).__webglTexture,W,$e+Ft),k.framebufferTextureLayer(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Ie.get(U).__webglTexture,ue,yt+Ft)),k.blitFramebuffer(Ee,Ue,Ee+ye,Ue+ce,Se,Xe,Se+ye,Xe+ce,k.DEPTH_BUFFER_BIT,k.NEAREST);pe.bindFramebuffer(k.READ_FRAMEBUFFER,null),pe.bindFramebuffer(k.DRAW_FRAMEBUFFER,null)}else if(W!==0||w.isRenderTargetTexture||Ie.has(w)){const Ze=Ie.get(w),Bt=Ie.get(U);pe.bindFramebuffer(k.READ_FRAMEBUFFER,A),pe.bindFramebuffer(k.DRAW_FRAMEBUFFER,F);for(let Tn=0;Tn<_e;Tn++)Mi?k.framebufferTextureLayer(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Ze.__webglTexture,W,$e+Tn):k.framebufferTexture2D(k.READ_FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,Ze.__webglTexture,W),Xi?k.framebufferTextureLayer(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,Bt.__webglTexture,ue,yt+Tn):k.framebufferTexture2D(k.DRAW_FRAMEBUFFER,k.COLOR_ATTACHMENT0,k.TEXTURE_2D,Bt.__webglTexture,ue),W!==0?k.blitFramebuffer(Ee,Ue,Ee+ye,Ue+ce,Se,Xe,Se+ye,Xe+ce,k.COLOR_BUFFER_BIT,k.NEAREST):Xi?k.copyTexSubImage3D(be,ue,Se,Xe,yt+Tn,Ee,Ue,ye,ce):k.copyTexSubImage2D(be,ue,Se,Xe,Ee,Ue,ye,ce);pe.bindFramebuffer(k.READ_FRAMEBUFFER,null),pe.bindFramebuffer(k.DRAW_FRAMEBUFFER,null)}else Xi?w.isDataTexture||w.isData3DTexture?k.texSubImage3D(be,ue,Se,Xe,yt,ye,ce,_e,at,Vt,lt.data):U.isCompressedArrayTexture?k.compressedTexSubImage3D(be,ue,Se,Xe,yt,ye,ce,_e,at,lt.data):k.texSubImage3D(be,ue,Se,Xe,yt,ye,ce,_e,at,Vt,lt):w.isDataTexture?k.texSubImage2D(k.TEXTURE_2D,ue,Se,Xe,ye,ce,at,Vt,lt.data):w.isCompressedTexture?k.compressedTexSubImage2D(k.TEXTURE_2D,ue,Se,Xe,lt.width,lt.height,at,lt.data):k.texSubImage2D(k.TEXTURE_2D,ue,Se,Xe,ye,ce,at,Vt,lt);pe.pixelStorei(k.UNPACK_ROW_LENGTH,Zt),pe.pixelStorei(k.UNPACK_IMAGE_HEIGHT,je),pe.pixelStorei(k.UNPACK_SKIP_PIXELS,$i),pe.pixelStorei(k.UNPACK_SKIP_ROWS,Wt),pe.pixelStorei(k.UNPACK_SKIP_IMAGES,oo),ue===0&&U.generateMipmaps===!0&&U.mipmapsAutoUpdate===!0&&k.generateMipmap(be),pe.unbindTexture()},this.initRenderTarget=function(w){Ie.get(w).__webglFramebuffer===void 0&&Fe.setupRenderTarget(w)},this.initTexture=function(w){w.isCubeTexture?Fe.setTextureCube(w,0):w.isData3DTexture?Fe.setTexture3D(w,0):w.isDataArrayTexture||w.isCompressedArrayTexture?Fe.setTexture2DArray(w,0):Fe.setTexture2D(w,0),pe.unbindTexture()},this.resetState=function(){O=0,N=0,q=null,pe.reset(),oe.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Fn}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=qe._getDrawingBufferColorSpace(e),t.unpackColorSpace=qe._getUnpackColorSpace()}}const Zf={core:1,rim:2.5},Jf=n=>n.toFixed(4),IE=`
  uniform int uFogOn;                // 0: nothing on this planet is fogged, misted or changing
  uniform highp sampler2D uFogCells; // cells x ${ga} RGBA float (model/fog.ts cellRows)
  uniform int uFogN;                 // grid cells
  uniform int uFogWin;               // search window, cells either side of p's latitude index
  vec4 fogTex(int i, int row) { return texelFetch(uFogCells, ivec2(i, row), 0); }
  // The nearest grid cell to p.
  int fogNearest(vec3 p) {
    int i0 = uFogN <= 1 ? 0 : int(floor((1.0 - p.y) * 0.5 * float(uFogN - 1) + 0.5));
    float b1 = -2.0;
    int i1 = 0;
    for (int i = max(0, i0 - uFogWin); i <= min(uFogN - 1, i0 + uFogWin); i++) {
      float d = dot(p, fogTex(i, 2).xyz);
      if (d > b1) { b1 = d; i1 = i; }
    }
    return i1;
  }
`,Sm=`
  uniform int uFogOn;      // 0: nothing on this planet is fogged, misted or changing
  uniform vec4 uFogPulse;  // the planet-clear pulse: xyz origin (surface frame), w progress (0: none)
  uniform vec3 uFogTeal;   // [OIII] teal, events only
  // Inverted lightness (art-direction §9's filter rule): the event rim.
  vec3 fogInvL(vec3 c) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)); return clamp(c + (1.0 - mx - mn), 0.0, 1.0); }
  vec3 fog(vec3 p, int b, vec3 c) {
    if (uFogOn == 0 || uFogPulse.w <= 0.0) return c;
    float s = uFogPulse.w;
    float e = (3.14159 * (1.0 - (1.0 - s) * (1.0 - s)) - acos(clamp(dot(p, uFogPulse.xyz), -1.0, 1.0))) / gPx;
    if (e >= 0.0 && e < ${Jf(Zf.rim)}) return e < ${Jf(Zf.core)} ? uFogTeal : fogInvL(c);
    return c;
  }
`,bm=`
  uniform float uFogSky;
  bool fogSkyOff() { return uFogSky > 0.5 && uFogOn == 0; }
`,wm=`
  ${IE}
  uniform mat4 uFogToSurface; // world → the surface's own frame
  bool fogHidesHaze(vec3 posW) {
    if (uFogOn == 0) return false;
    int i = fogNearest(normalize((uFogToSurface * vec4(posW, 1.0)).xyz));
    return fogTex(i, 0).x > 1.5 || fogTex(i, 1).x > 0.5;
  }
`,DE=`
  flat in vec4 vFog;
  in vec3 vLocal;
  uniform vec3 uMoonCloud[4]; // world.cloud: a fogged moon
  uniform vec3 uMoonMist[4];  // fog.mist: a misted moon's equator line
  uniform vec3 uMoonTeal[4];  // accent.teal: a fogged moon's cloud while it clears
  int moonRest(float level) { return level > 1.5 ? 2 : level > 0.5 ? 1 : 0; }
  vec3 moonFog(vec3 p, int b, vec3 c) {
    if (vFog.x < 0.5 && vFog.y < 0.5) return c;
    vec3 dp = dFdx(p), dq = dFdy(p);
    float px = max(1e-4, max(length(dp), length(dq)));
    int level = moonRest(vFog.x), from = moonRest(vFog.w);
    float d = acos(clamp(p.y, -1.0, 1.0)), s = vFog.z;
    bool teal = false;
    if (vFog.y > 0.5 && vFog.y < 1.5) {
      // a clear: the new level spreads from the north pole, the old one still ahead of it
      if (d > 3.2 * (1.0 - (1.0 - s) * (1.0 - s))) { teal = from == 2; level = from; }
    } else if (vFog.y > 1.5) {
      // a refog: the new level rolls in from the north pole, the old one still ahead of it
      if (3.14159 - d < 3.2 * (1.0 - s * s * (3.0 - 2.0 * s))) level = from;
    }
    if (level == 0) return c;
    if (level == 2) return teal ? uMoonTeal[b] : uMoonCloud[b];
    return abs(p.y) / px < 1.0 ? uMoonMist[b] : c;
  }
`,qt={lava:{freq:3.2,cut:.25,half:1.5,tip:.55,pool:{scale:.3,share:.3}},ice:{freq:3.8,cut:.23,half:1.2,tip:.55,pool:{scale:.35,share:.27}},lift:{max:.35,from:.44,to:1.67},heroPx:40.8,floorPx:1},ra={freq:1.2,warp:1,drift:.5,layer:[.337,.39,.65]},un={lush:0,ocean:1,ice:2,desert:3,lava:4,toxic:7},tt=n=>n.toFixed(3),Em=`
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
  float fbm(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * snoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s / 0.9375 * 0.5 + 0.5;
  }
`,Dh=`
  uniform vec3 uLight;
  uniform vec3 uBands;
  int band(vec3 n) {
    float d = dot(n, uLight);
    return d > uBands.z ? 3 : d > uBands.y ? 2 : d > uBands.x ? 1 : 0;
  }
`,Ms=`
  uniform vec3 uEye;
  uniform vec4 uDepthTint[4];
  uniform bool uDepthOn;
  uniform vec2 uDepthStretch;
  vec3 depthFade(vec3 c, vec3 posW, float k) {
    if (!uDepthOn) return c;
    float d = distance(posW, uEye);
    float x = log(max(d, 1e-3) / ${tt(Ws.near)}) / log(${tt(Ws.far)} / ${tt(Ws.near)}) * 3.0;
    if (x > 1.0) x = x <= 2.0 + uDepthStretch.y ? 1.0 + (x - 1.0) * uDepthStretch.x : x - uDepthStretch.y;
    x = clamp(x, 0.0, 3.0);
    int i = int(min(floor(x), 2.0));
    vec4 tint = mix(uDepthTint[i], uDepthTint[i + 1], x - float(i));
    return mix(c, tint.rgb, tint.a * k);
  }
`,Am=`
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vLocal;
  void main() {
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vLocal = position;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`,NE=Am.replace("out vec3 vLocal;",`out vec3 vLocal;
  in vec4 aFog;
  flat out vec4 vFog;`).replace("vLocal = position;",`vLocal = position;
    vFog = aFog;`),FE=`
  ${Dh}
  ${Ms}
  uniform vec3 uRamp[4];
  in vec3 vNormalW;
  in vec3 vPosW;
  ${DE}
  void main() {
    int b = band(normalize(vNormalW));
    gl_FragColor = vec4(depthFade(moonFog(normalize(vLocal), b, uRamp[b]), vPosW, 1.0), 1.0);
  }
`,ri={cuts:[.27,.5,.72,.9],core:[.1,.2],span:1.4,fade:.15},UE=`
  ${Em}
  ${Ms}
  uniform vec3 uDisc[5];
  uniform vec3 uCorona[2];
  uniform vec2 uChurn; // (cos, sin) of the churn angle
  uniform vec2 uSpin;  // (cos, sin) of the disc's turn
  uniform mat4 modelMatrix;
  uniform mat4 projectionMatrix;
  in vec3 vPosW;
  void main() {
    vec3 c = modelMatrix[3].xyz;
    float R = length(modelMatrix[0].xyz) / ${tt(ri.span)};
    vec3 rd = normalize(vPosW - uEye), oc = uEye - c;
    float b = dot(oc, rd), h = b * b - (dot(oc, oc) - R * R);
    float tFar = h >= 0.0 ? -b + sqrt(h) : -1.0;
    vec3 hit, col;
    if (tFar > 0.0) {
      float tNear = -b - sqrt(h);
      hit = uEye + rd * (tNear > 0.0 ? tNear : tFar); // the far side when the eye is inside the star
      vec3 n = (hit - c) / R;
      float mu = abs(dot(n, rd)); // 1 at the centre of the disc, 0 at the limb (from inside too: the core ahead)
      vec3 p = vec3(uSpin.x * n.x + uSpin.y * n.z, n.y, uSpin.x * n.z - uSpin.y * n.x); // into the turning disc's frame
      float g = fbm(p * 2.6 + vec3(uChurn * 0.7, 0.0));         // churning cells
      float g2 = snoise(p * 6.5 + vec3(0.0, uChurn.yx * 0.45)); // fine granulation
      float off = (g - 0.5) * 0.42 + g2 * 0.05;                  // the wobble, at most 0.26 either way
      float r = sqrt(max(1.0 - mu * mu, 0.0));                  // off the disc's centre as seen, in star radii
      float m = mu + max(off, -0.26 * smoothstep(${tt(ri.core[0])}, ${tt(ri.core[1])}, r)); // the middle never cools
      col = uDisc[m > ${tt(ri.cuts[3])} ? 4 : m > ${tt(ri.cuts[2])} ? 3 : m > ${tt(ri.cuts[1])} ? 2 : m > ${tt(ri.cuts[0])} ? 1 : 0];
    } else {
      vec3 axis = normalize(oc);
      float facing = dot(rd, axis);
      if (facing >= 0.0) discard; // the plane is behind the eye
      hit = uEye - rd * (dot(oc, axis) / facing);
      vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      vec3 up = camUp - axis * dot(camUp, axis);
      up = dot(up, up) < 1e-6 ? vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) : normalize(up);
      vec3 right = normalize(cross(up, axis));
      vec2 uv = vec2(dot(hit - c, right), dot(hit - c, up)) / R;
      float r = length(uv);
      vec2 a = uv / r;
      float f = fbm(vec3(a * 1.7, 0.0) + vec3(0.0, uChurn * 0.55)); // lumps round the rim
      float f2 = fbm(vec3(a * 4.2, 3.0) + vec3(uChurn.yx * 0.35, 0.0));
      float crown = 1.035 + 0.16 * pow(max(f - 0.38, 0.0) * 2.2, 2.0) + 0.03 * f2;
      if (r > min(${tt(Yn.halo)} + ${tt(Yn.lump)} * f + ${tt(Yn.grain)} * f2, ${tt(Yn.reach)})) discard; // past the halo
      col = r < crown ? uCorona[0] : uCorona[1];
    }
    vec4 clip = projectionMatrix * viewMatrix * vec4(hit, 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    gl_FragColor = vec4(depthFade(col, hit, ${tt(ri.fade)}), 1.0);
  }
`,OE=`
  vec3 hash33(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  // Integer cell hash (pcg3d), bit-exact on the CPU (noise.ts cellHash).
  uvec3 pcg3d(uvec3 v) {
    v = v * 1664525u + 1013904223u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    v ^= v >> 16u;
    v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
    return v;
  }
  vec3 cellHash(vec3 c) { return vec3(pcg3d(uvec3(ivec3(c) + 4096))) * (1.0 / 4294967296.0); }
  // Distance to the nearest Voronoi cell edge (Quilez's two-pass method); own = the nearest cell,
  // across = the neighbour on the other side of that edge (integer cell coords).
  float voronoiCells(vec3 p, out vec3 own, out vec3 across) {
    vec3 i = floor(p), f = fract(p);
    vec3 r1 = vec3(0.0), c1 = vec3(0.0);
    float d1 = 9.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      float dd = dot(r, r);
      if (dd < d1) { d1 = dd; r1 = r; c1 = g; }
    }
    float e = 9.0;
    vec3 ga = c1;
    for (int z = -2; z <= 2; z++) for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec3 g = c1 + vec3(x, y, z);
      vec3 r = g + cellHash(i + g) - f;
      vec3 dr = r - r1;
      if (dot(dr, dr) > 1e-5) {
        float d = dot(0.5 * (r1 + r), normalize(dr));
        if (d < e) { e = d; ga = g; }
      }
    }
    own = i + c1;
    across = i + ga;
    return e;
  }
  float poolField(vec3 cell, vec3 off, float scale) { return snoise((cell + cellHash(cell)) * scale + off.zxy) + (cellHash(cell + 31.0).x - 0.5) * 0.5; }
  float crackMask(vec3 p, float freq, vec3 off) { return snoise(p * freq * 0.35 + off.yzx) * 0.5 + 0.5; }
  const float LAVA_CRACK_FREQ = ${tt(qt.lava.freq)}, LAVA_CRACK_CUT = ${tt(qt.lava.cut)}, LAVA_POOL_SCALE = ${tt(qt.lava.pool.scale)};
  const float LAVA_CRACK_HALF = ${tt(qt.lava.half)}, LAVA_CRACK_TIP = ${tt(qt.lava.tip)};
  const float ICE_CRACK_FREQ = ${tt(qt.ice.freq)}, ICE_CRACK_CUT = ${tt(qt.ice.cut)}, ICE_POOL_SCALE = ${tt(qt.ice.pool.scale)};
  const float ICE_CRACK_HALF = ${tt(qt.ice.half)}, ICE_CRACK_TIP = ${tt(qt.ice.tip)};
  const float CRACK_HERO_PX = ${tt(qt.heroPx)}, CRACK_FLOOR_PX = ${tt(qt.floorPx)};
`,kE=`
  uniform vec2 uLavaTime;
  float fbmL(vec3 p) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 3; i++) { s += a * snoise(p); n += a; p = p * 2.03 + 11.7; a *= 0.5; }
    return s / n * 0.5 + 0.5;
  }
  vec3 fbm3v(vec3 p) { return vec3(snoise(p), snoise(p + vec3(5.2, 1.3, 2.8)), snoise(p + vec3(1.7, 9.2, 4.1))) * 0.5; }
  float lavaFlow(vec3 p) {
    const float D = ${tt(ra.drift)}, W = ${tt(ra.warp)};
    vec3 a = p * ${tt(ra.freq)} + uSeedOff.zxy;
    vec3 q = fbm3v(a + vec3(uLavaTime * D, 0.0));
    vec3 r = fbm3v(a + W * q + vec3(8.3, 2.8, 1.1) + vec3(0.0, uLavaTime.yx * D));
    return fbmL(a + W * r);
  }
`,Tm=`
  ${Em}
  ${Dh}
  ${Ms}
  uniform int uBiome;
  uniform vec3 uA[5];
  uniform vec3 uB[5];
  uniform vec3 uC[5];
  uniform vec3 uG[3];
  uniform vec3 uSeedOff;
  uniform float uSea;
  uniform mat4 modelMatrix;
  uniform float uPoolCut;
  uniform float uCrackLift;
  in vec3 vNormalW;
  in vec3 vLocal;
  in vec3 vPosW;

  ${OE}
  ${kE}
  vec2 worley(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d = 9.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(x, y, z);
      vec3 r = g + hash33(i + g) - f;
      float dd = dot(r, r);
      if (dd < d) { d = dd; id = hash33(i + g + 7.7).x; }
    }
    return vec2(sqrt(d), id);
  }
  float ridge(vec3 p) { return 1.0 - abs(snoise(p)); }

  // Screen scale, set once per fragment: gPx = sphere units per screen px here, gHero = screen px
  // per hero-framing px (crack widths are fixed on the planet, floored on screen).
  float gPx = 0.01, gHero = 1.0;
  void setScreenScale(vec3 p) {
    vec3 dx = dFdx(p), dy = dFdy(p);
    gPx = max(1e-5, max(length(dx), length(dy)));
    float size = length(modelMatrix[0].xyz);
    gHero = 1.0 / (CRACK_HERO_PX * gPx * size);
  }
  float worldPx(float heroPx, float floorPx) { return max(heroPx * gHero, floorPx); }
  float plates(vec3 p, float freq, vec3 off, out vec3 own, out vec3 across) { return voronoiCells(p * freq + off, own, across) / (freq * gPx); }
  float crackHero(vec3 p, float freq, vec3 off, float cut, float halfPx, float tipPx) {
    float w = halfPx * smoothstep(cut + uCrackLift, cut + uCrackLift + 0.25, crackMask(p, freq, off));
    return w < tipPx ? 0.0 : w;
  }
  float crackPx(float hero) { return hero > 0.0 ? worldPx(hero, CRACK_FLOOR_PX) : 0.0; }
  float gLavaV = 0.5;
  // Set by surface(): this pixel shows lava's emissive molten layer, which fades at half strength.
  bool gGlow = false;

  vec3 craters(vec3 p, vec3 c, int b, float scale, float density) {
    vec2 w = worley(p * scale + uSeedOff);
    if (w.y < density) {
      float r = 0.2 + 0.22 * fract(w.y * 13.1);
      if (w.x < r * 0.72) c = uB[max(b - 1, 0)];
      else if (w.x < r) c = uA[min(b + 1, 4)];
    }
    return c;
  }

  vec3 surface(vec3 p, int b) {
    vec3 c;
    gGlow = false;
    if (uBiome == ${un.lush} || uBiome == ${un.ocean} || uBiome == ${un.toxic}) {
      // lush / ocean / toxic: sea and land
      float h = fbm(p * 1.6 + uSeedOff) + (fbm(p * 4.1 + uSeedOff.zxy) - 0.5) * 0.22;
      if (h < uSea) c = uA[min(b + (h > uSea - 0.04 ? 1 : 0), 4)];
      else c = uB[min(b + (h > uSea + 0.11 ? 1 : 0), 4)];
      if (uBiome == ${un.toxic}) {
        if (h >= uSea && worley(p * 6.0 + uSeedOff).x < 0.3) c = uC[min(b + 1, 4)]; // oxidised crusts
        if (h < uSea && ridge(p * 5.0 + uSeedOff) > 0.965) c = uB[4]; // ember veins in the slag seas
      } else {
        float lat = abs(p.y) + (fbm(p * 3.0 + uSeedOff) - 0.5) * 0.25;
        if (lat > 0.9) c = uC[b]; // polar caps
      }
    } else if (uBiome == ${un.ice}) {
      // ice: bright strata cut by jagged crevasses (deeper blue at the core), over open water leads
      float h = fbm(p * 2.3 + uSeedOff);
      float strata = sin((p.y * 5.0 + h * 2.4) * 3.14159);
      c = uA[min(b + 1 + (strata > 0.55 ? 1 : 0), 4)];
      vec3 own, across;
      float dpx = plates(p, ICE_CRACK_FREQ, uSeedOff.yzx, own, across);
      if (poolField(own, uSeedOff.yzx, ICE_POOL_SCALE) > uPoolCut) {
        // open dark water between the sheets, with a paler submerged-ice fringe at the shore
        bool shore = poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut && dpx < worldPx(1.5, 1.5);
        c = shore ? uC[min(b, 2)] : uC[max(min(b, 2) - 1, 0)];
      } else {
        float w = crackPx(crackHero(p, ICE_CRACK_FREQ, uSeedOff.yzx, ICE_CRACK_CUT, ICE_CRACK_HALF, ICE_CRACK_TIP));
        // no crack along a shore: the water's fringe marks that edge
        if (dpx < w && poolField(across, uSeedOff.yzx, ICE_POOL_SCALE) <= uPoolCut) c = dpx < w * 0.5 ? uB[max(b - 1, 0)] : uB[min(b, 4)];
      }
    } else if (uBiome == ${un.desert}) {
      // desert: wind dunes and craters
      float h = fbm(p * 2.0 + uSeedOff);
      int shift = sin((p.y * 9.0 + p.x * 2.5 + h * 4.5) * 3.14159) > 0.3 ? 1 : 0;
      c = uA[min(b + shift, 4)];
      c = craters(p, c, b, 2.4, 0.3);
      c = craters(p, c, b, 5.2, 0.2);
    } else {
      // lava (layered): dark crust plates over a molten layer; a gap between plates is a crack and a
      // missing plate a pool, both showing the moving lava
      float h = fbm(p * 2.4 + uSeedOff);
      int crust = min(b, 2) + (h > 0.58 ? 1 : 0);
      c = uA[crust];
      vec3 own, across;
      float dpx = plates(p, LAVA_CRACK_FREQ, uSeedOff, own, across);
      bool pool = poolField(own, uSeedOff, LAVA_POOL_SCALE) > uPoolCut;
      bool shore = poolField(across, uSeedOff, LAVA_POOL_SCALE) <= uPoolCut;
      float w = 0.0;
      bool fissure = false;
      if (!pool) { w = crackPx(crackHero(p, LAVA_CRACK_FREQ, uSeedOff, LAVA_CRACK_CUT, LAVA_CRACK_HALF, LAVA_CRACK_TIP)); fissure = dpx < w && shore; }
      float v = gLavaV;
      const vec3 L = vec3(${ra.layer.map(tt).join(", ")});
      if (pool || fissure) {
        bool deep = pool && (!shore || dpx > worldPx(2.0, 2.0));
        bool skin = v < L.x && deep; // a dark cooling skin out in an open pool
        c = skin ? uA[crust + 1] : v < L.y ? uG[0] : v < L.z ? uG[1] : uG[2];
        gGlow = !skin;
      } else if ((w > 0.0 && shore && dpx < w + 1.0) || (!shore && dpx < 1.0)) {
        c = uA[4]; // the plate's lit 1 px edge facing the lava
      }
    }
    return c;
  }
`,BE=`${Tm}
  ${Sm}
  void main() {
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    if (uBiome == ${un.lava}) gLavaV = lavaFlow(p);
    int b = band(normalize(vNormalW));
    vec3 c = surface(p, b);
    bool glow = gGlow;
    vec3 f = fog(p, b, c);
    gl_FragColor = vec4(depthFade(f, vPosW, glow && f == c ? 0.5 : 1.0), 1.0);
  }
`,zE=.1,GE=`
  uniform vec3 uLight;
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform mat4 uToSurface;
  out vec3 vLocal;
  out vec3 vHitW;
  out vec3 vPosW;
  out float vReach;
  void main() {
    vec3 w = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
    vec3 oc = w - uCenter;
    float R = uRadius * 1.003, b = dot(oc, uLight), disc = b * b - (dot(oc, oc) - R * R);
    if (disc < 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float t = b - sqrt(disc);
    if (t <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    vec3 hit = w - uLight * t;
    vHitW = hit - uCenter;
    vPosW = hit;
    vReach = t / uRadius;
    vLocal = (uToSurface * vec4(hit, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(hit, 1.0);
  }
`,HE=`${Tm}
  ${Sm}
  ${bm}
  uniform float uShadowReach; // SHADOW_REACH
  in vec3 vHitW;
  in float vReach;
  void main() {
    if (fogSkyOff() || vReach < 0.0 || vReach > uShadowReach) discard;
    vec3 p = normalize(vLocal);
    setScreenScale(p);
    int b = band(normalize(vHitW));
    if (b == 0) discard;
    gl_FragColor = vec4(depthFade(fog(p, b, surface(p, b - 1)), vPosW, 1.0), 1.0);
  }
`,VE=`
  in vec4 aMass;
  out vec3 vNormalW;
  out vec3 vPosW;
  out vec3 vAnchorW;
  out float vMass;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vNormalW = normalize(transpose(inverse(mat3(m))) * normal);
    vec4 wp = m * vec4(position, 1.0);
    vPosW = wp.xyz;
    vAnchorW = (modelMatrix * vec4(aMass.xyz, 1.0)).xyz;
    vMass = aMass.w;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`,WE=`
  ${Dh}
  ${Ms}
  ${wm}
  ${bm}
  uniform float uSmoke; // 1: lava smoke, which rises from the fissures and so hints at the ground's health (#74)
  uniform vec3 uRamp[4];
  uniform vec3 uCenter;
  in vec3 vNormalW;
  in vec3 vPosW;
  in vec3 vAnchorW;
  in float vMass;
  uniform float uRadius;
  // Fogged ground under the smoke's own cell, or behind it along the view ray (at a slant the two differ).
  bool smokeFogged() {
    if (fogHidesHaze(vPosW)) return true;
    vec3 d = normalize(vPosW - uEye), oc = uEye - uCenter;
    float b = dot(oc, d), disc = b * b - (dot(oc, oc) - uRadius * uRadius);
    return disc >= 0.0 && b < 0.0 && fogHidesHaze(uEye + d * (-b - sqrt(disc)));
  }
  void main() {
    if (fogSkyOff()) discard;
    if (uSmoke > 0.5 && smokeFogged()) discard; // no smoke over a fogged or changing cell (it would hint at the band from under the cloud)
    vec3 g = normalize(vNormalW), r = normalize(vPosW - uCenter), m = normalize(vPosW - vAnchorW);
    float rg = dot(r, g), mg = dot(m, g);
    if (rg < 0.0) r -= rg * g;
    if (mg < 0.0) m -= mg * g;
    vec3 n = mix((g * 0.55 + r * 0.8) / 1.35, (g * 0.1 + r * 0.3 + m * 1.1) / 1.5, vMass);
    gl_FragColor = vec4(depthFade(uRamp[band(n)], vPosW, 1.0), 1.0);
  }
`,$E=`
  ${Ms}
  ${wm}
  uniform vec3 uHaze;
  uniform vec3 uLight;
  in vec3 vNormalW;
  in vec3 vPosW;
  void main() {
    vec3 n = normalize(vNormalW);
    float rim = 1.0 - abs(dot(n, normalize(uEye - vPosW)));
    if (rim < 0.72 || dot(n, uLight) < 0.3) discard;
    if (fogHidesHaze(vPosW)) discard;
    gl_FragColor = vec4(depthFade(uHaze, vPosW, 1.0), 1.0);
  }
`,XE=`
  in float aShade;
  out float vShade;
  void main() {
    vShade = aShade;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_PointSize = 1.0;
  }
`,qE=`
  uniform vec3 uRamp[3];
  in float vShade;
  void main() { gl_FragColor = vec4(uRamp[int(vShade)], 1.0); }
`,Qf="void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",YE=`
  uniform sampler2D uOverlay;
  void main() {
    vec4 c = texelFetch(uOverlay, ivec2(floor(gl_FragCoord.xy)), 0);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`,KE=`
  uniform sampler2D uSource;
  uniform float uScale;
  void main() { gl_FragColor = texelFetch(uSource, ivec2(floor(gl_FragCoord.xy / uScale)), 0); }
`;qe.enabled=!1;const us=n=>new Qe(n),Je=(n,e)=>Array.from({length:e},(t,i)=>us(n[Math.min(i,n.length-1)])),oa=new z(-.3,.55,.78).normalize(),ki={uLight:{value:oa.clone()},uEye:{value:new z},uDepthOn:{value:!0},uDepthStretch:{value:new ze(mu.squeeze,mu.shift)},uDepthTint:{value:we.world.depth.map(n=>{const e=us(n.tint);return new ct(e.r,e.g,e.b,n.strength)})}};function fs(n,e,t={}){return new an({vertexShader:Am,fragmentShader:n,uniforms:{...ki,...e},...t})}const Rm=n=>fs(FE,{uRamp:{value:Je(n,4)},uBands:{value:new z(-.15,.35,.7)},uMoonCloud:{value:Je(we.world.cloud,4)},uMoonMist:{value:Je(we.fog.mist,4)},uMoonTeal:{value:Je(we.accent.teal,4)}},{vertexShader:NE});function Cm(n,e,t,i){const s=new Yr(i,n,e);return s.boundingSphere=new Hi(new z,t),s}const ZE=new Ve,JE=new Qn,jf=new z,QE=new z;function Pm(n,e,t){jf.setScalar(t),e.forEach((i,s)=>n.setMatrixAt(s,ZE.compose(QE.set(i[0],i[1],i[2]),JE,jf))),n.instanceMatrix.needsUpdate=!0}const Aa={size:8,gap:2},Or=["...RR...","..RCCR..","..RCCR..","...RR...","...MM...","...MM...","...MM...","..MMMM.."],Bl=n=>Or.map(e=>[...e].reduce((t,i,s)=>i===n?t|1<<s:t,0)),jE=`
  in float aRadius;
  uniform vec2 uView;
  uniform float uSize;
  uniform float uGap;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = -mv.z;
    // the eye inside or behind the body: nothing to stand on, so the marker is clipped away
    if (dist <= aRadius) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
    vec4 centre = projectionMatrix * mv;
    // judged at the body's near side: in front of its own body, behind any nearer one
    vec4 front = projectionMatrix * vec4(mv.xyz + normalize(-mv.xyz) * aRadius, 1.0);
    // the disc's top on screen (its projected radius, as projectedRadius in camera/pose.ts), the gap,
    // then half the marker; whole internal pixels, so the shape's cells land on pixels
    vec2 px = (centre.xy / centre.w * 0.5 + 0.5) * uView;
    px.y += aRadius * projectionMatrix[1][1] / dist * 0.5 * uView.y + uGap + uSize * 0.5;
    px = floor(px + 0.5);
    gl_Position = vec4((px / uView * 2.0 - 1.0) * front.w, front.z, front.w);
    gl_PointSize = uSize;
  }
`,e1=`
  uniform float uSize;
  uniform int uRim[${Or.length}];
  uniform int uCore[${Or.length}];
  uniform int uMast[${Or.length}];
  uniform vec3 uRimColour;
  uniform vec3 uCoreColour;
  uniform vec3 uMastColour;
  void main() {
    ivec2 cell = ivec2(floor(gl_PointCoord * uSize)); // gl_PointCoord's origin is the top-left
    int bit = 1 << cell.x;
    if ((uCore[cell.y] & bit) != 0) gl_FragColor = vec4(uCoreColour, 1.0);
    else if ((uRim[cell.y] & bit) != 0) gl_FragColor = vec4(uRimColour, 1.0);
    else if ((uMast[cell.y] & bit) != 0) gl_FragColor = vec4(uMastColour, 1.0);
    else discard;
  }
`;class t1{points;geo=new An;mat;spots=[];constructor(){this.mat=new an({vertexShader:jE,fragmentShader:e1,depthWrite:!1,uniforms:{uView:{value:new ze(da(180),180)},uSize:{value:Aa.size},uGap:{value:Aa.gap},uRim:{value:Bl("R")},uCore:{value:Bl("C")},uMast:{value:Bl("M")},uRimColour:{value:us(we.crew.suit[1])},uCoreColour:{value:us(we.crew.glint)},uMastColour:{value:us(we.crew.gear[3])}}}),this.set([]),this.points=new sm(this.geo,this.mat),this.points.frustumCulled=!1,this.points.visible=!1}set(e){this.spots=e,this.geo.setAttribute("position",new Pt(new Float32Array(e.length*3),3)),this.geo.setAttribute("aRadius",new Pt(new Float32Array(e.length),1))}get count(){return this.spots.length}pose(e,t,i,s){if(this.points.visible=this.spots.length>0,!this.points.visible)return;const r=this.geo.getAttribute("position"),o=this.geo.getAttribute("aRadius");this.spots.forEach((a,c)=>{const l=Pd(e,a,t);r.setXYZ(c,l.centre[0]-s[0],l.centre[1]-s[1],l.centre[2]-s[2]),o.setX(c,l.radius)}),r.needsUpdate=!0,o.needsUpdate=!0,this.mat.uniforms.uView.value.set(da(i),i)}dispose(){this.geo.dispose(),this.mat.dispose()}}const Be=we.world,Sr=6,ed=2*Sr+1,zl=(()=>{const n=[-.55,.6,.58],e=Math.hypot(...n);return n.map(t=>t/e)})(),aa=(n,e,t)=>((n*7+e*13+t*5^n*e)&7)<3;function li(n){const e=[];for(let t=0;t<ed;t++){let i="";for(let s=0;s<ed;s++){const r=(s-Sr)/(Sr+.5),o=(Sr-t)/(Sr+.5),a=r*r+o*o;if(a>1){i+=".";continue}const c=r*zl[0]+o*zl[1]+Math.sqrt(1-a)*zl[2];i+=n(s,t,c>.62?2:c>.12?1:0)??"."}e.push(i)}return e}const oi=n=>e=>n[e],la=(n,e,t)=>aa(e,t,1)?oi("def")(n):oi("abc")(n),ca={a:Be.ocean[0],b:Be.ocean[2],c:Be.ocean[3],d:Be.land[1],e:Be.land[2],f:Be.land[3]},ji={lava:{rows:li((n,e,t)=>(n+2*e)%6===0||(2*n-e+30)%9===0?t===2?"g":"h":oi("abc")(t)),colours:{a:Be.crust[1],b:Be.crust[3],c:Be.crust[4],g:Be.glow[2],h:Be.glow[1]}},toxic:{rows:li((n,e,t)=>aa(n,e,3)?oi("def")(t):oi("abc")(t)),colours:{a:Be.toxic[0],b:Be.toxic[2],c:Be.toxic[4],d:Be.sludge[1],e:Be.sludge[3],f:Be.sludge[4]}},ash:{rows:li((n,e,t)=>(n-7)**2+(e-7)**2<=2||(n-3)**2+(e-8)**2<=1?"d":oi("abc")(t)),colours:{a:Be.sand[0],b:Be.sand[2],c:Be.sand[3],d:Be.sand[1]}},lush:{rows:li((n,e,t)=>la(t,n,e)),colours:ca},ocean:{rows:li((n,e,t)=>aa(n,e,5)&&aa(e,n,2)?oi("def")(t):oi("abc")(t)),colours:{a:Be.water[0],b:Be.water[2],c:Be.water[3],d:Be.land[1],e:Be.land[2],f:Be.land[3]}},ice:{rows:li((n,e,t)=>(n+e)%5===0?"d":oi("abc")(t)),colours:{a:Be.ice[0],b:Be.ice[2],c:Be.ice[4],d:Be.crevasse[1]}}},Gl={fogged:{rows:li((n,e,t)=>(n-4)**2+(e-4)**2<=6||(n-8)**2+(e-7)**2<=5||(n-4)**2+(e-10)**2<=3?t===0?"w":"v":la(t,n,e)),colours:{...ca,v:Be.cloud[1],w:Be.cloud[0]}},misted:{rows:li((n,e,t)=>(n*3+e*5)%11===0&&t>0?"v":la(t,n,e)),colours:{...ca,v:Be.cloud[3]}},clear:{rows:li((n,e,t)=>la(t,n,e)),colours:ca}},Bs={drone:{rows:[".....ss.....","...ssttss...","..sddddddss.",".sdveevvedss",".sdvvvvvvdss","..sddddddss.","...ssssss...","....s..s....","...m....m..."],colours:{s:we.drone.claude.shell[1],t:we.drone.claude.shell[3],d:we.drone.claude.shell[2],v:we.crew.visor[0],e:we.accent.teal[3],m:we.drone.claude.smoke[0]}},ship:{rows:["....hhhh....","..hhsssshh..",".hsswsswsssh",".hsswsswsssh","hssssssssssh","tttttttttttt",".mmmmmmmmmm.","..m..ff..m..",".....ff....."],colours:{h:we.ship.hull.shell[1],s:we.ship.hull.shell[2],w:we.ship.hull.interior[0],t:we.ship.hull.trim[2],m:we.ship.hull.metal[2],f:we.ship.hull.flame[2]}},cochange:{rows:["oo..........","oo..........","..rrHT......","..rrHTrr....","......rrrr..","........rroo","..........oo"],colours:{o:Be.stars[1],r:Be.stars[0],H:Be.stars[2],T:Be.stars[1]}},flag:{rows:[".dd.....rrr.","dddd...r...r","ddddlllr...r","dddd...r...r",".dd.....rrr."],colours:{d:we.accent.teal[2],l:we.accent.teal[2],r:we.accent.teal[3]}},beacon:{rows:Or,colours:{R:we.crew.suit[1],C:we.crew.glint,M:we.crew.gear[3]}},moon:{rows:["..aab..",".abbcc.","abbccc.","abbbcc.",".aabb.."],colours:{a:Be.moonBody[0],b:Be.moonBody[1],c:Be.moonBody[2]}}};function n1(n,e,t){const i=Math.max(1,Math.round(e*t)),s=Math.max(...n.rows.map(a=>a.length)),r=document.createElement("canvas");r.width=s*i,r.height=n.rows.length*i,r.style.width=`${r.width/t}px`,r.style.height=`${r.height/t}px`,r.className="icon",r.setAttribute("aria-hidden","true");const o=r.getContext("2d");return o&&n.rows.forEach((a,c)=>[...a].forEach((l,h)=>{const u=n.colours[l];u!==void 0&&(o.fillStyle=u,o.fillRect(h*i,c*i,i,i))})),r}const Lm=()=>devicePixelRatio||1;function i1(n,e=Lm()){const t=n.dataset.text;if(!t)return;const i=Math.max(1,Math.round(Number(n.dataset.px??2)*e));if(!n.querySelector(":scope > .sr")){const r=document.createElement("span");r.className="sr",r.textContent=n.textContent,n.replaceChildren(r)}n.querySelector(":scope > canvas.bitmap")?.remove();const s=eo(t,i,e,n.classList.contains("accent")?ht.accent:ht.ink);s.classList.add("bitmap"),n.prepend(s)}function Qc(n=document){for(const e of n.querySelectorAll(".bitmap-host"))i1(e)}function s1(){const n=We("demo-title"),e=We("demo-play");return e.focus({preventScroll:!0}),new Promise(t=>{e.addEventListener("click",()=>{n.hidden=!0,t()},{once:!0})})}const r1=[{title:"planets",icons:[{icon:ji.lush},{icon:Bs.moon}],text:"The star is the repository. Each top-level folder is a planet and each file a settlement on it; bigger planets hold more code. Moons are test files."},{title:"health, worst to best",icons:[{icon:ji.lava,caption:"lava"},{icon:ji.toxic,caption:"toxic"},{icon:ji.ash,caption:"desert"},{icon:ji.lush,caption:"lush"},{icon:ji.ocean,caption:"ocean"},{icon:ji.ice,caption:"ice"}],text:"A planet's look is its code health, from how many debt markers (TODO, FIXME, HACK, XXX) it has per 1,000 lines. Lush, ocean and ice all mean healthy."},{title:"fog of war",icons:[{icon:Gl.fogged,caption:"unseen"},{icon:Gl.misted,caption:"read"},{icon:Gl.clear,caption:"clear"}],text:"Cloud covers code an agent, a teammate or an unknown author changed that you haven't reviewed. Read a file's diff in the review panel and its cloud thins to mist. Clear means understood."},{title:"drones",icons:[{icon:Bs.drone}],text:"Each drone is one AI agent session, circling the planet that holds most of the files it edited. Click one to see the files it edited and when."},{title:"the crew",icons:[{icon:Bs.ship}],text:"The people who committed lately ride in the ship; the captain in the gold cap is you. Click a porthole to see what they touched."},{title:"co-change",icons:[{icon:Bs.cochange},{icon:Bs.flag}],text:"Focus a planet to see starlight lines to files that usually change with it. A teal flag marks a file whose usual partner changed lately without it."},{title:"beacons",icons:[{icon:Bs.beacon}],text:"A note from the captain's log, left on a file when you chart it."}],o1="Click a planet or press [ ] to focus one · drag to look · W A S D to fly · R F up and down · wheel to zoom · H for home · Esc for free flight · the files button opens the directory view.";class a1{root=We("demo-legend");toggle=We("demo-legend-toggle");built=0;release=()=>{};constructor(){this.toggle.addEventListener("click",()=>this.root.hidden?this.open():this.close()),this.root.addEventListener("keydown",e=>{e.key==="Escape"&&(e.preventDefault(),e.stopPropagation(),this.close())})}get isOpen(){return!this.root.hidden}open(){this.build(),this.root.hidden=!1,this.toggle.setAttribute("aria-expanded","true"),this.root.querySelector('[data-key="close"]')?.focus({preventScroll:!0})}close(){this.root.hidden||(this.root.hidden=!0,this.toggle.setAttribute("aria-expanded","false"),this.release())}rescale(){if(this.built===0)return;const e=document.activeElement,t=e instanceof HTMLElement&&this.root.contains(e)?e.dataset.key??"":null;this.built=0,this.build(),t!==null&&(this.root.querySelector(`[data-key="${CSS.escape(t)}"]`)??this.root).focus({preventScroll:!0})}build(){const e=Lm();if(this.built===e)return;this.built=e;const t=document.createElement("div");t.className="top";const i=document.createElement("h2");i.id="demo-legend-title",i.className="bitmap-host",i.dataset.text="how to read the map",i.dataset.px="2",i.textContent="How to read the map";const s=document.createElement("button");s.type="button",s.className="bitmap-host",s.dataset.text="close",s.dataset.px="2",s.dataset.key="close",s.textContent="Close the legend",s.addEventListener("click",()=>this.close()),t.append(i,s);const r=document.createElement("dl");for(const a of r1){const c=document.createElement("dt"),l=document.createElement("div");l.className="pics";for(const{icon:d,caption:p}of a.icons){const x=document.createElement("span");if(x.className="pic",x.append(n1(d,2,e)),p){const m=document.createElement("span");m.className="cap",m.textContent=p,x.append(m)}l.append(x)}const h=document.createElement("span");h.className="bitmap-host name",h.dataset.text=a.title,h.dataset.px="2",h.textContent=a.title,c.append(h,l);const u=document.createElement("dd");u.textContent=a.text;const f=document.createElement("div");f.className="entry",f.append(c,u),r.append(f)}const o=document.createElement("p");o.className="how",o.textContent=o1,this.root.replaceChildren(t,r,o),Qc(this.root)}}function l1(){We("demo-badge").hidden=!1}function td(n,e,t,i,s,r,o){const a=d=>{const p=jt(n,d.centre);return p?{depth:p.depth,x:(p.x+1)/2*i,y:(1-p.y)/2*s,r:Fi(d.radius,p.depth,Gt(n))*(s/2)}:null},c=e.map(a),l=[...c,...t.map(d=>d.flat?null:a(d))],h=t.flatMap(d=>{const p=d.flat?jt(n,d.centre):null;return p?[{o:d,depth:p.depth}]:[]}),u=(d,p)=>({x:d/i*2-1,y:1-p/s*2}),f=[];return c.forEach((d,p)=>{if(!d||d.x<-d.r||d.x>i+d.r||d.y<-d.r||d.y>s+d.r)return;const x=d.y+d.r+r,m=(M,E)=>M!==null&&E!==p&&M.depth<d.depth&&(Math.hypot(M.x-d.x,M.y-d.y)<M.r||Math.hypot(M.x-d.x,M.y-x)<M.r),g=M=>M.depth<d.depth&&(tc(n,u(d.x,d.y),M.o)<1/0||tc(n,u(d.x,x),M.o)<1/0);!l.some(m)&&!h.some(g)&&f.push({i:p,x:d.x,y:x,depth:d.depth})}),f.sort((d,p)=>d.depth-p.depth||d.i-p.i),f.slice(0,Math.max(0,o)).map(({i:d,x:p,y:x})=>({i:d,x:p,y:x}))}const c1=(n,e)=>Math.max(0,Math.min(n.x+n.w,e.x+e.w)-Math.max(n.x,e.x))*Math.max(0,Math.min(n.y+n.h,e.y+e.h)-Math.max(n.y,e.y));function h1(n,e,t,i,s){const r=(l,h,u)=>Math.max(0,Math.min(l,u-h)),o=[n.x,...e.flatMap(l=>[l.x-s-n.w,l.x+l.w+s])].map(l=>r(l,n.w,t)),a=[n.y,...e.flatMap(l=>[l.y-s-n.h,l.y+l.h+s])].map(l=>r(l,n.h,i));let c={dx:0,dy:0,covered:1/0,moved:1/0};for(const l of o)for(const h of a){const u=e.reduce((d,p)=>d+c1({...n,x:l,y:h},p),0),f=Math.hypot(l-n.x,h-n.y);(u<c.covered||u===c.covered&&f<c.moved)&&(c={dx:l-n.x,dy:h-n.y,covered:u,moved:f})}return{dx:c.dx,dy:c.dy}}const u1={cap:5},nd=[150,300,500],f1=n=>n>=nd[2]?2:n>=nd[1]?1:0,d1=4,Im=(n,e)=>e.strengthMilli-n.strengthMilli||(n.file.fileId<e.file.fileId?-1:n.file.fileId>e.file.fileId?1:0);function id(n,e){const t=new Map;e.planets.forEach((l,h)=>{for(const u of l.surface.settlements)t.set(u.fileId,{spot:{body:h,moon:null},testOf:null});l.moons.forEach((u,f)=>t.set(u.fileId,{spot:{body:h,moon:f},testOf:u.testOf}))});for(const l of e.star.moonlets)t.set(l.fileId,{spot:{body:-1,moon:null},testOf:null});const i=new Map(e.planets.map((l,h)=>[l.dirId,h])),s=new Map;for(const l of n.files){const h=t.get(l.fileId),u=l.home==="star"?-1:i.get(l.home),f=h?.spot??(u===void 0?null:{body:u,moon:null});s.set(l.fileId,{fileId:l.fileId,path:l.path,spot:f,testOf:h?.testOf??null})}const r=new Map,o=(l,h,u)=>{const f=s.get(h),d=r.get(l);d?d.push({file:f,strengthMilli:u}):r.set(l,[{file:f,strengthMilli:u}])};for(const l of n.links)o(l.a,l.b,l.strengthMilli),o(l.b,l.a,l.strengthMilli);for(const l of r.values())l.sort(Im);const a=[];let c=0;for(const l of n.flags){const h=s.get(l.fileId),u=s.get(l.with);if(!h.spot){c++;continue}a.push({file:h,with:u,strengthMilli:l.strengthMilli,test:h.spot.moon!==null&&h.testOf===u.fileId})}return{files:s,partners:r,flags:a,unplacedFlags:c}}function p1(n,e,t){return e!==null?{planet:e,file:t}:t!==null&&n?.files.get(t)?.spot?.body===-1?{planet:-1,file:t}:null}const sd=()=>({lines:[],named:[],tests:[],byFile:!1});function Dm(n,e){if(!n||!e)return sd();const t=e.planet,i=sd(),s=new Set,r=new Map,o=(c,l)=>{const h=c.spot.body,u=r.get(h);u?u.files.push(c):r.set(h,{body:h,strengthMilli:l,step:f1(l),files:[c]})},a=e.file===null?null:n.files.get(e.file);if(a&&a.spot?.body===t){for(const{file:c,strengthMilli:l}of(n.partners.get(a.fileId)??[]).slice(0,u1.cap))!c.spot||c.spot.body===t&&c.spot.moon===null?i.named.push(c):c.spot.body===t?s.add(c):o(c,l);i.lines=[...r.values()],i.byFile=!0}else{const c=[];for(const l of n.files.values())if(l.spot?.body===t)for(const{file:h,strengthMilli:u}of n.partners.get(l.fileId)??[])h.spot&&(h.spot.body!==t?c.push({g:h,strengthMilli:u}):h.spot.moon!==null&&l.spot.moon===null&&s.add(h));c.sort((l,h)=>Im({file:l.g,strengthMilli:l.strengthMilli},{file:h.g,strengthMilli:h.strengthMilli}));for(const{g:l,strengthMilli:h}of c)r.get(l.spot.body)?.files.includes(l)||o(l,h);i.lines=[...r.values()].sort((l,h)=>h.strengthMilli-l.strengthMilli||l.body-h.body).slice(0,d1)}return i.tests=[...s].sort((c,l)=>c.fileId<l.fileId?-1:1),i}const m1=(n,e)=>!!e&&(e.planet===n.file.spot?.body||e.planet===n.with.spot?.body||e.file===n.file.fileId||e.file===n.with.fileId),jc=n=>n.test?[n.with.path,"tests usually change with this"]:[n.file.path,`usually changes with ${n.with.path}`],Xo=n=>n.split("/").slice(-2).join("/"),g1=["weak","mid","strong"];function v1(n,e,t,i=0){if(!n)return[];const s=l=>l<0?"the star":e.planets[l]?.path??"a planet",r=[],o=Dm(n,t),a=[...o.lines.map(l=>`${o.byFile?l.files.map(h=>h.path).join(", "):s(l.body)} (${g1[l.step]})`),...o.named.map(l=>l.path),...o.tests.length?["its tests"]:[]];a.length&&r.push(`usually changes with ${a.join(", ")}`);for(const l of n.flags)r.push(`missing pair: ${jc(l).join(": ")}`);const c=n.unplacedFlags;return c>0&&r.push(`${c} missing ${c===1?"pair":"pairs"} not drawn`),i>0&&r.push(`${i} missing ${i===1?"pair":"pairs"} charted`),r}function _1(n,e){const t=fi(e,Ni.starChurn),i=Math.cos(t),s=Math.sin(t),r=Au(n[0]*1.7,n[1]*1.7+i*.55,s*.55),o=Au(n[0]*4.2+s*.35,n[1]*4.2+i*.35,3);return Math.min(Yn.halo+Yn.lump*r+Yn.grain*o,Yn.reach)}const Nm=(n,e)=>[{centre:[0,0,0],radius:n},{centre:[0,0,0],radius:n*Yn.reach,flat:!0,edge:t=>n*_1(t,e)}];function x1(n,e=1){const t=[];if(n.length===0)return t;t.push({x:n[0].x,y:n[0].y,s:0});let i=0,s=e;for(let r=1;r<n.length;r++){const o=n[r-1],a=n[r],c=Math.hypot(a.x-o.x,a.y-o.y);for(;c>0&&s<=i+c;){const l=(s-i)/c;t.push({x:o.x+(a.x-o.x)*l,y:o.y+(a.y-o.y)*l,s}),s+=e}i+=c}return t}const Fm=(n,e,t)=>[Math.round(n-t/2),Math.round(e-t/2)];function M1(n,e,t,i,s,r){const[o,a]=Fm(i,s,r);if(o<0||a<0||o+r>e||a+r>t)return!1;for(let c=0;c<r;c++)for(let l=0;l<r;l++)if(n[(a+c)*e+o+l])return!1;return!0}function Um(n,e,t,i,s,r,o,a){if(!M1(e,t,i,s,r,o))return!1;const[c,l]=Fm(s,r,o);for(let h=0;h<o;h++)n.fill(a,(l+h)*t+c,(l+h)*t+c+o);return!0}function y1(n,e,t,i=1.5){const s=(a,c)=>!c||Math.hypot(a.x-c.x,a.y-c.y)>c.r+i;let r=null,o=0;for(const a of n)s(a,e)&&s(a,t)&&(r??=a.s,o=a.s);return r===null||o-r<2?null:[r,o]}const S1=n=>1-(1-n)**3,rd={dur:.7,stagger:.1};function b1(n,e,t=!1){if(t)return n>=0?1:0;const i=(n-e*rd.stagger)/rd.dur;return i<=0?0:i>=1?1:S1(i)}function w1(n,e,t,i,s,r,o,a,c=1){if(!r||c<=0)return 0;const[l,h]=r,u=l+c*(h-l);let f=0;for(const d of s)d.s<l||d.s>u||Um(n,e,t,i,d.x,d.y,o,a)&&f++;return f}function E1(n,e,t,i,s,r,o,a=1){if(!r||a<=0)return 0;const[c,l]=r,h=l-c,u=c+a*h;let f=0;for(let d=0;d<o.n;d++){const p=c+((o.u+d/o.n)%1+1)%1*h;for(const x of s)x.s>p||x.s<=p-o.len||x.s<c||x.s>u||Um(n,e,t,i,x.x,x.y,o.w,p-x.s<o.headLen?o.head:o.tail)&&f++}return f}function A1(n,e,t,i){const s=new Set(i),r=new Uint8Array(e*t);for(let o=0;o<e*t;o++)r[o]=s.has(n[4*o]<<16|n[4*o+1]<<8|n[4*o+2])?0:1;return r}const T1=n=>parseInt(n.slice(1),16);function R1(n,e,t,i=1){const s=new Uint8Array(e*t);for(let r=0;r<t;r++)for(let o=0;o<e;o++)if(n[r*e+o])for(let a=Math.max(0,r-i);a<=Math.min(t-1,r+i);a++)s.fill(1,a*e+Math.max(0,o-i),a*e+Math.min(e-1,o+i)+1);return s}function qo(n,e,t,i,s=1){const r=Math.max(0,Math.floor(i.x)-s),o=Math.max(0,Math.floor(i.y)-s),a=Math.min(e,Math.ceil(i.x+i.w)+s),c=Math.min(t,Math.ceil(i.y+i.h)+s);for(let l=o;l<c;l++)a>r&&n.fill(1,l*e+r,l*e+a)}function Hl(n,e,t,i,s,r,o){i.forEach((a,c)=>[...a].forEach((l,h)=>{const u=s+h,f=r+c;l!=="."&&u>=0&&f>=0&&u<e&&f<t&&(n[f*e+u]=o[l])}))}function C1(n,e,t,i,s,r){const o=e.x-n.x,a=e.y-n.y;let c=0,l=1;const h=[[-o,n.x-t],[o,s-n.x],[-a,n.y-i],[a,r-n.y]];for(const[u,f]of h){if(u===0){if(f<0)return null;continue}const d=f/u;if(u<0){if(d>l)return null;d>c&&(c=d)}else{if(d<c)return null;d<l&&(l=d)}}return[{x:n.x+c*o,y:n.y+c*a},{x:n.x+l*o,y:n.y+l*a}]}const os={rail:1,tail:2,head:3,flagDot:4,flagRing:5},[P1,L1,I1]=we.world.stars,D1=[null,P1,L1,I1,we.accent.teal[2],we.accent.teal[3]],N1=[we.world.space,...we.world.stars].map(T1),zs={w:2,len:6,headLen:2,seconds:3,stagger:.17},F1=[1,2,3],eh=[".......RRRR.",".##...RRRRRR","######RR..RR","######RR..RR",".##...RRRRRR",".......RRRR."],U1={"#":os.flagDot,R:os.flagRing},Vl=2,th=["R","R"],Om={right:["A...","AA..","AAA.","AAAA","AAA.","AA..","A..."],left:["...A","..AA",".AAA","AAAA",".AAA","..AA","...A"],top:["...A...","..AAA..",".AAAAA.","AAAAAAA"],bottom:["AAAAAAA",".AAAAA.","..AAA..","...A..."]},O1={A:os.tail},Ai=2,k1=3,Wl=(n,e,t)=>e<0?[0,0,0]:Kn(n.planets[e],t),B1=(n,e)=>e<0?n.star.radius:n.planets[e].radius;function nh(n,e,t,i){const s=jt(n,e);return s&&{x:(s.x+1)/2*t,y:(1-s.y)/2*i,depth:s.depth}}function $l(n,e,t,i,s){const r=nh(n,e,i,s);return r&&{...r,r:Fi(t,r.depth,Gt(n))*(s/2)}}function z1(n,e,t,i){const s=n.planets.map(a=>({centre:Kn(a,t),radius:a.radius}));if(i>=0){const a=jt(e,s[i].centre);return!a||Cr(e,a,s,Nm(n.star.radius,t),0)!==i}const r=jt(e,[0,0,0]);if(!r)return!0;const o=Cr(e,r,s,[],0);return o!==null&&(jt(e,s[o].centre)?.depth??1/0)<r.depth}const Xl=(n,e,t)=>n.x+n.r<0||n.x-n.r>e||n.y+n.r<0||n.y-n.r>t;function G1(n,e,t,i,s){const r=nh(n,t,i,s);if(r)return r;const o=_i(n.yaw,n.pitch).fwd,a=Gi(n),c=Yt(sn(e,a),o),l=Yt(sn(t,a),o);if(c<=4*Ks||c===l)return null;const h=(c-4*Ks)/(c-l);return nh(n,Kt(e,[(t[0]-e[0])*h,(t[1]-e[1])*h,(t[2]-e[2])*h]),i,s)}function H1(n,e,t){return[...[[n.x,"left"],[e-n.x,"right"],[n.y,"top"],[t-n.y,"bottom"]]].sort((s,r)=>s[0]-r[0])[0][1]}function V1(n,e,t,i){const s=Om[e],r=s[0].length,o=s.length,a=l=>Math.min(Math.max(Math.round(l),Ai),t-Ai-r),c=l=>Math.min(Math.max(Math.round(l),Ai),i-Ai-o);return e==="left"?{x:Ai,y:c(n.y-o/2),w:r,h:o}:e==="right"?{x:t-Ai-r,y:c(n.y-o/2),w:r,h:o}:e==="top"?{x:a(n.x-r/2),y:Ai,w:r,h:o}:{x:a(n.x-r/2),y:i-Ai-o,w:r,h:o}}function W1(n){const{model:e,index:t,focus:i,frame:s,pose:r,W:o,H:a}=n,c={focus:i,lines:[],arrows:[],flags:[],ticks:[],named:[],tests:!1,byFile:!1};if(!t)return c;const l=T=>$l(r,Wl(e,T,s),B1(e,T),o,a),h=T=>{const b=e.planets[T.spot.body],v=Kn(b,s),_=$l(r,Kt(v,Ra(b.moons[T.spot.moon],s)),Jr,o,a),R=$l(r,v,b.radius,o,a);return!_||R&&_.depth>R.depth&&Math.hypot(_.x-R.x,_.y-R.y)<R.r?null:_},u=T=>{const b=h(T);b&&!Xl(b,o,a)&&c.ticks.push({x:Math.round(b.x),y:Math.round(b.y-b.r)-1-th.length})},f=Dm(t,i);c.named=f.named,c.tests=f.tests.length>0,c.byFile=f.byFile;for(const T of f.tests)u(T);const d=i?l(i.planet):null;if(i&&d){const T=Wl(e,i.planet,s);f.lines.forEach((b,v)=>{const _=l(b.body),R=G1(r,T,Wl(e,b.body,s),o,a);if(!R)return;const C=C1(d,R,0,0,o,a),L=!_||Xl(_,o,a);if(C){const D=x1(C,1);c.lines.push({body:b.body,rank:v,step:b.step,strengthMilli:b.strengthMilli,files:b.files,samples:D,span:y1(D,d,_)})}if(L){const D=C?C[1]:R,B=H1(D,o,a);c.arrows.push({body:b.body,files:b.files,edge:B,box:V1(D,B,o,a)})}})}const p=(T,b)=>b.strengthMilli-T.strengthMilli||(T.file.fileId<b.file.fileId?-1:1),x=new Map;for(const T of t.flags){const b=T.file.spot.body;x.set(b,[...x.get(b)??[],T]),T.file.spot.moon!==null&&u(T.file)}const m=t.flags.filter(T=>m1(T,i)).sort(p),g=new Set(m.slice(0,k1)),M=m[g.size-1],E=eh[0].length,y=eh.length;for(const[T,b]of[...x].sort((v,_)=>v[0]-_[0])){const v=l(T);if(!v||Xl(v,o,a)||z1(e,r,s,T))continue;const _=[...b].sort(p),R=_.filter(D=>g.has(D)).flatMap(jc);M&&_.includes(M)&&m.length>g.size&&R.push(`+${m.length-g.size} more`);const C=v.x+v.r+Vl+E+2+Math.max(..._.flatMap(jc).map(n.textW))+1<=o,L={x:Math.round(C?v.x+v.r+Vl:v.x-v.r-Vl-E),y:Math.round(v.y-y/2),w:E,h:y};c.flags.push({body:T,flags:_,box:L,right:C,text:R,show:R.length>0})}return c}const $1=n=>n.lines.length>0||n.arrows.length>0||n.flags.length>0||n.ticks.length>0;function X1(n,e){if(!$1(n))return null;const{W:t,H:i}=e,s=new Uint8Array(t*i);if(n.lines.length>0){const r=R1(A1(e.pixels(),t,i,N1),t,i,1);for(const l of e.labels)qo(r,t,i,l,1);for(const l of n.flags)qo(r,t,i,l.box,1);for(const l of n.arrows)qo(r,t,i,l.box,1);for(const l of n.ticks)qo(r,t,i,{x:l.x,y:l.y,w:1,h:th.length},1);const o=[...n.lines].sort((l,h)=>l.strengthMilli-h.strengthMilli||h.rank-l.rank),a=new Map(o.map(l=>[l,b1(e.since,l.rank,e.reduced)]));for(const l of o)w1(s,r,t,i,l.samples,l.span,zs.w,os.rail,a.get(l));const c=vi(e.frame)*(gi/zs.seconds);for(const l of o)E1(s,r,t,i,l.samples,l.span,{w:zs.w,n:F1[l.step],u:c+l.rank*zs.stagger,len:zs.len,headLen:zs.headLen,head:os.head,tail:os.tail},a.get(l))}for(const r of n.flags)Hl(s,t,i,eh,r.box.x,r.box.y,U1);for(const r of n.arrows)Hl(s,t,i,Om[r.edge],r.box.x,r.box.y,O1);for(const r of n.ticks)Hl(s,t,i,th,r.x,r.y,{R:os.flagRing});return s}class q1{constructor(e){this.canvas=e,this.renderer=new LE({canvas:e,antialias:!1,alpha:!1,depth:!0,stencil:!1,powerPreference:"default"}),this.renderer.setPixelRatio(1),this.renderer.outputColorSpace=$r,this.renderer.info.autoReset=!1,this.renderer.debug.checkShaderErrors=!0,this.renderer.debug.onShaderError=(s,r,o,a)=>{const c=[s.getProgramInfoLog(r),s.getShaderInfoLog(o),s.getShaderInfoLog(a)].filter(Boolean).join(" ").trim();this.shaderErrors.push(c.slice(0,300)||"a shader program failed to link")},this.renderer.setClearColor(us(we.world.space),1),this.target=this.makeTarget(this.width,this.height),this.blit=new an({vertexShader:Qf,fragmentShader:KE,depthTest:!1,depthWrite:!1,uniforms:{uSource:{value:this.target.texture},uScale:{value:1}}});const t=new Ht(new no(2,2),this.blit);t.frustumCulled=!1,this.blitScene.add(t),this.overlayMat=new an({vertexShader:Qf,fragmentShader:YE,depthTest:!1,depthWrite:!1,uniforms:{uOverlay:{value:null}}});const i=new Ht(t.geometry,this.overlayMat);i.frustumCulled=!1,this.overlayScene.add(i)}canvas;renderer;target;blitScene=new Yc;blitCamera=new hm(-1,1,1,-1,0,1);blit;width=da(di.default);height=di.default;scale=1;shaderErrors=[];overlayScene=new Yc;overlayMat;overlayTex=null;makeTarget(e,t){return new On(e,t,{minFilter:_t,magFilter:_t,generateMipmaps:!1,depthBuffer:!0,stencilBuffer:!1,samples:0})}resize(e,t,i,s){const r=Jd(e),o=da(r);(o!==this.width||r!==this.height)&&(this.target.dispose(),this.target=this.makeTarget(o,r),this.blit.uniforms.uSource.value=this.target.texture,this.width=o,this.height=r),this.scale=Bg(o,r,t,i),this.blit.uniforms.uScale.value=this.scale,this.renderer.setSize(o*this.scale,r*this.scale,!1),this.canvas.style.width=`${o*this.scale/s}px`,this.canvas.style.height=`${r*this.scale/s}px`}render(e,t,i){t.aspect=this.width/this.height,t.updateProjectionMatrix();const s=this.renderer;s.info.reset(),s.setRenderTarget(this.target),s.render(e,t);const r=i?.(()=>this.readTarget())??null;return r&&this.drawOverlay(r),s.setRenderTarget(null),s.render(this.blitScene,this.blitCamera),{drawCalls:s.info.render.calls,triangles:s.info.render.triangles,width:this.width,height:this.height}}takeShaderErrors(){const e=this.shaderErrors;return this.shaderErrors=[],e}readTarget(){const{width:e,height:t}=this,i=new Uint8Array(e*t*4);this.renderer.readRenderTargetPixels(this.target,0,0,e,t,i);const s=new Uint8Array(e*t*4);for(let r=0;r<t;r++)s.set(i.subarray((t-1-r)*e*4,(t-r)*e*4),r*e*4);return s}drawOverlay(e){const{width:t,height:i}=this;(!this.overlayTex||this.overlayTex.image.width!==t||this.overlayTex.image.height!==i)&&(this.overlayTex?.dispose(),this.overlayTex=new Ia(new Uint8Array(t*i*4),t,i,En,fn),this.overlayTex.minFilter=_t,this.overlayTex.magFilter=_t,this.overlayTex.generateMipmaps=!1,this.overlayMat.uniforms.uOverlay.value=this.overlayTex);const s=this.overlayTex.image.data;for(let o=0;o<i;o++)s.set(e.subarray(o*t*4,(o+1)*t*4),(i-1-o)*t*4);this.overlayTex.needsUpdate=!0;const r=this.renderer;r.autoClear=!1;try{r.render(this.overlayScene,this.blitCamera)}finally{r.autoClear=!0}}compileOverlay(){this.renderer.compile(this.overlayScene,this.blitCamera)}pixels(){const{width:e,height:t}=this,i=new Uint8Array(e*t*4);this.renderer.readRenderTargetPixels(this.target,0,0,e,t,i);const s=new Array(e*t*4);for(let r=0;r<t;r++){const o=(t-1-r)*e*4;for(let a=0;a<e*4;a++)s[r*e*4+a]=i[o+a]}return{width:e,height:t,rgba:s}}dispose(){this.target.dispose(),this.blit.dispose(),this.overlayMat.dispose(),this.overlayTex?.dispose(),this.renderer.dispose()}}const ui=16,Ys=6,as=4,es=[-.6,-.62,-.6],ts=[.6,.46,.6],Nh=`
  out vec3 vPosW;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`,Y1=`
  uniform mat4 uInvModel, uModel, uViewProj;
  uniform vec3 uLightLocal;
  uniform float uPixK;
  uniform vec3 uShell[4], uTrim[4], uAcc[4], uGlow[4], uScr[3], uSmoke[3];
  uniform vec3 uHeadB; uniform vec4 uHeadK; // half-size; corner, round, taper, flat
  uniform vec3 uRimC; uniform vec2 uRimR; uniform float uRimT;
  uniform vec4 uScreen; // half-width tan, half-height tan, centre height, superellipse exponent
  uniform float uBezel; uniform vec2 uEyePhys;
  uniform vec4 uEyeXf; // eye offset x, y (eye-box px), scale, blink
  uniform vec4 uGlyph; // glyph coverage 0..1, time into the work (s), flips per second, glyph pixel size
  uniform int uEyesOn, uGlyphSet;
  uniform vec3 uAntA, uAntB; uniform float uAntR, uAntTip;
  uniform vec3 uThrA, uThrB; uniform vec2 uThrR;
  uniform int uSkirtN; uniform vec3 uSkA[${as}], uSkB[${as}]; uniform float uSkR;
  uniform int uPuffN; uniform vec3 uPuffC[${ui}]; uniform float uPuffR[${ui}], uPuffA[${ui}];
  uniform int uSparkN; uniform vec3 uSparkC[${Ys}]; uniform float uSparkS[${Ys}];
  uniform int uEyes; uniform float uBlink;
  in vec3 vPosW;

  const vec3 BMIN = vec3(${es.join(", ")});
  const vec3 BMAX = vec3(${ts.join(", ")});
  const float K = 0.006; // crisp blend: add-ons read as separate parts through shading alone

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float smax(float a, float b, float k) { return -smin(-a, -b, k); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  float sdEllipsoid(vec3 p, vec3 r) { float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0)) - r; }
  // Tapered capsule from a (radius r1) to b (radius r2), Inigo Quilez's exact round cone.
  float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }

  // The head: a rounded box blended toward an ellipsoid, tapered toward the bottom, its bottom
  // optionally cut flat (k = corner radius, round, taper, flat). Mirrored in JS (shapeField).
  float sdShape(vec3 q, vec3 b, vec4 k) {
    float t = clamp((q.y + b.y) / (2.0 * b.y), 0.0, 1.0);
    float s = 1.0 / mix(k.z, 1.0, t);
    vec3 r = vec3(q.x * s, q.y, q.z * s);
    float d = mix(sdRoundBox(r, b, k.x), sdEllipsoid(r, b), k.y) * min(1.0, 1.0 / s);
    if (k.w > 0.001) d = smax(d, -b.y * (1.0 - k.w) - q.y, 0.02);
    return d;
  }
  float dHead(vec3 p) { return sdShape(p, uHeadB, uHeadK); }
  // An elliptical ring hugging the head (scaled torus; under-stepped by the march).
  float dRim(vec3 p) { vec3 q = p - uRimC; float m = min(uRimR.x, uRimR.y); return length(vec2((length(q.xz / uRimR) - 1.0) * m, q.y)) - uRimT; }
  float dStalk(vec3 p) { return sdCapsule(p, uAntA, uAntB, uAntR); }
  float dTip(vec3 p) { return length(p - uAntB) - uAntTip; }
  float dLeg(vec3 p, int i) { return sdCapsule(p, uSkA[i], uSkB[i], uSkR); }
  float dThr(vec3 p) { return sdRoundCone(p, uThrA, uThrB, uThrR.x, uThrR.y); }

  float mapBody(vec3 p) {
    float d = dHead(p);
    d = smin(d, dRim(p), K);
    d = smin(d, dStalk(p), K);
    d = smin(d, dTip(p), K);
    d = smin(d, dThr(p), K);
    for (int i = 0; i < ${as}; i++) { if (i >= uSkirtN) break; d = smin(d, dLeg(p, i), K); }
    return d;
  }
  // Smoke: free-floating round puffs, each three blended spheres (a chunky cloud).
  float dPuff(vec3 p, int i) {
    vec3 c = uPuffC[i]; float r = uPuffR[i];
    float d = length(p - c) - r;
    d = smin(d, length(p - c - vec3(0.62, 0.3, 0.15) * r) - r * 0.72, r * 0.45);
    return smin(d, length(p - c - vec3(-0.58, 0.2, -0.25) * r) - r * 0.78, r * 0.45);
  }
  float mapSmoke(vec3 p, out float age) {
    float d = 1e9; age = 0.0;
    for (int i = 0; i < ${ui}; i++) {
      if (i >= uPuffN) break;
      if (uPuffR[i] <= 0.0) continue;
      if (length(p - uPuffC[i]) - uPuffR[i] * 2.2 > d) continue;
      float e = dPuff(p, i);
      if (e < d) { d = e; age = uPuffA[i]; }
    }
    return d;
  }
  float mapAll(vec3 p) { float a; return min(mapBody(p), mapSmoke(p, a)); }

  vec3 calcNormal(vec3 p, bool smoke) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    if (smoke) {
      float a;
      return normalize(k.xyy * mapSmoke(p + k.xyy * e, a) + k.yyx * mapSmoke(p + k.yyx * e, a) + k.yxy * mapSmoke(p + k.yxy * e, a) + k.xxx * mapSmoke(p + k.xxx * e, a));
    }
    return normalize(k.xyy * mapBody(p + k.xyy * e) + k.yyx * mapBody(p + k.yyx * e) + k.yxy * mapBody(p + k.yxy * e) + k.xxx * mapBody(p + k.xxx * e));
  }
  // Self-shadowing and contact occlusion come from the body only (smoke stays bright and soft).
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      float h = mapBody(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h * 0.85, 0.008);
      if (t > 1.2) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.018 * float(i);
      o += (h - mapBody(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  // Face screen, in yaw/pitch about the head centre (normalised head space), so it wraps the head;
  // xy = screen coords (-1..1, y up), z = superellipse value (< 1 inside).
  vec3 screenQ(vec3 p) {
    vec3 n = p / uHeadB;
    vec2 q = vec2(atan(n.x, n.z) / atan(uScreen.x), (atan(n.y, length(n.xz)) - atan(uScreen.z)) / atan(uScreen.y));
    return vec3(q, pow(abs(q.x), uScreen.w) + pow(abs(q.y), uScreen.w));
  }
  // Screen coords -> the V2 32 x 24 eye box, fitted inside the screen at its real aspect.
  float eyeUnit() { return min(2.0 * uEyePhys.x / 32.0, 2.0 * uEyePhys.y / 24.0); }
  vec2 boxP(vec2 q) { return vec2(16.0, 12.0) + vec2(q.x * uEyePhys.x, -q.y * uEyePhys.y) / eyeUnit(); }

  // The V2 eye designs the two looks use (faces.js): 0 dots, 3 binocular. uBlink squashes them.
  float sdRRect(vec2 p, vec2 c, vec2 hs, float r) { vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float ring(vec2 p, vec2 c, float r) { float d = length(p - c); return max(d - r, r * 0.45 - d); } // disc minus pupil
  bool eyeLit(vec2 uv) {
    const float W = 32.0, CX = 16.0, CY = 12.0;
    const float e = 16.0 * 1.12;
    vec2 P = uv * vec2(32.0, 24.0);
    P.y = CY + (P.y - CY) / max(uBlink, 0.05);
    float d = 1e9;
    if (uEyes == 0) {
      for (int k = -1; k <= 1; k += 2) d = min(d, length(P - vec2(CX + float(k) * W * 0.22, CY)) - e * 0.2);
    } else {
      for (int k = -1; k <= 1; k += 2) d = min(d, ring(P, vec2(CX + float(k) * W * 0.21, CY), e * 0.27));
    }
    return d < 0.0;
  }
  bool eyesLit(vec2 P) {
    vec2 E = vec2(16.0, 12.0) + (P - vec2(16.0, 12.0) - vec2(uEyeXf.x, -uEyeXf.y)) / uEyeXf.z;
    return eyeLit(E / vec2(32.0, 24.0));
  }
  float hash1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
  float hash2(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
  // Working face: the eyes go and the whole screen flashes with typed ASCII glyphs (a 5 x 7 pixel
  // font). Glyph pixels are squares in eye-box units, so only the pixel pass pixelates them.
  const int GLYPH_N = 17;
  const int SET_STAR[4] = int[4](14, 14, 3, 4); // Claude's asterisk spinner: * + .
  const int GLYPHS[119] = int[119](0, 14, 17, 21, 17, 14, 0, 0, 17, 10, 4, 10, 17, 0, 0, 31, 17, 17, 17, 31, 0, 0, 4, 4, 31, 4, 4, 0, 0, 0, 0, 4, 0, 0, 0, 1, 2, 2, 4, 8, 8, 16, 16, 8, 8, 4, 2, 2, 1, 6, 4, 4, 8, 4, 4, 6, 12, 4, 4, 2, 4, 4, 12, 0, 4, 0, 0, 4, 4, 8, 2, 4, 8, 16, 8, 4, 2, 8, 4, 2, 1, 2, 4, 8, 10, 10, 31, 10, 31, 10, 10, 0, 0, 31, 0, 31, 0, 0, 0, 4, 21, 14, 21, 4, 0, 14, 17, 19, 21, 25, 17, 14, 4, 12, 4, 4, 4, 4, 14);
  bool glyphLit(vec2 q, out int tone) {
    tone = 3;
    if (uGlyph.x <= 0.0) return false;
    float u = eyeUnit(), gp = uGlyph.w;
    vec2 S = uEyePhys / u;
    vec2 cell = vec2(6.0, 8.0) * gp;
    vec2 n = max(floor(2.0 * S / cell), vec2(1.0));
    vec2 P = vec2(q.x * S.x, -q.y * S.y) + n * cell * 0.5;
    vec2 ci = floor(P / cell);
    if (ci.x < 0.0 || ci.y < 0.0 || ci.x >= n.x || ci.y >= n.y) return false;
    vec2 cq = ((ci + 0.5) * cell - n * cell * 0.5) / S * 1.2;
    if (pow(abs(cq.x), uScreen.w) + pow(abs(cq.y), uScreen.w) > 1.0) return false;
    float id = ci.x + ci.y * 17.0;
    if (hash1(id + 3.1) >= uGlyph.x) return false;
    float flip = floor(uGlyph.y * uGlyph.z + hash1(id + 7.7) * 4.0);
    float h = hash2(vec2(id, flip));
    if (h > 0.86) return false;
    float hg = hash2(vec2(id + 0.5, flip + 0.25));
    int g = int(hg * float(GLYPH_N)) % GLYPH_N;
    if (uGlyphSet == 1) g = SET_STAR[int(hg * 4.0) % 4];
    ivec2 b = ivec2(floor((P - ci * cell) / gp - 0.5));
    if (b.x < 0 || b.x > 4 || b.y < 0 || b.y > 6) return false;
    tone = h < 0.22 ? 1 : h < 0.6 ? 2 : 3;
    return ((GLYPHS[g * 7 + b.y] >> (4 - b.x)) & 1) == 1;
  }
  bool glint(vec2 q) {
    float u = eyeUnit();
    float o = mix(6.0, 3.0, clamp((uScreen.w - 2.0) / 4.0, 0.0, 1.0));
    vec2 G = vec2((q.x + 1.0) * uEyePhys.x, (1.0 - q.y) * uEyePhys.y) / u - o;
    return (G.y >= 0.0 && G.y < 1.0 && G.x >= 0.0 && G.x < 2.0) || (G.y >= 1.0 && G.y < 2.0 && G.x >= 0.0 && G.x < 1.0);
  }

  // Colour region of a body point: 0 shell, 1 trim, 2 accent (legs), 3 screen, 4 glow.
  int region(vec3 p, out vec2 sq) {
    sq = vec2(0.0);
    float best = dHead(p), d;
    int part = 0; // 0 head 1 trim 2 accent 4 glow 7 nozzle
    d = dRim(p); if (d < best) { best = d; part = 1; }
    d = dStalk(p); if (d < best) { best = d; part = 1; }
    d = dTip(p); if (d < best) { best = d; part = 4; }
    d = dThr(p); if (d < best) { best = d; part = 7; }
    for (int i = 0; i < ${as}; i++) { if (i >= uSkirtN) break; d = dLeg(p, i); if (d < best) { best = d; part = 2; } }
    if (part == 0) {
      vec3 s = screenQ(p);
      sq = s.xy;
      if (s.z < 1.0) return 3;
      if (uBezel > 0.0 && s.z < pow(1.0 + uBezel, uScreen.w)) return 1;
      return 0;
    }
    if (part == 7) return dot(p - uThrB, normalize(uThrB - uThrA)) > 0.45 * uThrR.y ? 4 : 1; // the nozzle's mouth glows
    return part;
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 180; i++) {
      float h = mapAll(ro + rd * t);
      if (h < 0.0010 * (1.0 + t)) { hit = true; break; }
      t += h * 0.85;
      if (t > tf) break;
    }
    vec3 c = vec3(0.0);
    bool have = false;
    float depth = gl_FragCoord.z;
    if (hit) {
      vec3 p = ro + rd * t;
      vec4 clip = uViewProj * (uModel * vec4(p, 1.0));
      depth = clip.z / clip.w * 0.5 + 0.5;
      float age;
      bool smoke = mapSmoke(p, age) < mapBody(p);
      vec3 n = calcNormal(p, smoke);
      vec3 L = normalize(uLightLocal);
      if (smoke) {
        float lit = dot(n, L);
        int b = lit > 0.35 ? 2 : lit > -0.3 ? 1 : 0;
        if (age > 0.62) b = max(b - 1, 0); // fading puffs step darker as they shrink
        c = uSmoke[b];
      } else {
        vec2 sq;
        int r = region(p, sq);
        if (r == 4) c = dot(n, -rd) > 0.6 ? uGlow[3] : uGlow[2];
        else {
          float lit = dot(n, L);
          if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
          lit -= (1.0 - occlusion(p, n)) * 0.6;
          int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
          if (r == 3) {
            vec3 refl = reflect(rd, n);
            c = (refl.y > 0.18 && b >= 2) ? uScr[1] : uScr[0];
            int tone;
            if (glyphLit(sq, tone)) c = uGlow[tone];
            else if (uEyesOn == 1 && eyesLit(boxP(sq))) c = uGlow[3];
            if (glint(sq)) c = uScr[2];
          } else if (r == 2) c = uAcc[b];
          else if (r == 1) c = uTrim[b];
          else c = uShell[b];
        }
      }
      have = true;
    }
    // Sparkles: crisp 1-pixel dots and + crosses at their projected pixel, hidden behind anything nearer.
    if (uSparkN > 0) {
      mat3 toLocal = mat3(uInvModel);
      vec3 R = normalize(toLocal * vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
      vec3 Up = normalize(toLocal * vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
      vec3 F = cross(Up, R);
      for (int i = 0; i < ${Ys}; i++) {
        if (i >= uSparkN) break;
        if (uSparkS[i] < 0.5) continue;
        vec3 v = uSparkC[i] - ro;
        float along = dot(v, rd), dz = dot(v, F);
        if (along <= 0.0 || (hit && t < along)) continue;
        vec3 off = ro + rd * (dz / dot(rd, F)) - uSparkC[i];
        float pix = dz * uPixK;
        float dx = abs(dot(off, R)) / pix, dy = abs(dot(off, Up)) / pix;
        bool on = uSparkS[i] < 1.5 ? (dx < 0.5 && dy < 0.5) : ((dx < 0.5 && dy < 1.5) || (dy < 0.5 && dx < 1.5));
        if (on) {
          c = uSmoke[2]; have = true;
          vec4 sp = uViewProj * (uModel * vec4(ro + rd * (dz / dot(rd, F)), 1.0)); // the sparkle's own depth
          depth = sp.z / sp.w * 0.5 + 0.5;
        }
      }
    }
    if (!have) discard;
    gl_FragColor = vec4(c, 1.0);
    gl_FragDepth = depth;
  }
`,Oa=12,Ti=1.5,K1=Math.PI*2,Hn=K1/Oa,Gs={bob:4,sway:2,drift:1},km={size:1.36,headW:.1275,headH:.095,headD:.125,headRound:.83,headCorner:.1,headTaper:.99,headFlat:.4,rimY:-.45,rimT:.019,antL:.045,antTilt:.15,screenW:1.17,screenH:.77,screenY:.18,screenRound:3,bezel:.18,eyes:3,eyeScale:1,gaze:0,glance:4.5,glyphRate:4,glyphPx:1.4,glyphSet:0,thrR:.0525,thrL:.015,thrFlare:.85,puffSize:.95,puffRate:.32,sparkles:3,bobAmp:.043,drift:.165,bank:.32,lookYaw:.5,skirtN:0,skirtL:.03,skirtR:.015,skirtSpread:.7,skirtZ:.1},Z1={...km,eyes:0,glyphSet:1,sparkles:0,skirtN:4,skirtL:.05,skirtR:.019,skirtSpread:.7,skirtZ:.55},J1=n=>n==="claude-code"?"claude":"generic";function Q1(n,e){const t=Zr(e),i={...n==="claude"?Z1:km},s=Math.floor(t()*Oa*zt)/zt,r=Math.floor(t()*3);i.puffRate+=(t()-.5)*.16,i.gaze+=(t()-.5)*2,i.glance+=(t()-.5)*2,i.lookYaw+=(t()-.5)*.12;const o=t();return n==="claude"&&(i.skirtL=.044+.012*o),{P:i,time:s,trim:r}}const wt=(n=0,e=0,t=0)=>new z(n,e,t),Kr=(n,e,t)=>n+(e-n)*t,tr=n=>Math.min(1,Math.max(0,n)),ih=(n,e,t)=>{const i=tr((t-n)/(e-n));return i*i*(3-2*i)},j1=(n,e,t)=>{const i=tr(.5+.5*(e-n)/t);return Kr(e,n,i)-t*i*(1-i)},eA=(n,e,t)=>-j1(-n,-e,t),tA=(n,e,t)=>{const i=Math.abs(n.x)-e.x+t,s=Math.abs(n.y)-e.y+t,r=Math.abs(n.z)-e.z+t;return Math.hypot(Math.max(i,0),Math.max(s,0),Math.max(r,0))+Math.min(Math.max(i,s,r),0)-t},nA=(n,e)=>{const t=Math.hypot(n.x/e.x,n.y/e.y,n.z/e.z),i=Math.hypot(n.x/(e.x*e.x),n.y/(e.y*e.y),n.z/(e.z*e.z));return t*(t-1)/i};function iA(n,e){return t=>{const i=tr((t.y+n.y)/(2*n.y)),s=1/Kr(e[2],1,i),r=wt(t.x*s,t.y,t.z*s);let o=Kr(tA(r,n,e[0]),nA(r,n),e[1])*Math.min(1,1/s);return e[3]>.001&&(o=eA(o,-n.y*(1-e[3])-t.y,.02)),o}}function mr(n,e,t,i=.8){let s=0,r=i;if(n(e)>0)return 0;for(let o=0;o<40;o++){const a=(s+r)/2;n(e.clone().addScaledVector(t,a))<0?s=a:r=a}return s}function sA(n){const e=wt(n.headW,n.headH,n.headD),t=[n.headCorner*Math.min(n.headW,n.headH,n.headD),n.headRound,n.headTaper,n.headFlat],i=iA(e,t),s=wt(),r=wt(0,-1,0),o=n.rimY*n.headH,a=wt(0,o,0),c={c:a,r:[mr(i,a,wt(1,0,0))+.35*n.rimT,mr(i,a,wt(0,0,1))+.35*n.rimT]},l=wt(0,n.headH,-.12*n.headD).normalize(),h=l.clone().multiplyScalar(mr(i,s,l)).multiplyScalar(.97),u=wt(0,Math.cos(n.antTilt),-Math.sin(n.antTilt)).normalize(),f={a:h,b:h.clone().addScaledVector(u,n.antL)},d=wt(0,-1,-.25).normalize(),p=wt(0,-n.headH,-.08*n.headD).normalize(),x=p.clone().multiplyScalar(mr(i,s,p,1)),m={a:x.clone().addScaledVector(d,-.5*n.thrL),b:x.clone().addScaledVector(d,n.thrL),axis:d},g=[];if(n.skirtN>0){const M=Math.max(1,Math.floor(n.skirtN/2)),E=[];for(let y=0;y<M;y++)E.push(M===1?1:.4+.6*y/(M-1));for(const y of[...E.map(T=>-T),...E].concat(n.skirtN%2?[0]:[]).slice(0,as)){const T=wt(y*n.skirtSpread*n.headW,0,n.skirtZ*n.headD),b=T.clone().addScaledVector(r,mr(i,T,r,1)-.4*n.skirtR);g.push({a:b,b:b.clone().addScaledVector(r,n.skirtL)})}}return{head:{b:e,k:t},rim:c,ant:f,thr:m,legs:g}}const Mn=(...n)=>{const e=Math.sin(n.reduce((t,i,s)=>t+i*[12.9898,78.233,37.719,4.581][s%4],0)+4.1414)*43758.5453;return e-Math.floor(e)},sh=(n,e)=>(n%e+e)%e;function Bm(n){const e=(o,a)=>{const c=o-a;return c>0&&c<.18?1-Math.sin(c/.18*Math.PI)*.88:1},t=sh(n,Oa),i=(o,a)=>ih(o,a,t),s=-i(1.6,2)+2*i(3,3.35)-i(4.4,4.8)+.6*i(10.9,11.2)-.6*i(11.6,11.95),r=i(5.6,6)*(1-i(10.2,10.6));return{glance:s,work:r,workT:Math.max(0,t-5.8),blink:Math.min(e(t,1),e(t,5.2),e(t,10.7))}}function rA(n){const t=tr((n-.35)/.65);return{glyphs:t,eyes:t<=0,eyeOpen:n>0?tr(1-n/.35):1}}const rh=new Qn,oA=new zi,zm=new z;function ha(n,e){const t=n.drift*Math.sin(Hn*e*Gs.drift),i=.45*n.drift*Math.sin(2*Hn*e*Gs.drift),s=Math.cos(Hn*e),r=Math.cos(2*Hn*e),o=Math.sin(Hn*e),a=Math.sin(2*Hn*e),c=n.bobAmp*Math.sin(Hn*e*Gs.bob),l=Math.sin(Hn*e*Gs.sway),h=-n.bank*s+.05*l,u=.6*n.bank*r+.04*Math.sin(Hn*e*Gs.sway+1.3),f=n.lookYaw*Bm(e).glance,d=new Ve().compose(wt(t,c,i),rh.setFromEuler(oA.set(u,f,h,"YXZ")),zm.set(n.size,n.size,n.size)),p=.55*Math.hypot(o,.6*a)+.3*Math.abs(s)*(n.bank/.3)+.5*Math.max(0,Math.cos(Hn*e*Gs.bob));return{m:d,effort:p}}function aA(n,e,t){const i=Oa/Ti,s=ha(e,t).m.clone().invert(),r=n.thr,o=[];for(let c=0;c<ui;c++){const l=(c+.7*Mn(0,c,1))/ui*Ti,h=Math.floor((t-l)/Ti),u=l+h*Ti,f=t-u,d=sh(h,i),p=Ti*(.5+.42*Mn(0,c,d,2)),x=ha(e,u),m=tr(e.puffRate*(.35+.75*x.effort));if(f>=p||Mn(0,c,d,3)>m)continue;const g=f/p,M=r.b.clone().applyMatrix4(x.m),E=r.axis.clone().transformDirection(x.m),y=.3*(.7+.6*Mn(0,c,d,4)),T=.22,b=y*T*(1-Math.exp(-f/T)),v=M.addScaledVector(E,b+.6*e.thrR).add(wt((Mn(0,c,d,5)-.5)*.08*f,.05*f*f-.01*f,(Mn(0,c,d,6)-.5)*.08*f)),_=ih(0,.12,g)*(1-ih(.6,1,g)),R=.028*e.puffSize*(.75+.5*Mn(0,c,d,7))*(.7+.7*g)*_;o.push({c:v.applyMatrix4(s),r:R,u:g})}const a=[];for(let c=0;c<Math.min(e.sparkles,Ys);c++){const l=(c+.6*Mn(c,11))/Math.max(1,e.sparkles)*Ti,h=Math.floor((t-l)/Ti),u=l+h*Ti,f=sh(h,i),d=t-u,p=.75;if(d>=p||Mn(c,f,12)>.85){a.push({c:wt(),s:0});continue}const x=ha(e,u).m,m=r.axis.clone().transformDirection(x),g=wt(Mn(c,f,14)-.5,.3+.4*Mn(c,f,15),Mn(c,f,16)-.5).multiplyScalar(.16),M=r.b.clone().applyMatrix4(x).addScaledVector(m,.03+.12*Math.sqrt(d)).addScaledVector(g,d),E=d/p;a.push({c:M.applyMatrix4(s),s:E<.2||E>.7?1:2})}return{puffs:o,sparks:a}}const lA=new Vi(ts[0]-es[0],ts[1]-es[1],ts[2]-es[2]).translate((ts[0]+es[0])/2,(ts[1]+es[1])/2,(ts[2]+es[2])/2),od=n=>Array.from({length:n},()=>wt()),ad=(n,e,t)=>Array.from({length:e},(i,s)=>n[s]??t());function cA(n,e){const t=we.drone[n],i=n==="claude"?[t.trim,t.trimB,t.trimC]:[t.trim];return{shell:Je(t.shell,4),trim:Je(i[e%i.length],4),acc:Je(t.accent,4),glow:Je(we.accent.teal,4),scr:Je([...we.crew.visor,we.crew.glint],3),smoke:Je(t.smoke,3)}}class hA{constructor(e,t){this.look=e;const{P:i,time:s,trim:r}=Q1(e,t);this.P=i,this.time=s;const o=this.lay=sA(i),a=cA(e,r),c={uInvModel:{value:new Ve},uModel:{value:new Ve},uViewProj:{value:new Ve},uLightLocal:{value:wt()},uPixK:{value:.0035},uShell:{value:a.shell},uTrim:{value:a.trim},uAcc:{value:a.acc},uGlow:{value:a.glow},uScr:{value:a.scr},uSmoke:{value:a.smoke},uHeadB:{value:o.head.b},uHeadK:{value:new ct(...o.head.k)},uRimC:{value:o.rim.c},uRimR:{value:new ze(...o.rim.r)},uRimT:{value:i.rimT},uScreen:{value:new ct(i.screenW,i.screenH,i.screenY,i.screenRound)},uBezel:{value:i.bezel},uEyePhys:{value:new ze(Math.min(i.headW*Kr(i.screenW,Math.sin(Math.atan(i.screenW)),i.headRound),i.headW*.95),i.headH*Kr(i.screenH,Math.sin(Math.atan(i.screenH)),i.headRound))},uEyeXf:{value:new ct(0,0,i.eyeScale,1)},uGlyph:{value:new ct},uEyesOn:{value:1},uGlyphSet:{value:i.glyphSet},uEyes:{value:i.eyes},uBlink:{value:1},uAntA:{value:o.ant.a},uAntB:{value:o.ant.b},uAntR:{value:.0105},uAntTip:{value:.018},uThrA:{value:o.thr.a},uThrB:{value:o.thr.b},uThrR:{value:new ze(i.thrR,i.thrR*i.thrFlare)},uSkirtN:{value:o.legs.length},uSkA:{value:ad(o.legs.map(l=>l.a),as,wt)},uSkB:{value:ad(o.legs.map(l=>l.b),as,wt)},uSkR:{value:i.skirtR},uPuffN:{value:0},uPuffC:{value:od(ui)},uPuffR:{value:new Array(ui).fill(0)},uPuffA:{value:new Array(ui).fill(0)},uSparkN:{value:0},uSparkC:{value:od(Ys)},uSparkS:{value:new Array(Ys).fill(0)}};this.U=c,this.material=new an({vertexShader:Nh,fragmentShader:Y1,uniforms:c,side:kt}),this.proxy=new Ht(lA,this.material),this.proxy.onBeforeRender=(l,h,u)=>{c.uViewProj.value.multiplyMatrices(u.projectionMatrix,u.matrixWorldInverse)},this.body.add(this.proxy),this.root.add(this.body)}look;root=new Ot;body=new Ot;proxy;P;lay;time;U;material;update(e,t){const{P:i,U:s}=this,r=e+this.time;ha(i,r).m.decompose(this.body.position,this.body.quaternion,this.body.scale);const a=Bm(r),c=rA(a.work),l=Math.min(a.blink,c.eyeOpen);s.uBlink.value=l,s.uEyesOn.value=c.eyes?1:0,s.uEyeXf.value.set(i.glance*a.glance,i.gaze,i.eyeScale,l),s.uGlyph.value.set(c.glyphs,a.workT,i.glyphRate,i.glyphPx);const{puffs:h,sparks:u}=aA(this.lay,i,r);s.uPuffN.value=h.length,h.forEach((d,p)=>{s.uPuffC.value[p].copy(d.c),s.uPuffR.value[p]=d.r,s.uPuffA.value[p]=d.u}),s.uSparkN.value=u.length,u.forEach((d,p)=>{s.uSparkC.value[p].copy(d.c),s.uSparkS.value[p]=d.s}),s.uPixK.value=t,this.root.updateMatrixWorld(!0);const f=this.proxy.matrixWorld;s.uModel.value.copy(f),s.uInvModel.value.copy(f).invert(),f.decompose(uA,rh,zm),s.uLightLocal.value.copy(ki.uLight.value).applyQuaternion(rh.invert())}dispose(){this.material.dispose()}}const uA=new z;class Gm{group=new Ot;items=[];set(e){for(const t of this.items)this.group.remove(t.drone.root),t.drone.dispose();this.items=e.map(t=>({entry:t,drone:new hA(J1(t.tool),t.seed)}));for(const t of this.items)this.group.add(t.drone.root)}get entries(){return this.items.map(e=>e.entry)}spheres(e,t){return this.items.map(({entry:i})=>{const s=ic(e,i.home,i.seed,t);return s?{centre:s.centre,radius:va}:null})}pose(e,t,i,s,r=[0,0,0]){const o=vi(t)*gi,a=2*Math.tan(i*Math.PI/360)/s;for(const{entry:c,drone:l}of this.items){const h=ic(e,c.home,c.seed,t);l.root.visible=h!==null,h&&(l.root.position.set(h.centre[0]-r[0],h.centre[1]-r[1],h.centre[2]-r[2]),l.root.rotation.set(0,h.yaw,0),l.root.scale.setScalar(ap),l.update(Math.round(o*zt)/zt,a))}}dispose(){this.set([])}}const fA=["dots","cyclops","visor","binocular","three","happy","led","heartbeat","slant","x"];function dA(n,e,t){const i=Zr((n^739982445)>>>0);return{eyes:Math.floor(i()*fA.length),colour:Math.floor(i()*e),phaseFrames:Math.floor(i()*t)}}const pA=`
  uniform int uEyes;
  uniform float uBlink;
  float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
  float sdRRect(vec2 p, vec2 c, vec2 hs, float r) { vec2 q = abs(p - c) - hs + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  float ring(vec2 p, vec2 c, float r) { float d = length(p - c); return max(d - r, r * 0.45 - d); } // disc minus pupil
  float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }
  bool inQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) { // convex, either winding
    float s0 = cross2(b - a, p - a), s1 = cross2(c - b, p - b), s2 = cross2(d - c, p - c), s3 = cross2(a - d, p - d);
    return (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
  }

  bool eyeLit(vec2 uv) {
    const float W = 32.0, CX = 16.0, CY = 12.0;
    const float e = 16.0 * 1.12; // min(24, 32 * 0.5) * 1.12
    vec2 P = uv * vec2(32.0, 24.0);
    P.y = CY + (P.y - CY) / max(uBlink, 0.05);
    float d = 1e9;
    if (uEyes == 0) { // dots
      for (int k = -1; k <= 1; k += 2) d = min(d, length(P - vec2(CX + float(k) * W * 0.22, CY)) - e * 0.2);
    } else if (uEyes == 1) { // cyclops
      d = ring(P, vec2(CX, CY), e * 0.36);
    } else if (uEyes == 2) { // visor slit (pill)
      float h = e * 0.24;
      d = sdRRect(P, vec2(CX, CY), vec2(W * 0.34, h * 0.5), h * 0.5);
    } else if (uEyes == 3) { // binocular
      for (int k = -1; k <= 1; k += 2) d = min(d, ring(P, vec2(CX + float(k) * W * 0.21, CY), e * 0.27));
    } else if (uEyes == 4) { // three
      for (int k = -1; k <= 1; k++) d = min(d, length(P - vec2(CX + float(k) * W * 0.26, CY)) - e * 0.15);
    } else if (uEyes == 5) { // happy ^ ^
      float dy = e * 0.13, hw = W * 0.1;
      for (int k = -1; k <= 1; k += 2) {
        float cx = CX + float(k) * W * 0.22;
        d = min(d, min(sdSeg(P, vec2(cx - hw, CY + dy), vec2(cx, CY - dy)), sdSeg(P, vec2(cx, CY - dy), vec2(cx + hw, CY + dy))) - e * 0.055);
      }
    } else if (uEyes == 6) { // LED bar: 4 cells with 8% gaps
      float h = e * 0.22, w = W * 0.7, gap = w * 0.08, cw = (w - gap * 3.0) / 4.0;
      for (int i = 0; i < 4; i++) d = min(d, sdRRect(P, vec2(CX - w * 0.5 + float(i) * (cw + gap) + cw * 0.5, CY), vec2(cw * 0.5, h * 0.5), 0.8));
    } else if (uEyes == 7) { // heartbeat ECG
      float w = W * 0.36, a = e * 0.24;
      vec2 q0 = vec2(CX - w, CY), q1 = vec2(CX - w * 0.3, CY), q2 = vec2(CX - w * 0.1, CY - a);
      vec2 q3 = vec2(CX + w * 0.15, CY + a), q4 = vec2(CX + w * 0.35, CY), q5 = vec2(CX + w, CY);
      d = min(min(min(sdSeg(P, q0, q1), sdSeg(P, q1, q2)), min(sdSeg(P, q2, q3), sdSeg(P, q3, q4))), sdSeg(P, q4, q5)) - 1.1;
    } else if (uEyes == 8) { // slant: angled trapezoids
      float t = max(e * 0.17, 2.4);
      for (int k = -1; k <= 1; k += 2) {
        float o = CX + float(k) * W * 0.36, i = CX + float(k) * W * 0.07;
        if (inQuad(P, vec2(o, CY - t), vec2(i, CY - t * 0.1), vec2(i, CY + t), vec2(o, CY + t))) return true;
      }
    } else { // X eyes
      float a = max(e * 0.15, 2.6), sw = max(e * 0.1, 2.2);
      for (int k = -1; k <= 1; k += 2) {
        float cx = CX + float(k) * W * 0.22;
        d = min(d, min(sdSeg(P, vec2(cx - a, CY - a), vec2(cx + a, CY + a)), sdSeg(P, vec2(cx - a, CY + a), vec2(cx + a, CY - a))) - sw * 0.5);
      }
    }
    return d < 0.0;
  }

  // Monitor-reflection glint: a small fixed L in the screen's top-left corner, clear of every design.
  bool glintLit(vec2 uv) {
    vec2 G = uv * vec2(32.0, 24.0);
    return (G.y >= 3.0 && G.y < 4.0 && G.x >= 4.0 && G.x < 6.0) || (G.y >= 4.0 && G.y < 5.0 && G.x >= 4.0 && G.x < 5.0);
  }
`,mA=.95,gA=.03,xt={headFrac:.57,helmetSink:.05,legShare:.535,torsoW:.16,torsoD:.121,torsoCorner:.65,armLen:.19,armR:.058,armTaper:.93,armSplay:.785,elbowBend:.6,legR:.07,legTaper:.92,hipX:.09,kneeBend:1.15,mittR:.063,bootW:.065,bootH:.045,bootL:.09,bodyBlend:.042,bendBlend:.037,neckBlend:.042,partBlend:.006,ringT:.018,cuffScale:1.2,packW:.184,packH:.137,packD:.079,packRound:.53},Jt=(n=0,e=0,t=0)=>new z(n,e,t),vA=(n,e,t)=>{const i=Math.abs(n.x)-e.x+t,s=Math.abs(n.y)-e.y+t,r=Math.abs(n.z)-e.z+t;return Math.hypot(Math.max(i,0),Math.max(s,0),Math.max(r,0))+Math.min(Math.max(i,s,r),0)-t};function ua(n,e,t,i=.6){let s=0,r=i;if(n(e)>0)return 0;for(let o=0;o<40;o++){const a=(s+r)/2;n(e.clone().addScaledVector(t,a))<0?s=a:r=a}return s}const Yo=(n,e,t)=>Jt(n*Math.sin(e)*Math.cos(t),-Math.cos(e)*Math.cos(t),Math.sin(t));function _A(n=xt){const e=n.headFrac/2,t={c:Jt(0,1-e,0),r:e},i=1-2*e+n.helmetSink,s=n.legShare*i,r=(i-s)/2,o={c:Jt(0,(i+s)/2,0),b:Jt(n.torsoW,r,n.torsoD),corner:n.torsoCorner*Math.min(n.torsoW,r,n.torsoD)},a=T=>vA(T.clone().sub(o.c),o.b,o.corner),c=i-.7*n.armR,l=ua(a,Jt(0,c,0),Jt(1,0,0))+.4*n.armR,h=Math.min(n.hipX,Math.max(.02,n.torsoW-.35*n.legR)),u=Jt(h,s-.1*n.legR,0),f=1.75*n.bootH,d=o.c.y+.1*r,p=ua(a,Jt(0,d,0),Jt(0,0,-1)),x={c:Jt(0,d,-(p+.75*n.packD)),b:Jt(n.packW,n.packH,n.packD),r:n.packRound*Math.min(n.packW,n.packH,n.packD)},g=[ua(a,Jt(0,o.c.y,0),Jt(0,0,1))-.3*Math.min(n.torsoD,.1),Math.min(.39*n.torsoW,.06),o.c.y,Math.min(.32*r,.034)],M=i-.4*n.helmetSink+n.ringT,E=(M-t.c.y)/t.r,y={c:Jt(0,M,0),r:t.r*Math.sqrt(Math.max(.02,1-E*E))+.2*n.ringT};return{P:n,head:t,torso:o,shoulder:Jt(l,c,0),hip:u,ankleY:f,pack:x,panel:g,collar:y,field:a}}function xA(n,e,t,i,s){const{P:r}=n,o=Math.PI*2/t,a=Math.sin(e*2*o),c=[r.armR,r.armR*r.armTaper,r.legR,r.legR*r.legTaper];for(const[l,h]of[[0,-1],[3,1]]){const u=Math.sin(e*2*o+.6+h*.4),f=n.shoulder.clone().setX(h*n.shoulder.x),d=Yo(h,r.armSplay+.03*a,.3),p=Yo(h,r.armSplay*.27+.04*a,r.elbowBend*(1+.14*u)),x=f.clone().addScaledVector(d,r.armLen*.51);i[l].copy(f),i[l+1].copy(x),i[l+2].copy(x).addScaledVector(p,r.armLen*.49);const m=l/3;s[m]={c:f.clone().addScaledVector(d,.3*r.armR),a:d,r:r.armR+.25*r.ringT},s[4+m]={c:i[l+2].clone().addScaledVector(p,-.15*r.ringT),a:p,r:c[1]*r.cuffScale}}for(const[l,h,u]of[[6,-1,1],[9,1,.82]]){const f=r.kneeBend*u*(1+.12*Math.sin(e*2*o+h)),d=n.hip.clone().setX(h*n.hip.x),p=.45*f,x=.55*f,m=(d.y-n.ankleY)/(Math.cos(p)+Math.cos(x)),g=Yo(h,.06,p),M=Yo(h,.02,-x);i[l].copy(d),i[l+1].copy(d).addScaledVector(g,m),i[l+2].copy(i[l+1]).addScaledVector(M,m);const E=(l-6)/3,y=ua(n.field,d,g,.3);s[2+E]={c:d.clone().addScaledVector(g,y+.2*r.ringT),a:g,r:r.legR+.25*r.ringT},s[6+E]={c:i[l+2].clone().addScaledVector(M,-1.1*r.ringT-.2*r.bootH),a:M,r:c[3]*r.cuffScale}}}const ns=[-.64,-.06,-.52],is=[.64,1.06,.52],yn=_A(),Mt=n=>{const e=String(n);return/[.e]/.test(e)?e:`${e}.0`},Hs=n=>`vec3(${Mt(n.x)}, ${Mt(n.y)}, ${Mt(n.z)})`,MA=`
  uniform vec3 uJ[12];
  uniform vec3 uRingC[8];
  uniform vec3 uRingA[8];
  uniform float uRingR[8];

  const vec3 BMIN = vec3(${ns.map(Mt).join(", ")});
  const vec3 BMAX = vec3(${is.map(Mt).join(", ")});
  const vec3 HEAD = ${Hs(yn.head.c)};
  const float HEAD_R = ${Mt(yn.head.r)};
  const vec3 TORSO_C = ${Hs(yn.torso.c)};
  const vec3 TORSO_B = ${Hs(yn.torso.b)};
  const float TORSO_R = ${Mt(yn.torso.corner)};
  const vec3 PACK_C = ${Hs(yn.pack.c)};
  const vec3 PACK_B = ${Hs(yn.pack.b)};
  const float PACK_R = ${Mt(yn.pack.r)};
  const vec3 COLLAR_C = ${Hs(yn.collar.c)};
  const float COLLAR_R = ${Mt(yn.collar.r)};
  const vec4 PANEL = vec4(${yn.panel.map(Mt).join(", ")}); // chest panel: front z, half-width, centre y, half-height
  const vec4 LIMB_R = vec4(${[xt.armR,xt.armR*xt.armTaper,xt.legR,xt.legR*xt.legTaper].map(Mt).join(", ")}); // arm at shoulder, wrist; leg at hip, ankle
  const float MITT_R = ${Mt(xt.mittR)};
  const vec3 BOOT_B = vec3(${[xt.bootW,xt.bootH,xt.bootL].map(Mt).join(", ")});
  const float BOOT_R = ${Mt(.8*Math.min(xt.bootW,xt.bootH,xt.bootL))};
  const vec3 BOOT_OFF = vec3(0.0, ${Mt(-.75*xt.bootH)}, ${Mt(.31*xt.bootL)});
  const float RING_T = ${Mt(xt.ringT)};
  const float K_NECK = ${Mt(xt.neckBlend)}, K_BODY = ${Mt(xt.bodyBlend)}, K_BEND = ${Mt(xt.bendBlend)}, K_PART = ${Mt(xt.partBlend)};

  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
  // Tapered capsule from a (radius r1) to b (radius r2), Inigo Quilez's exact round cone.
  float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
    vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr * rr; float il2 = 1.0 / l2;
    vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
    vec3 xv = pa * l2 - ba * y; float x2 = dot(xv, xv); float y2 = y * y * l2; float z2 = z * z * l2;
    float k = sign(rr) * rr * rr * x2;
    if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }
  float sdTorus(vec3 p, vec3 c, vec3 ax, float R, float r) { vec3 q = p - c; float a = dot(q, ax); return length(vec2(length(q - ax * a) - R, a)) - r; }

  float dHelmet(vec3 p) { return length(p - HEAD) - HEAD_R; }
  float dTorso(vec3 p) { return sdRoundBox(p - TORSO_C, TORSO_B, TORSO_R); }
  float dPack(vec3 p) { return sdRoundBox(p - PACK_C, PACK_B, PACK_R); }
  float dCollar(vec3 p) { return sdTorus(p, COLLAR_C, vec3(0.0, 1.0, 0.0), COLLAR_R, RING_T * 1.25); }
  // Limb i (0 left arm, 3 right arm, 6 left leg, 9 right leg): the upper and lower segments.
  float dUpper(vec3 p, int i, float r0, float r1) { return sdRoundCone(p, uJ[i], uJ[i + 1], r0, mix(r0, r1, 0.5)); }
  float dLower(vec3 p, int i, float r0, float r1) { return sdRoundCone(p, uJ[i + 1], uJ[i + 2], mix(r0, r1, 0.5), r1); }
  float dRing(vec3 p, int k, float t) { return sdTorus(p, uRingC[k], uRingA[k], uRingR[k], t); }
  float dMitt(vec3 p, int i) { return length(p - (uJ[i + 2] + normalize(uJ[i + 2] - uJ[i + 1]) * MITT_R * 0.5)) - MITT_R; }
  float dBoot(vec3 p, int i) { return sdRoundBox(p - (uJ[i + 2] + BOOT_OFF), BOOT_B, BOOT_R); }
  // One smooth bent tube: the two segments smooth-unioned at the elbow or knee.
  float limb(vec3 p, int i, float r0, float r1) { return smin(dUpper(p, i, r0, r1), dLower(p, i, r0, r1), K_BEND); }

  // The core (helmet, torso, neck seal, pack), then each limb blended into the core alone, so
  // limbs never melt into each other (a mitt resting on a thigh stays a mitt). The grey parts
  // (rings, cuffs, collar) join with a small crisp blend so they read as separate pieces.
  float map(vec3 p) {
    float core = smin(dHelmet(p), dTorso(p), K_NECK);
    core = smin(core, dCollar(p), K_PART);
    core = smin(core, dPack(p), 0.015);
    float d = core;
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      float arm = smin(core, limb(p, a, LIMB_R.x, LIMB_R.y), K_BODY);
      arm = smin(arm, dRing(p, s, RING_T * 1.1), K_PART);
      arm = smin(arm, dMitt(p, a), 0.02);
      arm = smin(arm, dRing(p, 4 + s, RING_T), K_PART);
      float leg = smin(core, limb(p, l, LIMB_R.z, LIMB_R.w), K_BODY);
      leg = smin(leg, dRing(p, 2 + s, RING_T * 1.1), K_PART);
      leg = smin(leg, dBoot(p, l), 0.02);
      leg = smin(leg, dRing(p, 6 + s, RING_T), K_PART);
      d = min(d, min(arm, leg));
    }
    return d;
  }

  // Visor screen: a rounded rectangle in yaw/pitch about the helmet centre, ~4:3 once
  // projected onto the sphere. xy = screen uv (0..1, y down), z = superellipse value.
  vec3 visorUV(vec3 p) {
    vec3 d = normalize(p - HEAD);
    float yaw = atan(d.x, d.z);
    float pitch = asin(clamp(d.y, -1.0, 1.0)) + 0.02;
    vec2 q = vec2(yaw / 0.74, pitch / 0.54);
    return vec3(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5, pow(abs(q.x), 5.0) + pow(abs(q.y), 5.0));
  }

  // Colour region of the nearest part: 0 suit, 1 gear, 2 contributor accent, 3 visor.
  // The contributor colour sits on the shoulder rings (no sleeve band) and the pack stripe.
  int region(vec3 p) {
    float best = dHelmet(p);
    int part = 0; // 0 helmet 1 torso 2 pack 3 white limb 4 gear 5 shoulder ring
    float d;
    d = dTorso(p); if (d < best) { best = d; part = 1; }
    d = dPack(p); if (d < best) { best = d; part = 2; }
    d = dCollar(p); if (d < best) { best = d; part = 4; }
    for (int s = 0; s < 2; s++) {
      int a = s * 3, l = 6 + s * 3;
      d = dUpper(p, a, LIMB_R.x, LIMB_R.y); if (d < best) { best = d; part = 3; }
      d = dLower(p, a, LIMB_R.x, LIMB_R.y); if (d < best) { best = d; part = 3; }
      d = dRing(p, s, RING_T * 1.1); if (d < best) { best = d; part = 5; }
      d = dMitt(p, a); if (d < best) { best = d; part = 4; }
      d = dRing(p, 4 + s, RING_T); if (d < best) { best = d; part = 4; }
      d = dUpper(p, l, LIMB_R.z, LIMB_R.w); if (d < best) { best = d; part = 3; }
      d = dLower(p, l, LIMB_R.z, LIMB_R.w); if (d < best) { best = d; part = 3; }
      d = dRing(p, 2 + s, RING_T * 1.1); if (d < best) { best = d; part = 4; }
      d = dBoot(p, l); if (d < best) { best = d; part = 4; }
      d = dRing(p, 6 + s, RING_T); if (d < best) { best = d; part = 4; }
    }
    if (part == 0) {
      float e = visorUV(p).z;
      return e < 1.0 ? 3 : e < 1.75 ? 1 : 0; // screen, then a gear-tone bezel
    }
    if (part == 1) return (p.z > PANEL.x && abs(p.x) < PANEL.y && abs(p.y - PANEL.z) < PANEL.w) ? 1 : 0; // chest panel
    if (part == 2) return abs(p.y - (PACK_C.y + PACK_B.y * 0.38)) < PACK_B.y * 0.25 ? 2 : 1; // pack + contributor stripe
    if (part == 5) return 2;
    return part == 4 ? 1 : 0;
  }
`,yA=`
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uViewProj;
  uniform vec3 uLightLocal;
  uniform vec3 uSuit[4];
  uniform vec3 uGear[4];
  uniform vec3 uAccent[4];
  uniform vec3 uVisor[2];
  uniform vec3 uGlint;
  uniform vec3 uEyeGlow; // the eye light: the contributor ramp's step 2
  ${Ms}
  ${pA}
  ${MA}
  in vec3 vPosW;

  vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.0015;
    return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
  }
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.02;
    for (int i = 0; i < 48; i++) {
      float h = map(ro + rd * t);
      if (h < 0.002) return 0.0;
      t += max(h * 0.85, 0.008);
      if (t > 1.4) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.025 * float(i);
      o += (h - map(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 160; i++) {
      float h = map(ro + rd * t);
      if (h < 0.0012 * (1.0 + t)) { hit = true; break; }
      t += h * 0.8; // under-step a little to stay on the thin rings
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 L = normalize(uLightLocal);
    float lit = dot(n, L);
    if (shadow(p + n * 0.006, L) < 0.5) lit = min(lit, 0.1) - 0.3;
    lit -= (1.0 - occlusion(p, n)) * 0.6;
    int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
    int r = region(p);
    vec3 c;
    if (r == 3) {
      vec3 refl = reflect(rd, n);
      c = (refl.y > 0.18 && b >= 2) ? uVisor[1] : uVisor[0];
      // Eyes: evaluated analytically at the hit point, glowing unlit in the contributor colour; the
      // internal-resolution render is what pixelates them.
      vec2 uv = visorUV(p).xy;
      if (eyeLit(uv)) c = uEyeGlow;
      if (glintLit(uv)) c = uGlint;
    } else if (r == 2) c = uAccent[b];
    else if (r == 1) c = uGear[b];
    else c = uSuit[b];
    vec4 pw = uModel * vec4(p, 1.0);
    gl_FragColor = vec4(depthFade(c, pw.xyz, 1.0), 1.0);
    vec4 clip = uViewProj * pw;
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`,SA=new Vi(is[0]-ns[0],is[1]-ns[1],is[2]-ns[2]).translate((is[0]+ns[0])/2,(is[1]+ns[1])/2,(is[2]+ns[2])/2),ld=Object.keys(we.crew.contributors);function bA(n){const e=dA(n,ld.length,rn*zt);return{eyes:e.eyes,colour:ld[e.colour],phase:e.phaseFrames/zt}}function wA(n,e){const t=((n+e*.37)%rn+rn)%rn;return t>.18?1:1-Math.sin(t/.18*Math.PI)*.88}function EA(n){const e=Math.PI*2/rn;return{bob:Math.sin(n*2*e)*.05,roll:Math.sin(n*e)*.07,pitch:Math.sin(n*e+1.3)*.05}}const cd=new Qn,AA=new z,TA=new z;class RA{constructor(e){this.look=e,this.lift.position.y=gA,this.body.scale.setScalar(mA),this.root.add(this.lift),this.lift.add(this.body);const t=we.crew,i=t.contributors[e.colour],s={uInvModel:{value:new Ve},uModel:{value:new Ve},uViewProj:{value:new Ve},uLightLocal:{value:new z},uSuit:{value:Je(t.suit,4)},uGear:{value:Je(t.gear,4)},uAccent:{value:Je(i,4)},uVisor:{value:Je(t.visor,2)},uGlint:{value:Je([t.glint],1)[0]},uEyeGlow:{value:Je([i[2]],1)[0]},uEyes:{value:e.eyes},uBlink:{value:1},uJ:{value:this.joints},uRingC:{value:Array.from({length:8},()=>new z)},uRingA:{value:Array.from({length:8},()=>new z(0,1,0))},uRingR:{value:new Array(8).fill(.05)}};this.material=fs(yA,s,{vertexShader:Nh,side:kt}),this.proxy=new Ht(SA,this.material),this.proxy.onBeforeRender=(r,o,a)=>{this.material.uniforms.uViewProj.value.multiplyMatrices(a.projectionMatrix,a.matrixWorldInverse)},this.body.add(this.proxy)}look;root=new Ot;lift=new Ot;body=new Ot;proxy;material;joints=Array.from({length:12},()=>new z);rings=[];update(e){const t=e+this.look.phase,i=this.material.uniforms;xA(yn,t,rn,this.joints,this.rings),this.rings.forEach((o,a)=>{i.uRingC.value[a].copy(o.c),i.uRingA.value[a].copy(o.a).normalize(),i.uRingR.value[a]=o.r});const s=EA(t);this.body.position.y=s.bob,this.body.rotation.set(s.pitch,0,s.roll),i.uBlink.value=wA(t,this.look.phase),this.root.updateMatrixWorld(!0);const r=this.proxy.matrixWorld;i.uModel.value.copy(r),i.uInvModel.value.copy(r).invert(),r.decompose(AA,cd,TA),i.uLightLocal.value.copy(ki.uLight.value).applyQuaternion(cd.invert())}dispose(){this.material.dispose()}}const CA=n=>`
  uniform mat4 uInvModel;
  uniform mat4 uModel;
  uniform mat4 uViewProj;
  uniform vec3 uLightLocal;
  uniform vec3 uShell[4];
  uniform vec3 uTrim[4];
  uniform vec3 uMetal[4];
  uniform vec3 uGold[4];
  uniform vec3 uInterior; // a window's inside: a lighter indigo than the visors, so they read in it
  uniform vec3 uFlame[4];
  uniform vec3 uLights[2];
  uniform int uFlameOn;
  in vec3 vPosW;
  ${Ms}
  ${Kv(n)}

  float scene(vec3 p) {
    int j;
    float d = hull(p);
    if (uFlameOn == 1) d = min(d, flameField(p, j));
    return d;
  }
  vec3 calcNormal(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    const float e = 0.002;
    return normalize(k.xyy * hull(p + k.xyy * e) + k.yyx * hull(p + k.yyx * e) + k.yxy * hull(p + k.yxy * e) + k.xxx * hull(p + k.xxx * e));
  }
  float shadow(vec3 ro, vec3 rd) {
    float t = 0.03;
    for (int i = 0; i < 64; i++) {
      float h = hull(ro + rd * t);
      if (h < 0.003) return 0.0;
      t += max(h * 0.85, 0.012);
      if (t > 4.0) break;
    }
    return 1.0;
  }
  float occlusion(vec3 p, vec3 n) {
    float o = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.045 * float(i);
      o += (h - hull(p + n * h)) / h;
    }
    return clamp(1.0 - o * 0.3, 0.0, 1.0);
  }
  vec3 slotRamp(int slot, int b) {
    if (slot == 1) return uTrim[b];
    if (slot == 2) return uMetal[b];
    if (slot == 3) return uGold[b];
    return uShell[b];
  }
  // The hull at p, hit from direction rd: its colour, and the point whose depth it writes (a window writes
  // the far wall of the inside, so the crew behind it shows).
  vec3 shadeHull(vec3 p, vec3 rd, out vec3 pd) {
    pd = p;
    vec3 n = calcNormal(p);
    int light;
    int r = paint(p, partOf(p), light);
    if (r == ${dp}) return uLights[uLightOn[light] > 0.5 ? 1 : 0]; // the beacon is unlit
    if (r == ${fp}) {
      // The hit can stop just short of the surface (the march's epsilon grows with distance), so first
      // step in, then march the inside to the far wall: a window that wrote the front's depth would hide
      // the crew (ship lab: test 1).
      vec3 q = p;
      bool inside = false;
      for (int i = 0; i < 128; i++) {
        float h = hull(q);
        if (!inside) { if (h < 0.0) inside = true; else { q += rd * max(h, 0.003); continue; } }
        if (h > 0.0005) break;
        q += rd * max(-h, 0.006);
      }
      pd = q;
      return uInterior;
    }
    vec3 L = normalize(uLightLocal);
    float lit = dot(n, L);
    if (shadow(p + n * 0.01, L) < 0.5) lit = min(lit, 0.1) - 0.3;
    lit -= (1.0 - occlusion(p, n)) * 0.6;
    int b = lit > 0.7 ? 3 : lit > 0.32 ? 2 : lit > -0.12 ? 1 : 0;
    return slotRamp(r, b);
  }

  void main() {
    vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz;
    vec3 rd = normalize((uInvModel * vec4(vPosW, 1.0)).xyz - ro);
    vec3 t0 = (BMIN - ro) / rd, t1 = (BMAX - ro) / rd;
    vec3 tmin = min(t0, t1), tmax = max(t0, t1);
    float t = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    bool hit = false;
    for (int i = 0; i < 200; i++) {
      float h = scene(ro + rd * t);
      if (h < 0.0015 * (1.0 + t)) { hit = true; break; }
      t += h * 0.85;
      if (t > tf) break;
    }
    if (!hit) discard;
    vec3 p = ro + rd * t, pd = p, c;
    int j;
    float dh = hull(p), df = uFlameOn == 1 ? flameField(p, j) : 1e9;
    if (df < dh) {
      // the thruster flame: unlit, hottest at the nozzle and along its middle as seen
      vec3 A = FLAME_A[j], T = flameTip(j), ax = T - A;
      float len = length(ax);
      vec3 ad = ax / len;
      float u = clamp(dot(p - A, ad) / len, 0.0, 1.0);
      float lat = abs(dot(p - (A + ad * u * len), normalize(cross(rd, ad))));
      float heat = 1.0 - 0.9 * u - 0.6 * clamp(lat / mix(FLAME_R[j], 0.035, u), 0.0, 1.0);
      c = uFlame[heat > 0.5 ? 3 : heat > 0.26 ? 2 : heat > 0.04 ? 1 : 0];
    } else {
      c = shadeHull(p, rd, pd);
    }
    gl_FragColor = vec4(depthFade(c, (uModel * vec4(p, 1.0)).xyz, 1.0), 1.0); // faded by the surface seen
    vec4 clip = uViewProj * (uModel * vec4(pd, 1.0));
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
  }
`,PA=we.ship.hull,LA={...we.ship.cap,trim:we.ship.cap.shell,metal:we.ship.cap.shell,interior:we.ship.cap.shell,flame:we.ship.cap.shell,lights:we.ship.cap.shell},IA=n=>{const{lo:e,hi:t}=La(n);return new Vi(t[0]-e[0],t[1]-e[1],t[2]-e[2]).translate((t[0]+e[0])/2,(t[1]+e[1])/2,(t[2]+e[2])/2)},hd=new Qn,DA=new z,NA=new z;class ud{constructor(e,t){this.spec=e,this.geometry=IA(e),this.material=fs(CA(e),{uInvModel:{value:new Ve},uModel:{value:new Ve},uViewProj:{value:new Ve},uLightLocal:{value:new z},uShell:{value:Je(t.shell,4)},uTrim:{value:Je(t.trim,4)},uMetal:{value:Je(t.metal,4)},uGold:{value:Je(t.gold,4)},uInterior:{value:Je(t.interior,1)[0]},uFlame:{value:Je(t.flame,4)},uLights:{value:Je(t.lights,2)},uFlameL:{value:new Array(Ir).fill(0)},uFlameW:{value:Array.from({length:Ir},()=>new ze)},uLightOn:{value:new Array(sc).fill(0)},uFlameOn:{value:e.flames.length>0?1:0}},{vertexShader:Nh,side:kt}),this.mesh=new Ht(this.geometry,this.material),this.mesh.onBeforeRender=(i,s,r)=>{this.material.uniforms.uViewProj.value.multiplyMatrices(r.projectionMatrix,r.matrixWorldInverse)}}spec;mesh;material;geometry;sync(e){const t=this.material.uniforms,i=this.mesh.matrixWorld;t.uModel.value.copy(i),t.uInvModel.value.copy(i).invert(),i.decompose(DA,hd,NA),t.uLightLocal.value.copy(ki.uLight.value).applyQuaternion(hd.invert()),this.spec.flames.forEach((s,r)=>{const o=Sg(e,r);t.uFlameL.value[r]=s.len*o.len,t.uFlameW.value[r].set(o.dx,o.dz)}),this.spec.lights.forEach((s,r)=>{t.uLightOn.value[r]=bg(s,e)?1:0})}dispose(){this.material.dispose(),this.geometry.dispose()}}class Hm{group=new Ot;idle=new Ot;scaled=new Ot;hull=null;cap=new ud(Mu,LA);crew=[];shipSpec=null;constructor(){this.scaled.scale.setScalar(Un),this.group.add(this.idle),this.idle.add(this.scaled),this.cap.mesh.rotation.x=Mu.tilt,this.group.visible=!1}get spec(){return this.shipSpec}get riders(){return this.crew}set(e){if(this.clear(),e.length===0)return;const t=this.shipSpec=Xd(e.length);this.hull=new ud(t,PA),this.scaled.add(this.hull.mesh),e.forEach((i,s)=>{const r=t.seats[s];if(!i||!r)return;const o=new RA(bA(i.seed));o.root.position.set(...r.p),o.root.rotation.set(0,r.yaw,0),i.captain&&r.captain&&o.body.add(this.cap.mesh),this.scaled.add(o.root),this.crew.push({rider:i,seat:s,astronaut:o})}),this.group.visible=!0}pose(e,t,i=[0,0,0]){if(!this.hull)return;const s=ms(e,t),r=Math.round(vi(t)*gi*zt)/zt;this.group.position.set(s.centre[0]-i[0],s.centre[1]-i[1],s.centre[2]-i[2]),this.group.rotation.set(0,s.yaw,0);const o=Vd(r);this.idle.position.y=o.bob*Un,this.idle.rotation.set(o.pitch,0,o.roll),this.group.updateMatrixWorld(!0),this.hull.sync(r);for(const a of this.crew)a.astronaut.update(r);this.cap.sync(r)}clear(){this.hull&&(this.scaled.remove(this.hull.mesh),this.hull.dispose());for(const e of this.crew)this.scaled.remove(e.astronaut.root),e.astronaut.dispose();this.cap.mesh.removeFromParent(),this.hull=null,this.shipSpec=null,this.crew=[],this.group.visible=!1}dispose(){this.clear(),this.cap.dispose()}}const FA={uFogTeal:{value:us(we.accent.teal[3])}};class UA{constructor(e){this.plan=e;const t=e.territory.cells;this.data=new Float32Array(t*ga*4),this.tex=new Ia(this.data,t,ga,En,wn),this.tex.magFilter=this.tex.minFilter=_t,this.tex.generateMipmaps=!1,this.uniforms={...FA,uFogOn:{value:0},uFogCells:{value:this.tex},uFogN:{value:t},uFogWin:{value:e.window},uFogPulse:{value:new ct(0,1,0,0)},uFogToSurface:{value:new Ve}},this.at=e.fileIds.map(()=>({level:2,from:2,kind:0,progress:0})),this.set(this.at,null)}plan;uniforms;data;tex;sky=null;at;draw(e){this.sky=e,e.set(this.at)}set(e,t){this.at=e,hv(this.plan,e,this.data),this.tex.needsUpdate=!0;const i=this.uniforms,s=i.uFogPulse.value;if(t){const r=ps(this.plan.territory.cells);s.set(r[3*t.cell],r[3*t.cell+1],r[3*t.cell+2],Math.max(1e-4,t.progress))}else s.w=0;i.uFogOn.value=t||e.some(r=>r.level>0||r.kind!==0)?1:0,this.sky?.set(e)}dispose(){this.tex.dispose()}}const OA=512,kA=1.6,fd=new Ve,BA=new z,zA=new z,GA=new z;function HA(n){const e=Math.hypot(n.dir[0],n.dir[1],n.dir[2]),t=[n.dir[0]/e,n.dir[1]/e,n.dir[2]/e],{east:i,north:s}=Jo(t);fd.makeBasis(BA.set(i[0],i[1],i[2]).multiplyScalar(n.size*n.stretch),zA.set(t[0],t[1],t[2]).multiplyScalar(n.size*n.flat),GA.set(s[0],s[1],s[2]).multiplyScalar(n.size));const r=rp(n);return fd.setPosition(t[0]*r,t[1]*r,t[2]*r)}class ql{constructor(e,t,i){this.src=e,this.material=t,this.group=i,this.build(OA)}src;material;group;mesh;mass;geos;detail="far";build(e){this.mass=new qr(new Float32Array(e*4),4),this.geos={near:this.src.near.clone(),far:this.src.far.clone(),tiny:this.src.tiny.clone()};for(const t of Object.values(this.geos))t.setAttribute("aMass",this.mass);this.mesh=new Yr(this.geos[this.detail],this.material,e),this.mesh.boundingSphere=new Hi(new z,kA),this.mesh.count=0,this.mesh.visible=!1,this.group.add(this.mesh)}set(e){let t=!1;if(e.length>this.mass.count){let i=this.mass.count;for(;i<e.length;)i*=2;this.dispose(),this.group.remove(this.mesh),this.build(i),t=!0}for(let i=0;i<e.length;i++){const s=e[i];this.mesh.setMatrixAt(i,HA(s)),s.anchor?this.mass.setXYZW(i,s.anchor[0],s.anchor[1],s.anchor[2],1):this.mass.setXYZW(i,0,0,0,0)}return this.mesh.count=e.length,this.mesh.visible=e.length>0,this.mesh.instanceMatrix.needsUpdate=!0,this.mass.needsUpdate=!0,t}lod(e){this.detail=e,this.mesh.geometry=this.geos[e]}dispose(){for(const e of Object.values(this.geos))e.dispose();this.mesh.dispose()}}class VA{constructor(e,t,i,s){this.geos=i,this.mats=s,this.plan=new Mv(e,t),this.cloud=new ql(i,s.cloud,this.group),this.shadow=this.shadowMesh(),this.teal=new ql(i,s.teal,this.group),this.mist=new ql(i,s.mist,this.group)}geos;mats;group=new Ot;plan;cloud;teal;mist;shadow;shadowOn=!0;key="";shadowMesh(){const e=new Yr(this.geos.far,this.mats.shadow,0);return e.instanceMatrix=this.cloud.mesh.instanceMatrix,e.boundingSphere=this.cloud.mesh.boundingSphere,e.count=0,e.visible=!1,this.group.add(e),e}set(e){const t=e.map(s=>`${s.level}${s.from}${s.kind}${s.progress}`).join(",");if(t===this.key)return;this.key=t;const i=this.plan.at(e);this.cloud.set(i.cloud)&&(this.group.remove(this.shadow),this.shadow.dispose(),this.shadow=this.shadowMesh()),this.teal.set(i.teal),this.mist.set(i.mist),this.shadow.count=this.cloud.mesh.count,this.shadow.visible=this.shadowOn&&this.shadow.count>0}lod(e,t){for(const i of[this.cloud,this.teal,this.mist])i.lod(e);this.shadowOn=t,this.shadow.visible=t&&this.shadow.count>0}dispose(){for(const e of[this.cloud,this.teal,this.mist])e.dispose();this.shadow.dispose()}}function Vm(n){const e=new qr(new Float32Array(Math.max(1,n)*4).fill(0),4);for(let t=0;t<n;t++)e.setXYZW(t,2,0,0,2);return e}function dd(n,e){e.forEach((t,i)=>n.setXYZW(i,t.level,t.kind,t.progress,t.from)),n.needsUpdate=!0}const it=we.world,Wm={float:0,mass:2,size:1,lift:1,strays:0,flat:.6,stretch:1,fissure:!1},WA={...Wm,ramp:it.spore,cover:.27,gain:.62,float:.05,mass:2.2,size:.7,lift:1.1,strays:.05},$A={...Wm,ramp:it.ash,cover:.08,gain:.3,size:.45,lift:.3,flat:.3,stretch:3,fissure:!0},XA={lush:{id:un.lush,ramps:[it.ocean,it.land,it.cap,it.glow],sea:[.47,.55],weather:null,haze:null},ocean:{id:un.ocean,ramps:[it.water,it.land,it.cap,it.glow],sea:[.7,.73],weather:null,haze:it.haze.ocean},ice:{id:un.ice,ramps:[it.ice,it.crevasse,it.water,it.glow],sea:[.5,.5],weather:null,haze:it.haze.ice},toxic:{id:un.toxic,ramps:[it.sludge,it.toxic,it.fungus,it.glow],sea:[.5,.56],weather:WA,haze:it.haze.toxic},desert:{id:un.desert,ramps:[it.sand,it.rock,it.cap,it.glow],sea:[.5,.5],weather:null,haze:null},lava:{id:un.lava,ramps:[it.crust,it.crust,it.ash,it.glow],sea:[.5,.5],weather:$A,haze:null}},pd=new io(1,72,48),gr={nearPx:48,shadowMinPx:16,tinyPx:24},$m=n=>{const e=n.getAttribute("position"),t=n.getAttribute("normal");for(let i=0;i<e.count;i++)t.setXYZ(i,e.getX(i),e.getY(i),e.getZ(i));return n},md=new Na(1,1),gd=$m(new Na(1,0)),qA=$m(new Lh(1,0)),Xm=new io(1,20,14),YA=3200,KA=n=>{const{max:e,from:t,to:i}=qt.lift;return e*(1-rM.clamp((n-t)/(i-t),0,1))};function qm(n){return Array.from({length:n},(e,t)=>{const i=1-(t+.5)/n*2,s=Math.sqrt(1-i*i),r=t*2.39996;return[Math.cos(r)*s,i,Math.sin(r)*s]})}const Ym=(n,e)=>[...n].sort((t,i)=>i-t)[Math.round(e*n.length)];function Km(n,e){const t=new Map;return i=>{const s=i.join(",");let r=t.get(s);return r===void 0&&t.set(s,r=ev(i,n,e)),r}}function vd({freq:n,pool:e},t){const i=Km(t,e.scale);return Ym(qm(3e3).map(s=>i(Qg(s[0]*n+t[0],s[1]*n+t[1],s[2]*n+t[2]))),e.share)}const br=n=>new z(n[0],n[1],n[2]);function ZA(n){const e=XA[n.look],t=new Ot,i=new Ot;i.scale.setScalar(n.radius),t.add(i);const s=Zr(n.seed*7919+13),r=[s()*50,s()*50,s()*50],[o,a]=e.sea,c=o+s()*(a-o),l=KA(n.radius),h=n.look==="lava"?vd(qt.lava,r):n.look==="ice"?vd(qt.ice,[r[1],r[2],r[0]]):9,[u,f,d,p]=e.ramps,x=new UA(cv(n.surface)),m=fs(BE,{...x.uniforms,uBiome:{value:e.id},uA:{value:Je(u,5)},uB:{value:Je(f,5)},uC:{value:Je(d,5)},uG:{value:Je(p,3)},uSeedOff:{value:br(r)},uSea:{value:c},uPoolCut:{value:h},uCrackLift:{value:l},uBands:{value:new z(.2,.58,.86)},uLavaTime:{value:new ze(1,0)}}),g=new Ot,M=new Ht(pd,m);g.add(M),i.add(g);const E=[m,x];let y=null;if(e.haze){const X=fs($E,{...x.uniforms,uHaze:{value:Je([e.haze],1)[0]}});y=new Ht(pd,X),y.scale.setScalar(1.06),i.add(y),E.push(X)}const T={value:new z},b={value:n.radius},v={value:new Ve},_={value:new z(-.3,.12,.42)},R=(X,j,de=0)=>fs(WE,{...x.uniforms,uRadius:b,uSmoke:{value:de},uRamp:{value:Je(X,4)},uCenter:T,uBands:_,uFogSky:{value:j}},{vertexShader:VE}),C=X=>new an({vertexShader:GE,fragmentShader:HE,side:qn,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2,uniforms:{...m.uniforms,uCenter:T,uRadius:b,uToSurface:v,uFogSky:{value:X},uShadowReach:{value:zE}}}),L=new Ot;i.add(L);let D=null,B=null,A=null;if(e.weather){const X=JA(e.weather,n.seed,s,r,h,l),j=R(e.weather.ramp,0,e.weather.fissure?1:0),de=md.clone(),Re=gd.clone();if(de.setAttribute("aMass",X.mass),Re.setAttribute("aMass",X.mass),A={near:de,far:Re},D=new Yr(Re,j,X.matrices.length),X.matrices.forEach((K,fe)=>D.setMatrixAt(fe,K)),D.computeBoundingSphere(),L.add(D),E.push(j,de,Re,D),!e.weather.fissure){const K=C(0);B=new Yr(Re,K,0),B.instanceMatrix=D.instanceMatrix,B.count=D.count,B.boundingSphere=D.boundingSphere,L.add(B),E.push(K,B)}}const F={cloud:R(we.world.cloud,1),teal:R(we.accent.teal,1),mist:R(we.fog.mist,1),shadow:C(1)},O=new VA(x.plan,n.seed,{near:md,far:gd,tiny:qA},F);g.add(O.group),x.draw(O),E.push(...Object.values(F),O);let N=null,q=null;if(n.moons.length>0){const X=Rm(we.world.moonBody),j=Xm.clone();q=Vm(n.moons.length),j.setAttribute("aFog",q),N=Cm(X,n.moons.length,Ta(n),j),t.add(N),E.push(X,j,N)}function V(X,j,de){t.position.set(j[0],j[1],j[2]),D&&A&&(D.geometry=de>=gr.nearPx?A.near:A.far,B&&(B.geometry=D.geometry,B.visible=de>=gr.shadowMinPx)),O.lod(de>=gr.nearPx?"near":de>=gr.tinyPx?"far":"tiny",de>=gr.shadowMinPx);const Re=fi(X,Ni.surface);g.rotation.y=-Re,L.rotation.y=-fi(X,Ni.clouds);const K=fi(X,Ni.lava);m.uniforms.uLavaTime.value.set(Math.cos(K),Math.sin(K)),N&&Pm(N,n.moons.map(fe=>Ra(fe,X)),Jr),T.value.copy(t.position),t.updateMatrixWorld(!0),v.value.copy(M.matrixWorld).invert(),x.uniforms.uFogToSurface.value.copy(v.value)}return{model:n,root:t,fog:x,moonFog:q,update:V,dispose:()=>{for(const X of E)X.dispose()}}}function JA(n,e,t,i,s,r){const o=[],a=[];let c=-1;const l=(_,R,C,L,D)=>{if(o.length>=YA)return;const B=Rr(_),{east:A,north:F}=Jo(B),O=new Ve().makeBasis(br(A).multiplyScalar(R*D),br(B).multiplyScalar(R*L),br(F).multiplyScalar(R));O.setPosition(br(B).multiplyScalar(1+n.float+R*L*(.75+C*.5))),a.push(c),o.push(O)},h=(_,R,C,L,D,B)=>{l(_,R,C,D,B);const{east:A,north:F}=Jo(Rr(_));for(let O=0;O<L;O++){const N=t()*Math.PI*2,q=R*(.9+t()*.5),V=Math.cos(N)*q*1.4*B,X=Math.sin(N)*q*.7;l([_[0]+A[0]*V+F[0]*X,_[1]+A[1]*V+F[1]*X,_[2]+A[2]*V+F[2]*X],R*(.5+t()*.25),C*.5,D,B)}},u=Math.min(1,n.cover*n.gain),f=n.fissure?4e3:Math.round(1500/n.size**2),d=qm(f);let p;if(n.fissure){const{freq:_,cut:R,half:C,tip:L,pool:D}=qt.lava,B=Ci(e*23+3),A=Km(i,D.scale);p=d.map(F=>{const{edge:O,own:N,across:q}=jg(F[0]*_+i[0],F[1]*_+i[1],F[2]*_+i[2]),V=[N,q].filter(X=>A(X)>s).length;return V===2||V===0&&nv(tv(F,_,i),R,r)*C<L?-1:1-O/_*8+(B(F[0]*1.6,F[1]*1.6,F[2]*1.6)-.5)*.25})}else{const _=Ci(e*31+5),R=Ci(e*17+9),C=n.mass;p=d.map(L=>Math.max(_(L[0]*C+4,L[1]*C,L[2]*C),R(L[0]*.9,L[1]*6+2,L[2]*.9)))}const x=u>0?Ym(p,Math.min(u,(f-1)/f))-.012:1/0,m=n.fissure?[]:d.map((_,R)=>R).filter(_=>p[_]-x>.012),g=new Map(m.map(_=>[_,_])),M=_=>{for(;g.get(_)!==_;)g.set(_,g.get(g.get(_))),_=g.get(_);return _},E=Math.cos(1.8*Math.sqrt(4*Math.PI/f));for(let _=0;_<m.length;_++)for(let R=_+1;R<m.length;R++)Yt(d[m[_]],d[m[R]])>E&&g.set(M(m[_]),M(m[R]));const y=new Map,T=[];for(const _ of m){const R=M(_);y.has(R)||(y.set(R,T.length),T.push([])),y.set(_,y.get(R)),T[y.get(R)].push(_)}for(let _=0;_<f;_++){const R=p[_]-x,C=[(t()-.5)*.05,(t()-.5)*.05,(t()-.5)*.05],L=d[_],D=[L[0]+C[0],L[1]+C[1],L[2]+C[2]];if(c=y.get(_)??-1,n.fissure){if(R<=.012)continue;c=-1;const{east:B}=Jo(L),A=(.022+t()*.014)*n.size*2,F=2+Math.floor(t()*3);for(let O=0;O<=F;O++){const N=O*A*n.stretch*1.1;l([L[0]+B[0]*N,L[1]+B[1]*N,L[2]+B[2]*N],A*(1-O*.22),n.lift*(1+O*.4),n.flat,n.stretch)}}else if(R>.012){const B=Math.min(1,R*7);d[_]=D,h(D,(.058+B*.04+t()*.01)*n.size,(.2+B*.9)*n.lift,B<.35?2+Math.floor(t()*2):1,n.flat,n.stretch)}else R>-.08&&t()<n.strays&&(T.push([_]),c=T.length-1,d[_]=D,h(D,(.026+t()*.012)*n.size,.3*n.lift,2+Math.floor(t()*2),n.flat,n.stretch))}const b=(n.fissure?[]:T).map(_=>{const R=[0,0,0];for(const B of _){const A=d[B];R[0]+=A[0],R[1]+=A[1],R[2]+=A[2]}const C=Rr(R),L=Math.acos(Math.min(1,Math.min(..._.map(B=>Yt(d[B],C))))),D=1+n.float-Math.min(.5,Math.max(.06,L*1.1));return[C[0]*D,C[1]*D,C[2]*D]}),v=new qr(new Float32Array(o.length*4),4);for(let _=0;_<o.length;_++){const R=b[a[_]];R?v.setXYZW(_,R[0],R[1],R[2],1):v.setXYZW(_,0,0,0,0)}return{matrices:o,mass:v}}const QA=new io(1,48,32),jA=900,Yl=500;function eT(){const n=Zr(4242),e=[],t=[];for(let o=0;o<jA;o++){const a=n()*2-1,c=n()*Math.PI*2,l=Math.sqrt(1-a*a);e.push(Math.cos(c)*l*Yl,a*Yl,Math.sin(c)*l*Yl);const h=n();t.push(h<.8?0:h<.96?1:2)}const i=new An;i.setAttribute("position",new Pt(e,3)),i.setAttribute("aShade",new Pt(t,1));const s=new an({vertexShader:XE,fragmentShader:qE,depthWrite:!1,uniforms:{uRamp:{value:Je(we.world.stars,3)}}}),r=new sm(i,s);return r.renderOrder=-1,r.frustumCulled=!1,r}class tT{constructor(e){if(this.model=e,this.depth=_u(e),this.scene.add(this.starfield),this.scene.add(this.fleet.group),this.scene.add(this.beacons.points),this.scene.add(this.crew.group),this.disposables.push(this.starfield.geometry,this.starfield.material),this.starMat=fs(UE,{uDisc:{value:Je(we.world.starDisc,5)},uCorona:{value:Je(we.world.starCorona,2)},uChurn:{value:new ze(1,0)},uSpin:{value:new ze(1,0)}},{side:kt}),this.star=new Ht(QA,this.starMat),this.star.scale.setScalar(e.star.radius*ri.span),this.scene.add(this.star),this.disposables.push(this.starMat),e.star.moonlets.length>0){const t=Rm(we.world.moonBody),i=e.star.moonlets[0].orbit,s=Xm.clone();this.moonletFog=Vm(e.star.moonlets.length),s.setAttribute("aFog",this.moonletFog),this.moonlets=Cm(t,e.star.moonlets.length,i+Tr,s),this.scene.add(this.moonlets),this.disposables.push(t,s,this.moonlets)}else this.moonlets=null,this.moonletFog=null;this.planets=e.planets.map(t=>{const i=ZA(t);return this.scene.add(i.root),i})}model;scene=new Yc;camera=new In(jr,Ca,Ks,pg);planets;fleet=new Gm;beacons=new t1;crew=new Hm;starfield=eT();starMat;star;moonlets;moonletFog;fog=null;fogEvents=[];fogDirty=!0;disposables=[];depth;setCrew(e){this.crew.set(e),this.depth=_u(this.model,Pa(this.model,mp(this.model,this.crew.spec)))}fileIds(){return[...this.model.planets.flatMap(e=>[...e.surface.settlements.map(t=>t.fileId),...e.moons.map(t=>t.fileId)]),...this.model.star.moonlets.map(e=>e.fileId)]}setFog(e,t){this.fog=e,this.fogEvents=t,this.fogDirty=!0}poseFog(e){if(!this.fogDirty&&this.fogEvents.length===0)return;const t=ma(this.fog),i=new Map(this.fogEvents.map(r=>[r.fileId,r])),s=r=>lv(t(r),i.get(r),e);for(const r of this.planets){const o=r.model.moons.map(a=>a.fileId);r.fog.set(r.fog.plan.fileIds.map(s),uv(r.fog.plan,i,o,ph(this.fog,r.model.dirId)?.fogged??null,e)),r.moonFog&&dd(r.moonFog,o.map(s))}this.moonletFog&&dd(this.moonletFog,this.model.star.moonlets.map(r=>s(r.fileId))),this.fogDirty=!1}centres(e){return this.model.planets.map(t=>Kn(t,e))}spheres(e){return this.model.planets.map(t=>({centre:Kn(t,e),radius:t.radius}))}smallBodies(e){return[...this.model.planets.flatMap(i=>i.moons.map(s=>({centre:Kt(Kn(i,e),Ra(s,e)),radius:Jr}))),...this.model.star.moonlets.map(i=>({centre:uu(i,e),radius:Tr}))]}pose(e,t,i){const s=t.target,r=_i(t.yaw,t.pitch),o=Et(r.back,t.dist);this.camera.position.set(o[0],o[1],o[2]),this.camera.up.set(0,1,0),this.camera.fov=Gt(t),this.camera.lookAt(0,0,0),this.camera.updateMatrixWorld(!0),ki.uEye.value.set(o[0],o[1],o[2]),ki.uDepthStretch.value.set(this.depth.squeeze,this.depth.shift),ki.uLight.value.set(...Kt(Kt(Et(r.right,oa.x),Et(r.up,oa.y)),Et(r.back,oa.z))).normalize(),this.starfield.position.copy(this.camera.position),this.poseFog(e);const a=sn([0,0,0],s);this.star.position.set(a[0],a[1],a[2]);const c=this.centres(e);this.planets.forEach((u,f)=>{const d=c[f],p=jt(t,d);u.update(e,sn(d,s),p?Fi(u.model.radius,p.depth,Gt(t))*(i/2):0)}),this.fleet.pose(this.model,e,Gt(t),i,s),this.crew.pose(this.model,e,s),this.beacons.pose(this.model,e,i,s);const l=fi(e,Ni.starChurn),h=fi(e,Ni.starSpin);this.starMat.uniforms.uChurn.value.set(Math.cos(l),Math.sin(l)),this.starMat.uniforms.uSpin.value.set(Math.cos(h),Math.sin(h)),this.moonlets&&(this.moonlets.position.set(a[0],a[1],a[2]),Pm(this.moonlets,this.model.star.moonlets.map(u=>uu(u,e)),Tr))}dispose(){this.fleet.dispose(),this.crew.dispose(),this.beacons.dispose();for(const e of this.planets)e.dispose();for(const e of this.disposables)e.dispose()}}const nT=.015,Kl=50,iT=8,Zl=3,_d=48,sT=D1.map(n=>n===null?null:[1,3,5].map(e=>parseInt(n.slice(e,e+2),16))),rT=.015,vr=(n,e)=>Nm(n.model.star.radius,e),xd=(n,e)=>Qv(n.model,n.crew.spec,e);class oT{pass;labels;system=null;fogs=new pv;lastFrame=0;reduced=!1;onFog;drones=[];dronesHead=null;layoutHead=null;selectedDrone=null;crewSeats=[];crewHead=null;crewExtra=0;crewCalls=0;selectedPerson=null;selectedName="";beaconView=null;beaconHead=null;coView=null;coHead=null;coIndex=null;focusFile=null;focusSince=0;arrows=[];depthFade=!0;showHelp=!0;showInfo=!0;covered=()=>[];constructor(e,t){this.pass=new q1(e),this.labels=new p_(t)}get model(){return this.system?.model??null}get beacons(){const e=this.system?.model;return e&&this.beaconView&&this.beaconHead===this.layoutHead?Ga(this.beaconView,e):null}get fog(){return this.fogs.fog}get fogChange(){return this.fogs.change}get fogNotice(){return this.fogs.fog?null:this.fogs.mismatch?"the fog and the layout come from different scans":"no fog view"}set reducedMotion(e){this.reduced=e,e&&this.fogs.settle()&&this.pushFog()}fogTicket(){return this.fogs.ticket()}applyFog(e,t){return this.applyWith(e,t,!this.reduced)}applyWith(e,t,i){return this.fogs.apply(e,t,this.system?.fileIds()??[],this.lastFrame,i)?(this.pushFog(),this.onFog?.(this.fogs.fog),!0):!1}pushFog(){this.system?.setFog(this.fogs.fog,this.fogs.events)}async load(e,t=null,i={}){const s=i.ticket??this.fogTicket(),r=i.animate!==!1&&!this.reduced,o=new tT(I0(e));try{o.fleet.set(this.dronesHead===e.source.head?this.drones:[]),o.setCrew(this.crewHead===e.source.head?this.crewSeats:[]),o.beacons.set(this.beaconHead===e.source.head?Ga(this.beaconView,o.model).spots:[]),o.pose(0,Pa(o.model),this.pass.height),this.pass.takeShaderErrors(),o.scene.traverse(l=>{l.visible=!0}),await this.pass.renderer.compileAsync(o.scene,o.camera),this.pass.compileOverlay();for(const l of this.pass.renderer.info.programs??[])l.getUniforms();const c=this.pass.takeShaderErrors();if(c.length>0)throw new At("The view could not compile its shaders.",c)}catch(c){throw o.dispose(),c}this.system?.dispose(),this.system=o,this.layoutHead=e.source.head,this.coIndex=this.coView&&this.coHead===this.layoutHead?id(this.coView,o.model):null;const a=this.fogs.setLayout(e.source.head,r);this.pushFog(),!this.applyWith(t,s,r)&&a&&this.onFog?.(null)}async setDrones(e,t){const i=this.system;if(!i)return this.drones=e,this.dronesHead=t,!0;if(t!==this.layoutHead)return!1;const s=new Gm;try{if(e.length>0){s.set(e),this.pass.takeShaderErrors(),s.group.traverse(o=>{o.visible=!0}),await this.pass.renderer.compileAsync(s.group,i.camera);for(const o of this.pass.renderer.info.programs??[])o.getUniforms();const r=this.pass.takeShaderErrors();if(r.length>0)throw new At("The view could not compile the drone shader.",r)}if(this.system!==i||t!==this.layoutHead)return!1;i.fleet.set(e)}finally{s.dispose()}return this.drones=e,this.dronesHead=t,!0}async setCrew(e,t,i){const s=this.system,r=++this.crewCalls;if(!s)return this.crewSeats=e,this.crewExtra=t,this.crewHead=i,!0;if(i!==this.layoutHead)return!1;const o=new Hm;try{if(e.length>0){o.set(e),o.pose(s.model,this.lastFrame),this.pass.takeShaderErrors(),o.group.traverse(c=>{c.visible=!0}),await this.pass.renderer.compileAsync(o.group,s.camera);for(const c of this.pass.renderer.info.programs??[])c.getUniforms();const a=this.pass.takeShaderErrors();if(a.length>0)throw new At("The view could not compile the crew's ship.",a)}if(this.system!==s||i!==this.layoutHead||r!==this.crewCalls)return!1;s.setCrew(e)}finally{o.dispose()}return this.crewSeats=e,this.crewExtra=t,this.crewHead=i,!0}setBeacons(e,t){const i=this.system;return i&&t!==this.layoutHead?!1:(this.beaconView=e,this.beaconHead=t,i?.beacons.set(Ga(e,i.model).spots),!0)}setCoChange(e,t){const i=this.system;return i&&t!==this.layoutHead?!1:(this.coView=e,this.coHead=t,this.coIndex=i&&e?id(e,i.model):null,!0)}coChangeLines(e){const t=this.system?.model;return t?v1(this.coIndex,t,this.focusOf(e),this.coView?.dismissed??0):[]}arrowAt(e,t){const i=this.pass.canvas.getBoundingClientRect();if(i.width===0||i.height===0)return null;const s=e*(this.pass.canvas.width/i.width),r=t*(this.pass.canvas.height/i.height);return this.arrows.find(o=>s>=o.box.x&&s<o.box.x+o.box.w&&r>=o.box.y&&r<o.box.y+o.box.h)?.body??null}focusOf(e){return p1(this.coIndex,e,this.focusFile)}resize(e,t,i,s){this.pass.resize(e,Math.floor(t*s),Math.floor(i*s),s);const r=this.pass.canvas;this.labels.resize(r.width,r.height,r.style.width,r.style.height,this.pass.scale)}infoEnd(e){const t=this.system?.model;if(!t)return 0;const i=this.labels.px;return 2*i+lc(t,e,this.fogs.fog,this.beacons).length*ac(i)}draw(e,t,i){const s=this.system;if(!s)throw new Error("nothing loaded");ki.uDepthOn.value=this.depthFade,this.lastFrame=e,this.fogs.prune(e)&&this.pushFog(),s.pose(e,t,this.pass.height);const r=this.pass.scale,o=this.labels.px,a=W1({model:s.model,index:this.coIndex,focus:this.focusOf(i),frame:e,pose:t,W:this.pass.width,H:this.pass.height,textW:f=>hs(f)*o/r}),c=this.labelsFor(s,e,t,i,a),l=c.map(f=>{const d=xo(f,o);return{x:d.x/r,y:d.y/r,w:d.w/r,h:d.h/r}}),h=Math.max(0,e-this.focusSince)/zt,u=this.pass.render(s.scene,s.camera,f=>{const d=X1(a,{pixels:f,W:this.pass.width,H:this.pass.height,labels:l,since:h,reduced:this.reduced,frame:e});if(!d)return null;const p=new Uint8Array(d.length*4);return d.forEach((x,m)=>{const g=sT[x];g&&(p.set(g,4*m),p[4*m+3]=255)}),p});return this.labels.draw(c),u}labelsFor(e,t,i,s,r){const o=this.pass.canvas.width,a=this.pass.canvas.height,c=this.labels.px,l=ac(c),{ink:h,accent:u,dim:f}=ht,d=[],p=this.beacons,x=this.covered();this.showInfo&&lc(e.model,s,this.fogs.fog,p).forEach((v,_)=>d.push({text:v,x:2*c,y:2*c+_*l,align:"left",colour:_===0&&s!==null?u:h})),this.showHelp&&d.push({text:S_,x:2*c,y:a-l,align:"left",colour:f}),d.push(...this.clear(this.noteLabels(e,t,i,s,p,a,l),x,o,a));const m=this.droneLabels(e,t,i,o,a,2*c,iT).map(v=>this.clear([v],x,o,a)[0]),g=td(i,e.spheres(t),vr(e,t),o,a,2*c,Kl-d.length-m.length),M=this.coLabels(e,i,r,g,o,a,c,l,x),E=new Set([s,...r.lines.map(v=>v.body)]),y=Kl-d.length-m.length-M.length;g.forEach((v,_)=>{(_<y||E.has(v.i))&&d.push({text:e.model.planets[v.i].path,x:v.x,y:v.y,align:"centre",colour:v.i===s?u:h})});const T=v=>({text:v.text,x:v.x,y:v.y,align:v.align,colour:v.colour});d.push(...M.slice(0,Math.max(0,Kl-d.length-m.length)).map(T),...m),d.push(...this.crewLabels(e,t,i,o,a,c).map(v=>this.clear([v],x,o,a)[0]));const b=this.pass.scale;return this.arrows=r.arrows.map((v,_)=>{const R={x:v.box.x*b,y:v.box.y*b,w:v.box.w*b,h:v.box.h*b},C=M.find(A=>A.arrow===_),L=C?xo(C,c):R,D=Math.min(R.x,L.x),B=Math.min(R.y,L.y);return{body:v.body,box:{x:D-c,y:B-c,w:Math.max(R.x+R.w,L.x+L.w)-D+2*c,h:Math.max(R.y+R.h,L.y+L.h)-B+2*c}}}),d}coLabels(e,t,i,s,r,o,a,c,l){if(!this.coIndex)return[];const{ink:h,dim:u,accent:f}=ht,d=this.pass.scale,p=[],x=y=>{if(y>=0){const b=s.find(v=>v.i===y);return b?{x:b.x,y:b.y+c}:null}const T=jt(t,[0,0,0]);return T?{x:(T.x+1)/2*r,y:(1-T.y)/2*o+Fi(e.model.star.radius,T.depth,Gt(t))*(o/2)+2*a}:null},m=(y,T)=>{y&&T.forEach(([b,v],_)=>p.push({text:b,x:y.x,y:y.y+_*c,align:"centre",colour:v}))},g=i.focus,M=g?.file?this.coIndex.files.get(g.file):void 0;if(g){const y=M&&M.spot?.body===g.planet?[[Xo(M.path),f],...i.named.map(T=>[`with ${Xo(T.path)}`,u])]:[];if(i.tests&&y.push(["tests usually change with this",u]),m(x(g.planet),y),i.byFile)for(const T of i.lines)i.arrows.some(b=>b.body===T.body)||m(x(T.body),T.files.map(b=>[Xo(b.path),u]))}i.arrows.forEach((y,T)=>{const b=i.byFile?`${Xo(y.files[0].path)}${y.files.length>1?` +${y.files.length-1}`:""}`:y.body<0?"the star":e.model.planets[y.body].path,v=hs(b)*a,[_,R,C,L]=[y.box.x*d,y.box.y*d,y.box.w*d,y.box.h*d],D=R+L/2-(c-2*a)/2,B=y.edge==="left"?{x:_+C+2*a,y:D}:y.edge==="right"?{x:_-2*a-v,y:D}:y.edge==="top"?{x:Math.min(Math.max(_+C/2-v/2,2*a),r-v-2*a),y:R+L+2*a}:{x:Math.min(Math.max(_+C/2-v/2,2*a),r-v-2*a),y:R-c};p.push({text:b,x:B.x,y:B.y,align:"left",colour:u,arrow:T})});const E=[];for(const y of i.flags){if(!y.show)continue;const T=(y.box.y+y.box.h/2)*d,b=T-y.text.length*c/2+a,v=y.text.map((D,B)=>{const A=y.right?(y.box.x+y.box.w+2)*d:(y.box.x-2)*d-hs(D)*a;return{text:D,x:A,y:b+B*c,align:"left",colour:B%2===0&&B<y.text.length-y.text.length%2?h:u}}),_=this.clear(v,[...l,...E],r,o),R=_.map(D=>xo(D,a)),C=Math.min(...R.map(D=>D.x)),L=Math.min(...R.map(D=>D.y));E.push({x:C,y:L,w:Math.max(...R.map(D=>D.x+D.w))-C,h:Math.max(...R.map(D=>D.y+D.h))-L}),p.push(..._)}return p}noteLabels(e,t,i,s,r,o,a){const c=Sp(r,s),l=r?.spots.find(m=>m.planet===(s??-1));if(c.length===0||!l)return[];const h=Pd(e.model,l,t),u=jt(i,h.centre);if(!u)return[];const f=(u.x+1)/2*this.pass.canvas.width,d=(1-u.y)/2*o-Fi(h.radius,u.depth,Gt(i))*(o/2)-(Aa.gap+Aa.size+1)*this.pass.scale,p=m=>[...m].length>_d?`${[...m].slice(0,_d-3).join("")}...`:m,x=c.slice(0,Zl).map(p);return c.length>Zl&&x.push(`+${c.length-Zl} more`),x.map((m,g)=>({text:m,x:f,y:d-(g+1)*a,align:"centre",colour:g===0?ht.ink:ht.dim}))}clear(e,t,i,s){if(e.length===0)return e;const r=this.labels.px,o=e.map(f=>xo(f,r)),a=Math.min(...o.map(f=>f.x)),c=Math.min(...o.map(f=>f.y)),l={x:a,y:c,w:Math.max(...o.map(f=>f.x+f.w))-a,h:Math.max(...o.map(f=>f.y+f.h))-c},{dx:h,dy:u}=h1(l,t,i,s,2*r);return e.map(f=>({...f,x:f.x+h,y:f.y+u}))}droneLabels(e,t,i,s,r,o,a){const c=e.fleet.entries;if(!c.some(p=>p.label!==null||p.key===this.selectedDrone))return[];const l=e.fleet.spheres(e.model,t),h=c.flatMap((p,x)=>l[x]&&(p.label!==null||p.key===this.selectedDrone)?[x]:[]),u=h.map(p=>l[p]),f=[...e.spheres(t),...vr(e,t)],d=p=>c[h[p.i]].key===this.selectedDrone;return Ug(td(i,u,f,s,r,o,u.length),d,a).map(p=>{const x=c[h[p.i]],m=x.key===this.selectedDrone;return{text:m?x.selectedLabel:x.label,x:p.x,y:p.y,align:"centre",colour:m?ht.accent:ht.ink}})}crewLabels(e,t,i,s,r,o){const a=e.crew.spec;if(!a)return[];const c=ms(e.model,t),l=vi(t)*gi,h=[],u=(p,x,m,g)=>{const M=jt(i,p);if(!M)return;const E=Fi(x,M.depth,Gt(i))*(r/2);h.push({text:m,x:(M.x+1)/2*s,y:(1-M.y)/2*r+E+2*o,align:"centre",colour:g})},f=e.crew.riders.find(p=>p.rider.person===this.selectedPerson);if(f&&this.selectedName){const p=rc(a,c,l)[f.seat];p&&u(p.centre,p.radius,this.selectedName,ht.accent)}const d=this.crewExtra>0?Jv(e.model,a,t,i,s,r):null;return d&&h.push({text:`+${this.crewExtra} crew`,x:d.x,y:d.y+2*o,align:"centre",colour:ht.ink}),h}homePose(e=0){const t=this.system;return t?vg(t.model,e,mp(t.model,t.crew.spec)):null}get crewSpec(){return this.system?.crew.spec??null}crewSeat(e){return this.system?.crew.riders.find(t=>t.rider.person===e)?.seat??null}pickCrewAt(e,t,i,s){const r=this.system,o=r?.crew.spec;if(!r||!o||r.crew.riders.length===0)return null;const a=this.pass.canvas.getBoundingClientRect(),c={x:e/a.width*2-1,y:1-t/a.height*2},l=rc(o,ms(r.model,s),vi(s)*gi),h=Gi(i),u=r.crew.riders.filter(p=>{const x=l[p.seat];return x!==void 0&&Yt(x.normal,sn(h,x.centre))>0}),f=u.map(p=>({centre:l[p.seat].centre,radius:l[p.seat].radius})),d=Cr(i,c,f,[...vr(r,s),...r.spheres(s),...r.smallBodies(s)],rT);return d===null?null:u[d].rider.person}pickAt(e,t,i,s){const r=this.system;if(!r)return null;const o=this.pass.canvas.getBoundingClientRect(),a={x:e/o.width*2-1,y:1-t/o.height*2};return Cr(i,a,r.spheres(s),[...vr(r,s),...xd(r,s)])}pickDroneAt(e,t,i,s){const r=this.system;if(!r||r.fleet.entries.length===0)return null;const o=this.pass.canvas.getBoundingClientRect(),a={x:e/o.width*2-1,y:1-t/o.height*2},c=r.fleet.spheres(r.model,s),l=c.flatMap((u,f)=>u?[f]:[]),h=Cr(i,a,l.map(u=>c[u]),[...vr(r,s),...r.spheres(s),...r.smallBodies(s),...xd(r,s)],nT);return h===null?null:r.fleet.entries[l[h]].key}focusTarget(e,t){return this.system?.spheres(t)[e]??null}pixels(){return this.pass.pixels()}}const aT=.8;class lT extends oT{homePose(e=0){const t=super.homePose(e);return t&&{...t,dist:t.dist*aT}}}const cT=()=>({w:innerWidth,h:innerHeight,dpr:devicePixelRatio||1}),hT=n=>n instanceof At?n:new At("The demo hit an internal error.",[n instanceof Error?n.message:String(n)]);async function uT(n){const e=c=>c.then(l=>l,()=>null),[t,i,s,r,o,a]=await Promise.all([n.layout(),e(n.fog()),e(n.drones()),e(n.crew()),e(n.beacons()),e(n.cochange())]);return{layout:t,fog:i,drones:s,crew:r,beacons:o,cochange:a}}async function fT(){Qc();const n=s1(),e=new Q_;let t;try{t=new lT(We("view"),We("labels"))}catch(f){We("demo-title").hidden=!0,e.error("The demo could not start.",[`WebGL 2 isn't available in this browser, so the 3D view can't run (${f instanceof Error?f.message:String(f)}).`]);return}let i;try{i=ox(await rx("/qodo-2026/data/",location.origin))}catch(f){We("demo-title").hidden=!0,e.error("The demo data could not load.",[f instanceof Error?f.message:String(f)]);return}t.showInfo=!1;const s=zg(t,cT);let r=null;const o=async()=>{r&&(await s.load(r),await s.renderFrame(0))};try{r=await uT(i),await s.ready,await o()}catch(f){const d=hT(f);We("demo-title").hidden=!0,e.error(d.title,d.detail);return}let a=Promise.resolve();const c=()=>{a=a.then(o,o)};addEventListener("resize",c),await n,removeEventListener("resize",c),await a.catch(()=>{}),r=null,t.showHelp=!0,t.showInfo=!0,We("stage").inert=!1;const l=new a1;l.release=()=>t.pass.canvas.focus({preventScroll:!0});let h=devicePixelRatio||1;addEventListener("resize",()=>{(devicePixelRatio||1)!==h&&(h=devicePixelRatio||1,Qc(),l.rescale())}),e.show();const u=We("hud");new ResizeObserver(()=>document.documentElement.style.setProperty("--hud-bottom",`${Math.ceil(u.getBoundingClientRect().bottom)}px`)).observe(u),l1(),await J_(t,e,i),l.open()}fT();
