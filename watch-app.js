
(async()=>{
const THREE=WatchEngine.THREE;
const $=id=>document.getElementById(id),PI=Math.PI,V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const mobileQuery=matchMedia('(max-width:820px)');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let IS_MOBILE=mobileQuery.matches;
const deviceMemory=navigator.deviceMemory||8;
const LOW_POWER=IS_MOBILE&&(deviceMemory<=4||(navigator.hardwareConcurrency||8)<=4);
const yieldForAssembly=async label=>{
 const status=$('loadStatus');if(status)status.textContent=label;
 if(globalThis.scheduler?.yield)await globalThis.scheduler.yield();
 else await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)))
};

/* ---------- renderer / scene ---------- */
const renderer=new THREE.WebGLRenderer({antialias:!LOW_POWER,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,LOW_POWER?.82:IS_MOBILE?1:1.5));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LOW_POWER?.92:1.0;renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.shadowMap.enabled=!IS_MOBILE;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
$('app').appendChild(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(IS_MOBILE?42:32,innerWidth/innerHeight,.1,100);
camera.position.set(4.2,-2.6,8.6).setLength(IS_MOBILE?14.6:11.2);
let rafId=0,needsRender=true,labelsDirty=true;
function invalidate(){needsRender=true;if(!rafId)rafId=requestAnimationFrame(renderFrame)}
const controls=new WatchEngine.OrbitControls(camera,renderer.domElement);
Object.assign(controls,{enableDamping:true,dampingFactor:.07,minDistance:2,maxDistance:26,autoRotateSpeed:3.6,enablePan:false,rotateSpeed:.85,zoomSpeed:.9,minPolarAngle:.06,maxPolarAngle:PI-.06});
controls.addEventListener('start',()=>fly=null);
controls.addEventListener('change',()=>{labelsDirty=true;invalidate()});
await yieldForAssembly('Preparing studio lighting');
/* Studio environment: dark room with softbox strips -> crisp, sweeping reflections on metal */
try{
  const pm=new THREE.PMREMGenerator(renderer),es=new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(40,LOW_POWER?16:32,LOW_POWER?8:16),new THREE.MeshBasicMaterial({color:0x08090c,side:THREE.BackSide})));
  const sb=(w,h,p,c,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(i*.3),side:THREE.DoubleSide,toneMapped:false}));m.position.set(...p);m.lookAt(0,0,0);es.add(m)};
  sb(18,7,[0,15,6],0xfff4e0,5);      // overhead softbox
  sb(2.5,18,[-15,2,5],0xffe6c4,8);   // warm left strip
  sb(2.5,18,[15,-1,4],0xcfe0ff,7);   // cool right strip
  sb(14,2.2,[0,-11,12],0xffffff,4);  // low front fill
  sb(5,5,[8,10,13],0xffffff,10);     // hot spot for glints
  sb(12,8,[0,3,-16],0xffeedd,4);     // rear softbox
  sb(3,13,[-10,-5,-12],0xcde0ff,6);sb(3,13,[10,8,-11],0xfff0dd,6);
  scene.environment=pm.fromScene(es,.035).texture;
  const bc=document.createElement('canvas');bc.width=bc.height=512;const bg=bc.getContext('2d'),gr=bg.createRadialGradient(256,215,16,256,215,380);
  gr.addColorStop(0,'#2b4059');gr.addColorStop(.38,'#17283d');gr.addColorStop(.72,'#0b1420');gr.addColorStop(1,'#05080d');bg.fillStyle=gr;bg.fillRect(0,0,512,512);
  const bt=new THREE.CanvasTexture(bc);bt.colorSpace=THREE.SRGBColorSpace;scene.background=bt;
}catch(e){console.warn('Studio environment failed',e)}
await yieldForAssembly('Preparing the watch movement');
/* Post-processing is intentionally deferred until after the first plain frame. */
let composer=null,film=null,bloomPass=null,postReady=false;
function setupPostProcessing(){
 if(postReady||LOW_POWER||IS_MOBILE)return;
 postReady=true;
 try{
   const {EffectComposer,RenderPass,UnrealBloomPass,OutputPass,ShaderPass}=WatchEngine;
   const pr=renderer.getPixelRatio();
   const rt=new THREE.WebGLRenderTarget(innerWidth*pr,innerHeight*pr,{type:THREE.HalfFloatType,samples:IS_MOBILE?2:4});
   composer=new EffectComposer(renderer,rt);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);
   composer.addPass(new RenderPass(scene,camera));
   bloomPass=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),IS_MOBILE?.12:.25,.4,IS_MOBILE?.43:.38);
   composer.addPass(bloomPass);composer.addPass(new OutputPass());
   const FilmShader={uniforms:{tDiffuse:{value:null},time:{value:0},vig:{value:.32},grain:{value:reduceMotion?.012:IS_MOBILE?.02:.035}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform sampler2D tDiffuse;uniform float time,vig,grain;varying vec2 vUv;float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){vec4 c=texture2D(tDiffuse,vUv);float d=length((vUv-.5)*vec2(1.,.9))*1.35;c.rgb*=1.-vig*smoothstep(.3,1.,d);float n=h(gl_FragCoord.xy+fract(time)*vec2(97.,53.))-.5;c.rgb+=n*grain;gl_FragColor=vec4(c.rgb,1.);}'};
   film=new ShaderPass(FilmShader);composer.addPass(film)
 }catch(e){console.warn('Bloom unavailable, keeping direct rendering',e);composer=null;film=null;bloomPass=null}
 invalidate()
}
const key=new THREE.DirectionalLight(0xfff1dc,.51);key.position.set(4,5,9);key.castShadow=true;
key.shadow.mapSize.set(LOW_POWER?768:IS_MOBILE?1024:2048,LOW_POWER?768:IS_MOBILE?1024:2048);key.shadow.bias=-.0004;key.shadow.normalBias=.02;
Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:30});
const rimL=new THREE.DirectionalLight(0xa9c7ff,.27);rimL.position.set(-5,-3,-9);
const fillL=new THREE.DirectionalLight(0xffffff,.15);fillL.position.set(-5,4,5);

// Dedicated illumination for the movement viewed through the exhibition back.
// These lights sit on the rear (negative-Z) side, so the reverse of the
// bridges, winding train and rotor remain readable in the Back camera view.
const rearKey=new THREE.DirectionalLight(0xffedcf,.5);
rearKey.position.set(1.5,6,-8);
rearKey.castShadow=false;
const rearFill=new THREE.DirectionalLight(0xb9d5ff,.26);
rearFill.position.set(-6,-1,-5);
rearFill.castShadow=false;
const softAmbient=new THREE.HemisphereLight(0xdce8f7,0x343b47,.13);
scene.add(key,rimL,fillL,rearKey,rearFill,softAmbient);

/* ---------- textures ---------- */
const cv=(n,f)=>{const c=document.createElement('canvas');c.width=c.height=n;f(c.getContext('2d'),n);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t};
const dialTex=cv(IS_MOBILE?512:1024,(g,n)=>{const c=n/2,R=r=>r/2*c;
 const gr=g.createRadialGradient(c,c,R(1.55),c,c,R(2));gr.addColorStop(0,'#162845');gr.addColorStop(.55,'#2a4a78');gr.addColorStop(1,'#14233a');
 g.fillStyle=gr;g.beginPath();g.arc(c,c,R(2),0,2*PI);g.moveTo(c+R(1.55),c);g.arc(c,c,R(1.55),0,2*PI,true);g.fill('evenodd');
 for(let i=0;i<720;i++){g.save();g.translate(c,c);g.rotate(i*PI/360);g.fillStyle=i%2?'rgba(255,255,255,.045)':'rgba(0,0,0,.10)';g.fillRect(-.6,-R(1.99),1.2,R(.44));g.restore()}
 for(let i=0;i<60;i++){g.save();g.translate(c,c);g.rotate(i*PI/30);g.fillStyle='#d8cfb8';const big=i%5==0;g.fillRect(-(big?2.2:1),-R(1.97),big?4.4:2,R(big?.1:.06));g.restore()}
 g.strokeStyle='rgba(230,192,123,.7)';g.lineWidth=2;g.beginPath();g.arc(c,c,R(1.9),0,2*PI);g.stroke();
 g.fillStyle='#e9e1cc';g.textAlign='center';g.font=`600 ${R(.075)}px "Helvetica Neue",Arial,sans-serif`;
 g.fillText('MECHANICA',c,c-R(1.63));g.font=`${R(.048)}px Arial`;g.fillText('SWISS MADE',c,c+R(1.66)+8)});
const plateTex=cv(IS_MOBILE?256:512,(g,n)=>{g.fillStyle='#262b32';g.fillRect(0,0,n,n);for(let y=0;y<n+20;y+=20)for(let x=0;x<n+20;x+=20){const ox=(y/20)%2?10:0;
 const r=g.createRadialGradient(x+ox,y,2,x+ox,y,13);r.addColorStop(0,'rgba(255,255,255,.14)');r.addColorStop(1,'rgba(0,0,0,.28)');g.fillStyle=r;g.beginPath();g.arc(x+ox,y,12,0,2*PI);g.fill()}});
const stripes=cv(IS_MOBILE?128:256,(g,n)=>{for(let x=0;x<n;x+=16){const gr=g.createLinearGradient(x,0,x+16,0);gr.addColorStop(0,'#777');gr.addColorStop(.5,'#fff');gr.addColorStop(1,'#777');g.fillStyle=gr;g.fillRect(x,0,16,n)}});
stripes.wrapS=stripes.wrapT=THREE.RepeatWrapping;

/* ---------- materials ---------- */
const M=(c,m,r,o={})=>new THREE.MeshPhysicalMaterial({color:c,metalness:m,roughness:r,...o});
const steel=M(0xe4e9ef,1,.08),brushed=M(0xbfc7d1,1,.3),gun=M(0x3b4048,1,.3,{clearcoat:.3}),gold=M(0xd6a94f,1,.16),goldS=M(0xc9963a,1,.25),
 blue=M(0x1e4a8a,1,.12),ruby=M(0xc8213c,0,.04,{clearcoat:1,emissive:0x5a0010,emissiveIntensity:.8}),leather=M(0x17110d,0,.55,{clearcoat:.3}),
 cdg=m=>{const c=m.clone();c.map=stripes;return c},
 glass=M(0xdfeaf5,0,0,{transparent:true,opacity:.1,clearcoat:1,envMapIntensity:2.2,depthWrite:false,side:THREE.DoubleSide});

const glowG=M(0xd6a94f,1,.16,{emissive:0xd9a441,emissiveIntensity:.55}),glowS=M(0xc9963a,1,.25,{emissive:0xd9a441,emissiveIntensity:.5}),glowB=M(0x1e4a8a,1,.12,{emissive:0x3a72d8,emissiveIntensity:.45});
await yieldForAssembly('Cutting the plate and gear train');
/* ---------- registry ---------- */
const watch=new THREE.Group();scene.add(watch);const parts={};
const SHADOW_PARTS=new Set(['caseMid','bezel','caseBack','lugs','crown','mainplate','bridge','barrel','balance','rotor']);
function reg(k,o,p,ex=V()){o.position.copy(p);o.userData.ex=ex;o.userData.p0=p.clone();
 o.traverse(m=>{if(m.isMesh){m.userData.key=k;m.castShadow=SHADOW_PARTS.has(k);m.receiveShadow=true}});watch.add(o);(parts[k]||=[]).push(o);return o}
const cyl=(r,h,m,s=32)=>{const x=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,s),m);x.rotation.x=PI/2;return x};
const ext=(s,d,m,b=.01)=>new THREE.Mesh(new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:b,bevelThickness:b,bevelSegments:LOW_POWER?1:2,curveSegments:IS_MOBILE?10:16}),m);
const lathe=(pts,m)=>{const g=new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),IS_MOBILE?72:128);g.rotateX(PI/2);const x=new THREE.Mesh(g,m);m.side=THREE.DoubleSide;return x};
const slot=(r1,r2,b0,b1)=>{const h=new THREE.Path();h.absarc(0,0,r2,b0,b1,false);h.absarc(0,0,r1,b1,b0,true);h.closePath();return h};

function gear(r,n,th,mat,sp=5,hub=.07){
 const s=new THREE.Shape(),ri=r*.9,a=PI*2/n;
 for(let i=0;i<n;i++)[[0,ri],[.15,r],[.45,r],[.62,ri]].forEach(([f,q],j)=>{const t=(i+f)*a,x=Math.cos(t)*q,y=Math.sin(t)*q;i+j?s.lineTo(x,y):s.moveTo(x,y)});
 s.closePath();
 for(let i=0;i<sp;i++){const h=new THREE.Path(),b0=i/sp*2*PI+.16,b1=(i+1)/sp*2*PI-.16;h.absarc(0,0,r*.76,b0,b1,false);h.absarc(0,0,hub*2.2,b1,b0,true);h.closePath();s.holes.push(h)}
 const m=ext(s,th,mat,.006);m.position.z=-th/2;const g=new THREE.Group();g.add(m,cyl(hub,th*3,steel,16));return g}
function arm(p,q,w,mat,th=.07){const d=q.clone().sub(p),L=d.length(),r=w/2,s=new THREE.Shape();
 s.absarc(0,0,r,PI/2,PI*1.5,false);s.absarc(L,0,r,-PI/2,PI/2,false);s.closePath();
 const m=ext(s,th,mat,.012);m.position.set(p.x,p.y,0);m.rotation.z=Math.atan2(d.y,d.x);const g=new THREE.Group();g.add(m);return g}
function spiral(r0,r1,turns,tube,mat,n=240){if(IS_MOBILE)n=Math.min(n,LOW_POWER?132:176);const pts=[];for(let i=0;i<=n;i++){const t=i/n,a=t*turns*2*PI,r=r0+(r1-r0)*t;pts.push(V(Math.cos(a)*r,Math.sin(a)*r,0))}
 return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),IS_MOBILE?n:n*2,tube,IS_MOBILE?4:6,false),mat)}
const at=(m,x,y,z)=>(m.position.set(x,y,z),m);
function instances(geometry,material,count,place){
 const mesh=new THREE.InstancedMesh(geometry,material,count),dummy=new THREE.Object3D();
 for(let i=0;i<count;i++){dummy.position.set(0,0,0);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);place(dummy,i);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix)}
 mesh.instanceMatrix.needsUpdate=true;return mesh
}
const jewelG=new THREE.Group(),screwG=new THREE.Group(),jewelData=[],screwData=[];
function jewel(x,y,z){jewelData.push([x,y,z])}
function screw(x,y,z){screwData.push([x,y,z])}
function buildSmallInstances(){
 const jc=new THREE.CylinderGeometry(.05,.05,.03,20);jc.rotateX(PI/2);
 jewelG.add(instances(jc,ruby,jewelData.length,(o,i)=>o.position.set(...jewelData[i])));
 jewelG.add(instances(new THREE.TorusGeometry(.058,.011,8,24),gold,jewelData.length,(o,i)=>o.position.set(...jewelData[i])));
 const sc=new THREE.CylinderGeometry(.045,.045,.025,20);sc.rotateX(PI/2);
 screwG.add(instances(sc,blue,screwData.length,(o,i)=>o.position.set(...screwData[i])));
 screwG.add(instances(new THREE.BoxGeometry(.07,.008,.008),gun,screwData.length,(o,i)=>{o.position.set(...screwData[i]);o.position.z+=.014;o.rotation.z=screwData[i][0]*9}))
}

/* ---------- layout ---------- */
const P={barrel:V(-.72,.5),center:V(0,0),third:V(.55,.45),fourth:V(.8,-.1),esc:V(.62,-.5),pal:V(.2,-.8),bal:V(-.45,-.95)};
const ZF=.32,ZR=-.3;

const plate=cyl(2,.08,[gun,M(0xffffff,.9,.35,{map:plateTex}),M(0xffffff,.9,.35,{map:plateTex})],96);
reg('mainplate',plate,V());

const barrel=gear(.52,62,.12,gold,0,.06);const sp0=spiral(.08,.42,6,.012,steel);sp0.position.z=.075;barrel.add(sp0,at(new THREE.Mesh(new THREE.TorusGeometry(.5,.02,10,64),gold),0,0,.06));
reg('barrel',barrel,V(P.barrel.x,P.barrel.y,.12),V(0,0,.5));
parts.mainspring=[barrel.children[2]];barrel.children[2].userData.key='mainspring';
const cw=gear(.4,48,.05,gold,5,.07);const can=cyl(.07,.55,gold,24);can.position.z=.25;cw.add(can);
reg('centerWheel',cw,V(0,0,.17),V(0,0,.7));
const tw=gear(.334,40,.05,gold,4,.05);reg('thirdWheel',tw,V(P.third.x,P.third.y,.17),V(0,0,.7));
const fw=gear(.267,32,.045,brushed,4,.05);reg('fourthWheel',fw,V(P.fourth.x,P.fourth.y,.19),V(0,0,.7));
const ew=gear(.14,15,.04,steel,0,.04);reg('escapeWheel',ew,V(P.esc.x,P.esc.y,.21),V(0,0,.7));

const pal=new THREE.Group();
[[.145,.104,.356,.624],[.135,.178,.446,.92],[-.28,-.06,.6,.2]].forEach(([x,y,l,a])=>{const b=new THREE.Mesh(new THREE.BoxGeometry(l,.045,.035),steel);b.position.set(x,y,0);b.rotation.z=a;pal.add(b)});
[[.289,.208],[.27,.355]].forEach(([x,y])=>{const r=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.04),ruby);r.position.set(x,y,0);pal.add(r)});
pal.add(cyl(.05,.05,steel,16));reg('palletFork',pal,V(P.pal.x,P.pal.y,.23),V(0,0,.9));

const bal=new THREE.Group();bal.add(new THREE.Mesh(new THREE.TorusGeometry(.5,.032,16,96),steel),cyl(.06,.06,steel,24));
for(let i=0;i<3;i++){const s=new THREE.Mesh(new THREE.BoxGeometry(1,.03,.025),steel);s.rotation.z=i*PI/3+.3;bal.add(s)}
const weightGeo=new THREE.CylinderGeometry(.032,.032,.05,12);weightGeo.rotateX(PI/2);
bal.add(instances(weightGeo,gold,8,(o,i)=>{const a=i*PI/4;o.position.set(Math.cos(a)*.5,Math.sin(a)*.5,0)}));
const roller=cyl(.13,.025,steel,32);roller.position.z=-.03;bal.add(roller);
const hair=spiral(.07,.34,5.5,.007,blue,300);hair.position.z=.035;bal.add(hair);
reg('balance',bal,V(P.bal.x,P.bal.y,.25),V(0,0,.95));hair.userData.key='hairspring';parts.hairspring=[hair];

const br=new THREE.Group(),A=(a,b,w=.2)=>{const g=arm(a,b,w,cdg(brushed));br.add(g);jewel(a.x,a.y,ZF+.1);screw(b.x,b.y,ZF+.095)};
A(P.barrel,P.center);A(P.center,P.third);A(P.third,P.fourth);A(P.fourth,P.esc,.18);A(P.esc,P.pal,.18);A(P.bal,V(-1.28,-.35),.22);
jewel(P.bal.x,P.bal.y,ZF+.1);screw(-1.2,.2,ZF+.095);screw(.3,.9,ZF+.095);
buildSmallInstances();
reg('bridge',br,V(0,0,ZF),V(0,0,1.2));reg('jewels',jewelG,V(),V(0,0,1.45));reg('screws',screwG,V(),V(0,0,1.45));

await yieldForAssembly('Applying the dial and hands');
const dial=new THREE.Mesh(new THREE.RingGeometry(1.55,2,IS_MOBILE?80:128),M(0xffffff,.35,.42,{map:dialTex,clearcoat:.6,side:THREE.DoubleSide}));
const dg=new THREE.Group();dg.add(dial);const dr=new THREE.Mesh(new THREE.TorusGeometry(1.555,.02,10,128),gold);dg.add(dr);
reg('dial',dg,V(0,0,.42),V(0,0,1.8));
const idx=new THREE.Group(),idxData=[];
for(let i=0;i<12;i++){const a=i*PI/6,ofs=i==0?[-.045,.045]:[0];ofs.forEach(o=>idxData.push([a,o,i==0,i==0?.04:.075]))}
idx.add(instances(new THREE.BoxGeometry(1,1,1),glowG,idxData.length,(o,i)=>{
 const [a,offset,double,width]=idxData[i];o.position.set(Math.sin(a)*1.78+Math.cos(a)*offset,Math.cos(a)*1.78-Math.sin(a)*offset,0);
 o.rotation.z=-a;o.scale.set(width,.2,.035)
}));
reg('indices',idx,V(0,0,.46),V(0,0,2));

function hand(L,w,tail){const g=new THREE.Group();[-1,1].forEach((sd,i)=>{const s=new THREE.Shape();s.moveTo(0,-tail);s.lineTo(sd*w,0);s.lineTo(0,L);s.closePath();g.add(ext(s,.03,i?glowS:glowG,.006))});g.add(cyl(.07,.07,gold,24));return g}
const hH=hand(1.05,.09,.2),hM=hand(1.62,.075,.22);
const hS=new THREE.Group();hS.add(at(new THREE.Mesh(new THREE.BoxGeometry(.022,1.85,.014),glowB),0,.65,0),
 at(new THREE.Mesh(new THREE.BoxGeometry(.022,.4,.014),glowB),0,-.2,0),
 at(cyl(.06,.014,blue,24),0,-.32,0),cyl(.045,.08,gold,16));
reg('hour',hH,V(0,0,.56),V(0,0,2.4));reg('minute',hM,V(0,0,.62),V(0,0,2.8));reg('second',hS,V(0,0,.68),V(0,0,3.2));

await yieldForAssembly('Assembling the automatic winding train');
const rat=gear(.417,50,.05,steel,5,.06);reg('ratchet',rat,V(P.barrel.x,P.barrel.y,-.15),V(0,0,-.5));
const clk=new THREE.Group();clk.add(at(new THREE.Mesh(new THREE.BoxGeometry(.4,.06,.04),gold),.2,0,0),cyl(.05,.05,blue,16));
reg('click',clk,V(-1.28,.12,-.15),V(0,0,-.6));
const crw=gear(.3,36,.05,gold,4,.05);reg('crownWheel',crw,V(-.3,1.05,-.15),V(0,0,-.5));
const red=gear(.3,36,.05,gold,4,.05);reg('reducer',red,V(-.5,-.15,-.15),V(0,0,-.7));
const rv1=gear(.27,32,.05,steel,3,.05),rv2=gear(.27,32,.05,steel,3,.05);
reg('reverser',rv1,V(.28,.4,-.15),V(0,0,-.7));reg('reverser',rv2,V(.45,-.2,-.15),V(0,0,-.7));
const rb=new THREE.Group();[[V(),V(.28,.4)],[V(),V(.45,-.2)],[V(),V(-.5,-.15)],[V(-.72,.5),V(-.3,1.05)]].forEach(([a,b])=>rb.add(arm(a,b,.22,cdg(brushed),.06)));
reg('rearBridge',rb,V(0,0,ZR-.04),V(0,0,-1.15));
const brg=new THREE.Group();brg.add(new THREE.Mesh(new THREE.TorusGeometry(.2,.04,12,48),steel),cyl(.1,.07,gold,24));
for(let i=0;i<10;i++){const a=i*PI/5,b=new THREE.Mesh(new THREE.SphereGeometry(.03,10,8),brushed);b.position.set(Math.cos(a)*.2,Math.sin(a)*.2,0);brg.add(b)}
reg('bearing',brg,V(0,0,-.4),V(0,0,-1.5));
const rs=new THREE.Shape();rs.absarc(0,0,1.85,.15,PI-.15,false);rs.lineTo(0,0);rs.closePath();
rs.holes.push(slot(.8,1.35,.45,1.2),slot(.8,1.35,1.5,2.25),slot(1.5,1.7,.45,2.7));
const rot=ext(rs,.07,cdg(gold),.02);const rotG=new THREE.Group();const rp=gear(.25,30,.05,brushed,3,.05);rp.position.z=.37;rotG.add(rot,cyl(.16,.1,steel,32),rp);
reg('rotor',rotG,V(0,0,-.52),V(0,0,-2));

await yieldForAssembly('Fitting the case and strap');
reg('caseMid',lathe([[2.05,-.55],[2.38,-.55],[2.44,-.48],[2.44,.4],[2.4,.5],[2.05,.5]],gun),V());
reg('bezel',lathe([[2,.5],[2.48,.5],[2.52,.55],[2.5,.66],[2.2,.72],[2.04,.68],[2,.6]],steel),V(),V(0,0,3.6));
const R=10,th=Math.asin(2.05/R),dome=new THREE.SphereGeometry(R,IS_MOBILE?48:64,IS_MOBILE?10:16,0,2*PI,0,th);dome.rotateX(PI/2);
const crys=new THREE.Mesh(dome,glass);reg('crystal',crys,V(0,0,.7-R*Math.cos(th)),V(0,0,4.2));crys.castShadow=false;
const cb=lathe([[2,-.55],[2.42,-.55],[2.32,-.8],[2.02,-.82],[2,-.7]],gun);const cbg=new THREE.Group();cbg.add(cb);
const caseScrewGeo=new THREE.CylinderGeometry(.055,.055,.03,16);caseScrewGeo.rotateX(PI/2);
cbg.add(instances(caseScrewGeo,steel,8,(o,i)=>{const a=i*PI/4;o.position.set(Math.cos(a)*2.2,Math.sin(a)*2.2,-.82)}));
reg('caseBack',cbg,V(),V(0,0,-2.7));
const bgl=cyl(2.03,.04,glass,96);reg('backGlass',bgl,V(0,0,-.72),V(0,0,-3.4));bgl.castShadow=false;
const crown=new THREE.Group();const cr=cyl(.3,.4,steel,32);cr.rotation.set(0,0,PI/2);crown.add(cr);
crown.add(instances(new THREE.BoxGeometry(.4,.06,.06),gun,20,(o,i)=>{const a=i*PI/10;o.position.set(0,Math.cos(a)*.3,Math.sin(a)*.3);o.rotation.x=a}));
reg('crown',crown,V(2.66,0,.0),V(1.3,0,0));
const lug=new THREE.Group();const rr=(w,h,r)=>{const s=new THREE.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s};
const lugPairs=[[-1,1],[1,1],[-1,-1],[1,-1]],lugGeo=ext(rr(.5,1,.15),.4,gun,.04).geometry;
lug.add(instances(lugGeo,gun,4,(o,i)=>{const [sx,sy]=lugPairs[i];o.position.set(sx*1.45,sy*2.6,-.25);o.rotation.x=-sy*.12}));
const barGeo=new THREE.CylinderGeometry(.04,.04,2.4,12);barGeo.rotateZ(PI/2);
lug.add(instances(barGeo,steel,2,(o,i)=>{const sy=i? -1:1;o.position.set(0,sy*2.95,-.05)}));
lug.add(instances(new THREE.BoxGeometry(2.4,2.2,.2),leather,2,(o,i)=>{const sy=i? -1:1;o.position.set(0,sy*4,-.4);o.rotation.x=sy*.26}));
reg('lugs',lug,V());

await yieldForAssembly('Checking the assembled movement');
/* ---------- deferred geometry batching ---------- */
let batchingPromise=null;
function materialBatchKey(m){
 if(!m||Array.isArray(m))return null;
 return [m.type,m.color?.getHex(),m.metalness,m.roughness,m.map?.uuid,m.emissive?.getHex(),m.emissiveIntensity,m.transparent,m.opacity,m.alphaTest,m.side,m.clearcoat,m.envMapIntensity,m.depthWrite].join('|')
}
function normaliseBatchGeometry(mesh,inverseRoot){
 let g=mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot,mesh.matrixWorld));
 if(g.index)g=g.toNonIndexed();
 if(!g.getAttribute('normal'))g.computeVertexNormals();
 if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
 for(const name of Object.keys(g.attributes))if(!['position','normal','uv'].includes(name))g.deleteAttribute(name);
 g.clearGroups();return g
}
async function optimiseGeometry(){
 if(batchingPromise)return batchingPromise;
 batchingPromise=(async()=>{
  try{
   const {mergeGeometries}=WatchEngine;
   const processed=new Set();
   for(const key of Object.keys(parts)){
    for(const root of parts[key]){
     if(processed.has(root)||!root.isGroup)continue;
     processed.add(root);root.updateWorldMatrix(true,true);
     const inverseRoot=root.matrixWorld.clone().invert(),sources=[];
     root.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh&&!Array.isArray(o.material)&&o.userData.key===key)sources.push(o)});
     if(sources.length<2)continue;
     const groups=new Map();
     for(const mesh of sources){
      const signature=materialBatchKey(mesh.material);if(!signature)continue;
      if(!groups.has(signature))groups.set(signature,[]);groups.get(signature).push(mesh)
     }
     for(const [signature,batch] of groups){
      if(batch.length<2)continue;
      const geometries=batch.map(mesh=>normaliseBatchGeometry(mesh,inverseRoot));
      const merged=mergeGeometries(geometries,false);
      if(!merged)continue;
      const mesh=new THREE.Mesh(merged,batch[0].material);
      mesh.userData.key=key;mesh.castShadow=batch.some(m=>m.castShadow);mesh.receiveShadow=batch.some(m=>m.receiveShadow);
      batch.forEach(m=>m.parent?.remove(m));root.add(mesh)
     }
    }
   }
   hov.length=0;watch.traverse(m=>{if(m.isMesh&&!['crystal','backGlass'].includes(m.userData.key))hov.push(m)});
   renderer.shadowMap.needsUpdate=true;
   labelsDirty=true;invalidate();
   window.__watchRenderStats=watchMeshes()
  }catch(e){console.warn('Geometry batching skipped',e)}
 })();
 return batchingPromise
}
function watchMeshes(){
 let meshes=0,instances=0,draws=0;
 watch.traverse(o=>{if(o.isMesh){meshes++;if(o.isInstancedMesh)instances++;draws+=Array.isArray(o.material)?o.material.length:1}});
 return {meshes,instances,estimatedDraws:draws}
}

/* ---------- part info ---------- */
const I={
hour:['Hour hand','front','Faceted dauphine hand in gold. It rides on the cannon pinion and is driven through the motion works at one-twelfth the speed of the minute hand.','1 rev / 12 h'],
minute:['Minute hand','front','Matching dauphine hand, mounted on the centre wheel’s cannon pinion. Its long tip reaches the minute track on the chapter ring.','1 rev / 60 min'],
second:['Seconds hand','front','Blued-steel hand on the fourth-wheel arbor, with a round counterweight. It advances in five tiny steps each second, one per beat.','1 rev / 60 s'],
indices:['Applied indices','front','Twelve hand-applied gold batons, with a double baton at 12 o’clock as on the reference watch.','Gold plated'],
dial:['Dial & chapter ring','front','Sunburst-blue ring carrying the minute track and logo. The open centre shows the barrel, going train and escapement.','Ø 40 mm aperture ring'],
crystal:['Sapphire crystal','case','Domed, scratch-resistant sapphire with anti-reflective coating. Select it from the list because it is click-through in the scene.','Mohs 9'],
bezel:['Bezel','case','Polished steel ring that clamps the crystal onto the case middle.','316L steel, polished'],
caseMid:['Case middle','case','Gunmetal-finished case band. Holds the movement, lugs and crown tube, and gives 50 m water resistance.','Ø 48 mm · 50 m'],
lugs:['Lugs & strap','case','Four lugs with spring bars hold the leather strap. Lugs are angled downward to wrap the wrist.','20 mm strap'],
crown:['Crown','case','Knurled crown used to wind and to set the time. Pulling it out disengages the winding train and engages the setting lever.','Screw-free push-pull'],
caseBack:['Case back','case','Steel back ring with eight screws that holds the sapphire display window.','8 screws'],
backGlass:['Display back (sapphire)','case','Flat sapphire window letting you see the rotor and rear winding train.','Sapphire'],
mainplate:['Main plate','front','Base of the movement, finished with circular perlage. Every wheel pivots in jewels set into this plate or the bridges.','Perlage, nickel-silver'],
barrel:['Mainspring barrel','front','Toothed barrel housing the mainspring. It drives the going train as the spring unwinds.','≈ 42 h reserve'],
mainspring:['Mainspring','front','Long coiled ribbon of alloy steel. The rotor winds it through the ratchet; it releases energy slowly through the barrel.','Spiral, steel'],
centerWheel:['Centre wheel','front','Gold wheel at the dial centre. Its cannon pinion carries the minute hand, so it turns once per hour.','48 teeth · 1 rev / h'],
thirdWheel:['Third wheel','front','Intermediate wheel stepping the speed up from the centre wheel to the fourth wheel.','40 teeth'],
fourthWheel:['Fourth wheel','front','Turns once per minute and carries the seconds hand.','32 teeth · 1 rev / min'],
escapeWheel:['Escape wheel','front','Receives energy from the train and releases it one tooth at a time through the pallet fork. This is the “tick”.','15 teeth'],
palletFork:['Pallet fork','front','Rocks with the balance, locking and releasing the escape wheel while giving the balance a small impulse each swing. Rubies form the pallet stones.','Ruby pallets'],
balance:['Balance wheel','front','The oscillator. It swings back and forth, and with the hairspring sets the watch’s rate.','2.5 Hz · 18,000 vph'],
hairspring:['Hairspring','front','Fine blued spiral that pulls the balance back to centre; its stiffness and the balance inertia define the beat rate.','Blued steel'],
bridge:['Front bridges','front','Brushed bridges hold the train pivots in place above the main plate, secured with blued screws.','Côtes de Genève'],
jewels:['Ruby jewels','front','Synthetic ruby bearings in gold chatons reduce friction at the pivots and last longer than metal.','21 jewels'],
screws:['Blued screws','front','Heat-blued steel screws that fasten the bridges to the plate. The blue is made with heat and is purely decorative.','≈ 300 °C'],
ratchet:['Ratchet wheel','rear','Sits on the barrel arbor. Winding turns it, and the click keeps it from unwinding the spring.','50 teeth'],
click:['Click (pawl)','rear','Spring-loaded pawl that engages the ratchet wheel teeth and stops the mainspring from unwinding backwards.','Steel'],
crownWheel:['Crown wheel','rear','Part of the manual winding train. It transmits the crown’s motion through the ratchet to wind the barrel.','36 teeth'],
reducer:['Reduction wheel','rear','Reduces the rotor’s fast swing into a suitable winding speed for the ratchet.','36 teeth'],
reverser:['Reversing wheels','rear','Two wheels that convert rotor movement in either direction into the same winding direction at the ratchet.','Bi-directional winding'],
rearBridge:['Rear bridge','rear','Holds the automatic winding train in place behind the plate, finished with Côtes de Genève stripes.','Côtes de Genève'],
bearing:['Rotor bearing','rear','Ball bearing at the centre that lets the rotor spin freely with minimal friction.','Ceramic balls'],
rotor:['Oscillating weight (rotor)','rear','Half-disc of heavy metal. Arm and wrist movement spin it, and the reversing wheels use that motion to wind the mainspring. This makes the watch “automatic”.','Skeleton, 22k tungsten']};
const S={
hour:'The slower hand that shows the hour.',minute:'The long hand that shows the minutes.',second:'The thin hand that shows the seconds, moving in five tiny steps each second.',
indices:'The gold markers around the dial that make the hours easy to read.',dial:'The blue ring around the movement. It carries the minute markings and the brand name.',
crystal:'The clear protective cover over the dial. It is made from scratch-resistant sapphire.',bezel:'The polished metal ring that holds the crystal against the case.',
caseMid:'The main body of the watch. It protects the movement and connects the crown and strap.',lugs:'The four metal arms that connect the watch case to the strap.',
crown:'The side knob used to wind the watch or pull out when setting the time.',caseBack:'The back cover that holds the display window in place.',
backGlass:'The clear sapphire window that lets you watch the automatic winding mechanism.',mainplate:'The base plate that supports the wheels, bridges and jewel bearings.',
barrel:'The round housing that contains the coiled mainspring.',mainspring:'The coiled spring that stores the watch’s power.',centerWheel:'The central gear that turns once an hour and carries the minute hand.',
thirdWheel:'A middle gear that passes energy from the centre wheel toward the escapement.',fourthWheel:'The gear that turns once a minute and carries the seconds hand.',
escapeWheel:'The toothed wheel that releases the movement’s power one small step at a time.',palletFork:'The small lever that locks and releases the escape wheel, creating the tick.',
balance:'The wheel that swings back and forth to control the speed of the movement.',hairspring:'The delicate spiral spring that keeps the balance rhythm steady.',
bridge:'Metal supports that hold the moving parts in place above the main plate.',jewels:'Tiny ruby bearings that reduce friction where the gears pivot.',
screws:'Blue steel screws that secure the bridges.',ratchet:'The toothed wheel that is turned when winding the mainspring.',
click:'The small catch that stops the ratchet from spinning backward.',crownWheel:'A wheel that passes turning motion from the crown into the winding system.',
reducer:'A gear that slows the rotor’s quick swing to a useful winding speed.',reverser:'Wheels that make the winding mechanism work whichever way the rotor turns.',
rearBridge:'A support across the back that holds the automatic winding gears.',bearing:'The low-friction centre that lets the rotor spin freely.',
rotor:'The weighted arm that swings as you move and winds the mainspring automatically.'};
const G=[['Dial side',['hour','minute','second','indices','dial','crystal']],['Case',['bezel','caseMid','lugs','crown','caseBack','backGlass']],
['Movement · front',['mainplate','barrel','mainspring','centerWheel','thirdWheel','fourthWheel','escapeWheel','palletFork','balance','hairspring','bridge','jewels','screws']],
['Movement · rear',['ratchet','click','crownWheel','reducer','reverser','rearBridge','bearing','rotor']]];
const L=G.flatMap(g=>g[1]);
$('side').innerHTML=`<div class="side-head"><div class="side-head-copy"><h1 class="side-title">Parts guide</h1><p class="side-help">Choose a part here or tap the watch.</p><button class="glossary-link" id="sideGlossary" type="button">? Glossary</button></div><button class="b side-close" id="sideClose" type="button" aria-label="Close parts guide">✕</button></div>`+
 G.map(([h,ks])=>`<div class="grp">${h}</div>`+ks.map(k=>`<button class="it" type="button" data-k="${k}">${I[k][0]}</button>`).join('')).join('');

/* ---------- selection ---------- */
let sel=null,depth='simple';const orig=new Map(),CASE=['caseMid','bezel','crystal','lugs','crown','caseBack','backGlass'];
const meshesOf=k=>{const a=[];(parts[k]||[]).forEach(o=>o.traverse(m=>m.isMesh&&a.push(m)));return a};

function showInfo(){ $('info').classList.add('on');$('info').setAttribute('aria-hidden','false'); if(!IS_MOBILE)$('info').style.display='block' }
function hideInfo(){ $('info').classList.remove('on');$('info').setAttribute('aria-hidden','true'); if(!IS_MOBILE)$('info').style.display='none' }
function setDepth(level){
 depth=level==='detailed'?'detailed':'simple';
 document.querySelectorAll('.depth-btn').forEach(b=>{const on=b.dataset.depth===depth;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on))});
 if(sel)$('itext').textContent=depth==='simple'?S[sel]:I[sel][2];
 if(tour.on)renderTourText()
}

function select(k,focus){ if(k&&tour.on)endTour();
 orig.forEach((m,o)=>o.material=m);orig.clear();sel=k;
 document.querySelectorAll('.it').forEach(b=>b.classList.toggle('on',b.dataset.k===k));
 labelsDirty=true;invalidate();
 if(!k){hideInfo();return}
 meshesOf(k).forEach(m=>{const mats=Array.isArray(m.material)?m.material:[m.material];orig.set(m,m.material);
  const c=mats.map(x=>{const y=x.clone();y.emissive=new THREE.Color(0xd6a94f);y.emissiveIntensity=.5;return y});m.material=Array.isArray(m.material)?c:c[0]});
 const [n,s,t,sp]=I[k];$('itag').textContent={front:'Dial side · movement front',rear:'Rear · seen through display back',case:'Case'}[s];
 $('iname').textContent=n;$('itext').textContent=depth==='simple'?S[k]:t;$('ispec').textContent=sp;
 showInfo();
 if(focus)focusOn(k)}
const hl=()=>{if(!sel)return;const v=.45+Math.sin(performance.now()/260)*.3;orig.forEach((_,m)=>(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>x.emissiveIntensity=v))};
document.querySelectorAll('.it').forEach(b=>b.onclick=()=>{select(b.dataset.k,true); if(IS_MOBILE) closePartsDrawer()});
document.querySelectorAll('.depth-btn').forEach(b=>b.onclick=()=>setDepth(b.dataset.depth));
$('x').onclick=()=>select(null);
$('prev').onclick=()=>select(L[(L.indexOf(sel)+L.length-1)%L.length],true);
$('next').onclick=()=>select(L[(L.indexOf(sel)+1)%L.length],true);
$('backdrop').onclick=()=>{ if($('glossary').classList.contains('on'))closeGlossary();else if($('info').classList.contains('on')) select(null); else closePartsDrawer(); };

/* ---------- mobile parts drawer ---------- */
function openPartsDrawer(){ if(!IS_MOBILE) return;
  $('side').classList.add('on');$('side').setAttribute('aria-hidden','false');
  $('mParts').setAttribute('aria-expanded','true');$('backdrop').classList.add('on')
}
function closePartsDrawer(){ if(!IS_MOBILE) return;
  $('side').classList.remove('on');$('side').setAttribute('aria-hidden','true');
  $('mParts').setAttribute('aria-expanded','false');$('backdrop').classList.remove('on')
}
$('mParts').onclick=()=>openPartsDrawer();
$('sideClose').onclick=closePartsDrawer;

/* ---------- glossary ---------- */
function openGlossary(){
 if(IS_MOBILE)closePartsDrawer();
 $('glossary').classList.add('on');$('glossary').setAttribute('aria-hidden','false');$('backdrop').classList.add('on');
 $('gx').focus({preventScroll:true})
}
function closeGlossary(){
 $('glossary').classList.remove('on');$('glossary').setAttribute('aria-hidden','true');
 if(!$('info').classList.contains('on')&&!$('side').classList.contains('on'))$('backdrop').classList.remove('on')
}
$('sideGlossary').onclick=openGlossary;$('infoGlossary').onclick=openGlossary;$('gx').onclick=closeGlossary;

/* ---------- camera moves ---------- */
let fly=null;
const flyTo=(p,t)=>{
 if(!controls){camera.position.copy(p);camera.lookAt(t);labelsDirty=true;invalidate();return}
 fly={p0:camera.position.clone(),t0:controls.target.clone(),p1:p,t1:t,s:0};labelsDirty=true;invalidate()
};
const VIEWS={front:V(0,0,12.5),back:V(0,0,-12.5),q:V(4.2,-2.6,8.6).setLength(11.2),side:V(12.5,.7,1.45)};
const viewFor=k=>VIEWS[k].clone().multiplyScalar(IS_MOBILE?1.25:1);
document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>flyTo(viewFor(b.dataset.v),V()));
function focusOn(k){const b=new THREE.Box3();parts[k].forEach(o=>b.expandByObject(o));const c=b.getCenter(V()),sz=b.getSize(V()).length(),s=I[k][1];
 const target=controls?.target||V();
 const dir=s=='rear'?V(.3,-.3,-1):s=='front'?V(.3,-.3,1):camera.position.clone().sub(target);dir.normalize();
 flyTo(c.clone().addScaledVector(dir,Math.max(3.4,sz*2+1.5)*(IS_MOBILE?1.35:1)),c)}
/* ---------- toggles ---------- */
let ex=0,exT=0,paused=false,lapse=1,hs=0;const LAPSES=[1,60,600];
const tog=(id,f)=>{const b=$(id);b.onclick=()=>{f(b)}};
tog('bEx',b=>{exT=exT?0:1;b.classList.toggle('on',!!exT);b.setAttribute('aria-pressed',String(!!exT));labelsDirty=true;invalidate();if(exT&&controls?.getDistance?.()<14)flyTo(camera.position.clone().setLength(15),V())});
tog('bCase',b=>{const h=b.classList.toggle('on');b.setAttribute('aria-pressed',String(h));b.textContent=h?'Show case':'Hide case';CASE.forEach(k=>parts[k].forEach(o=>o.visible=!h));renderer.shadowMap.needsUpdate=true;labelsDirty=true;invalidate()});
tog('bSpin',b=>{const on=b.classList.toggle('on');b.setAttribute('aria-pressed',String(on));if(controls)controls.autoRotate=on;invalidate()});
tog('bPause',b=>{
 paused=b.classList.toggle('on');b.setAttribute('aria-pressed',String(paused));b.textContent=paused?'Play':'Pause';
 if(paused)stopTickPlayback();else if(tickOn)startTickPlayback();
 invalidate()
});
tog('bLapse',b=>{
 lapse=LAPSES[(LAPSES.indexOf(lapse)+1)%3];b.textContent='Time ×'+lapse;
 b.title=lapse===1?'Synced to your device clock':'Demonstration speed; return to ×1 to resync';
 b.setAttribute('aria-label','Time speed times '+lapse+(lapse===1?', synced to device clock':''))
});
const actualSeconds=()=>{const d=new Date();return d.getHours()*3600+d.getMinutes()*60+d.getSeconds()+d.getMilliseconds()/1000};
hs=actualSeconds();

/* ---------- continuous recorded tick loop ---------- */
let tickOn=false,audioContext=null,tickBufferPromise=null,tickSource=null,tickGain=null;
function getTickBuffer(){
 if(!audioContext)audioContext=new (window.AudioContext||window.webkitAudioContext)();
 if(!tickBufferPromise){
  const base64=TICK_AUDIO_DATA.slice(TICK_AUDIO_DATA.indexOf(',')+1),binary=atob(base64),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  tickBufferPromise=audioContext.decodeAudioData(bytes.buffer)
 }
 return Promise.all([audioContext.resume(),tickBufferPromise]).then(([,buffer])=>buffer)
}
function stopTickPlayback(){
 if(tickSource){try{tickSource.stop()}catch(_){}tickSource.disconnect();tickSource=null}
}
function startTickPlayback(){
 if(!tickOn||paused)return;
 getTickBuffer().then(buffer=>{
  if(!tickOn||paused)return;
  stopTickPlayback();
  if(!tickGain){tickGain=audioContext.createGain();tickGain.connect(audioContext.destination)}
  tickGain.gain.setValueAtTime(.24,audioContext.currentTime);
  tickSource=audioContext.createBufferSource();tickSource.buffer=buffer;tickSource.loop=true;
  tickSource.loopStart=0;tickSource.loopEnd=Math.min(5,buffer.duration);tickSource.connect(tickGain);
  const nextBeat=(1-(tm*2.5%1))/2.5,offset=(.06-nextBeat+5)%5;
  tickSource.start(audioContext.currentTime,offset)
 }).catch(()=>{
  tickOn=false;$('bTick').classList.remove('on');$('bTick').setAttribute('aria-pressed','false');$('bTick').textContent='Tap To Enable Tick'
 })
}
function setTick(on){
 tickOn=on;$('bTick').classList.toggle('on',on);$('bTick').setAttribute('aria-pressed',String(on));$('bTick').textContent=on?'Tick Off':'Tick On';
 if(on)startTickPlayback();else stopTickPlayback()
}
$('bTick').onclick=()=>setTick(!tickOn);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)stopTickPlayback();
 else if(tickOn&&!paused)startTickPlayback()
});

/* ---------- picking ---------- */
const ray=new THREE.Raycaster(),ptr=new THREE.Vector2(),tip=$('tip');let down=null;
const hov=[];watch.traverse(m=>{if(m.isMesh&&!['crystal','backGlass'].includes(m.userData.key))hov.push(m)});
const vis=o=>{for(;o;o=o.parent)if(!o.visible)return false;return true};
const pick=e=>{ptr.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(ptr,camera);const h=ray.intersectObjects(hov,false).find(h=>vis(h.object));return h&&h.object.userData.key};
let hoverEvent=null,hoverQueued=false;
function updateHover(){hoverQueued=false;const e=hoverEvent;if(!e)return;
 if(e.pointerType==='touch'||e.target!==renderer.domElement){tip.style.opacity=0;return}
 const k=pick(e);
 if(k){tip.textContent=I[k][0];tip.style.left=Math.min(e.clientX+14,innerWidth-130)+'px';tip.style.top=e.clientY+14+'px';tip.style.opacity=1}
 else tip.style.opacity=0;
 renderer.domElement.style.cursor=k?'pointer':'grab'}
addEventListener('pointermove',e=>{hoverEvent=e;if(!hoverQueued){hoverQueued=true;requestAnimationFrame(updateHover)}},{passive:true});
renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
renderer.domElement.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<5)select(pick(e)||null);down=null});

const bar=$('bar'),barPrev=$('barPrev'),barNext=$('barNext');
function updateBarCue(){
 const more=bar.scrollWidth-bar.clientWidth>2;
 const atStart=bar.scrollLeft<=3;
 const atEnd=bar.scrollLeft+bar.clientWidth>=bar.scrollWidth-3;
 barPrev.classList.toggle('on',more);barNext.classList.toggle('on',more);
 barPrev.disabled=!more||atStart;barNext.disabled=!more||atEnd
}
bar.addEventListener('scroll',updateBarCue,{passive:true});
if('ResizeObserver'in window)new ResizeObserver(()=>requestAnimationFrame(updateBarCue)).observe(bar);
function scrollBar(dir){
 bar.scrollBy({left:dir*Math.max(180,bar.clientWidth*.72),behavior:reduceMotion?'auto':'smooth'})
}
barPrev.onclick=()=>scrollBar(-1);barNext.onclick=()=>scrollBar(1);
bar.addEventListener('wheel',e=>{
 if(bar.scrollWidth<=bar.clientWidth)return;
 const delta=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
 if(delta){e.preventDefault();bar.scrollLeft+=delta}
},{passive:false});
bar.addEventListener('keydown',e=>{
 if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();scrollBar(e.key==='ArrowLeft'?-1:1)}
});
let barTouch=null,barHorizontal=false,suppressBarClick=false;
bar.addEventListener('touchstart',e=>{
 if(e.touches.length!==1)return;
 const t=e.touches[0];barTouch={x:t.clientX,y:t.clientY,scroll:bar.scrollLeft};barHorizontal=false
},{passive:true});
bar.addEventListener('touchmove',e=>{
 if(!barTouch||e.touches.length!==1)return;
 const t=e.touches[0],dx=t.clientX-barTouch.x,dy=t.clientY-barTouch.y;
 if(!barHorizontal&&Math.abs(dx)>5&&Math.abs(dx)>Math.abs(dy))barHorizontal=true;
 if(!barHorizontal)return;
 e.preventDefault();suppressBarClick=true;bar.scrollLeft=barTouch.scroll-dx
},{passive:false});
const endBarTouch=()=>{barTouch=null;setTimeout(()=>{suppressBarClick=false},80)};
bar.addEventListener('touchend',endBarTouch,{passive:true});bar.addEventListener('touchcancel',endBarTouch,{passive:true});
bar.addEventListener('click',e=>{if(suppressBarClick){e.preventDefault();e.stopPropagation()}},true);

function resizeRenderer(){
 const cap=LOW_POWER?1.2:IS_MOBILE?(innerWidth<420?1.35:1.5):2;
 const dpr=Math.min(devicePixelRatio||1,cap);
 camera.aspect=innerWidth/innerHeight;camera.fov=IS_MOBILE?42:32;camera.updateProjectionMatrix();
 renderer.setPixelRatio(dpr);renderer.setSize(innerWidth,innerHeight);
 if(composer){composer.setPixelRatio(dpr);composer.setSize(innerWidth,innerHeight)}
 const shadowRes=LOW_POWER?768:IS_MOBILE?1024:2048;
 if(key.shadow.mapSize.x!==shadowRes){
  key.shadow.mapSize.set(shadowRes,shadowRes);
  if(key.shadow.map){key.shadow.map.dispose();key.shadow.map=null}
 }
 renderer.shadowMap.needsUpdate=true;
 labelsDirty=true;invalidate();
 requestAnimationFrame(updateBarCue)
}
function syncResponsiveUI(){
 const changed=IS_MOBILE!==mobileQuery.matches;IS_MOBILE=mobileQuery.matches;
 if(IS_MOBILE){
  $('info').style.removeProperty('display');
  if(!$('side').classList.contains('on')){$('side').setAttribute('aria-hidden','true');$('mParts').setAttribute('aria-expanded','false')}
 }else{
  $('side').classList.remove('on');$('side').setAttribute('aria-hidden','false');
  $('mParts').setAttribute('aria-expanded','false');$('backdrop').classList.remove('on');
  $('info').style.display=$('info').classList.contains('on')?'block':'none'
 }
 if(changed)resizeRenderer();else requestAnimationFrame(updateBarCue)
}
addEventListener('resize',()=>requestAnimationFrame(()=>{syncResponsiveUI();resizeRenderer()}));
if(mobileQuery.addEventListener)mobileQuery.addEventListener('change',syncResponsiveUI);else mobileQuery.addListener(syncResponsiveUI);
requestAnimationFrame(()=>{syncResponsiveUI();resizeRenderer()});

/* ---------- energy-flow tour ---------- */
const hotMat=new THREE.MeshBasicMaterial({color:new THREE.Color(2.6,1.7,.55),toneMapped:false});
const orb=new THREE.Mesh(new THREE.SphereGeometry(.075,20,14),new THREE.MeshBasicMaterial({color:new THREE.Color(6,4,1.4),toneMapped:false}));
orb.visible=false;scene.add(orb);
const flow=new THREE.Group();flow.visible=false;scene.add(flow);
const ZFl=.52,ZRl=-.66,W=(x,y,z)=>V(x,y,z);
const WP={barrel:W(-.72,.5,ZFl),center:W(0,0,ZFl),third:W(.55,.45,ZFl),fourth:W(.8,-.1,ZFl),esc:W(.62,-.5,ZFl),pal:W(.2,-.8,ZFl),bal:W(-.45,-.95,ZFl),rotor:W(0,0,ZRl),red:W(-.5,-.15,ZRl),rat:W(-.72,.5,ZRl)};
const TOUR=[
['Stored energy','front',['barrel','mainspring'],'barrel','The mainspring coiled inside the barrel is the watch’s energy store. As it slowly unwinds it turns the barrel, giving around 42 hours of power.'],
['Centre wheel','front',['centerWheel'],'center','The barrel’s teeth mesh with the centre wheel, which turns once an hour and carries the minute hand. Notice how the teeth interlock and the wheels turn in opposite directions.'],
['Third wheel','front',['thirdWheel'],'third','Energy passes on to the third wheel. Each gear step trades torque for speed, so the train speeds up as it moves away from the barrel.'],
['Fourth wheel','front',['fourthWheel'],'fourth','The fourth wheel turns once a minute and carries the seconds hand. Every wheel in the train advances in small steps, one per beat.'],
['Escape wheel','front',['escapeWheel'],'esc','The escape wheel receives that energy, but its teeth are held back and released one at a time. This stops the train from simply unwinding in a rush.'],
['Pallet fork','front',['palletFork'],'pal','Ruby pallets lock and release the escape wheel with each beat, and give the balance a small kick of energy each swing. That is the “tick”.'],
['Balance & hairspring','front',['balance','hairspring'],'bal','The balance and hairspring oscillate 2.5 times a second. They set the pace for the whole train, and that steady rhythm is what keeps time.'],
['Rotor','rear',['rotor','bearing'],'rotor','Now round the back: movement of your wrist swings the rotor on its ball bearing. This is how an automatic watch winds itself.'],
['Winding train','rear',['reverser','reducer'],'red','The rotor drives the reversing and reduction wheels, which gear the swing down and send it to the spring in a single winding direction.'],
['Ratchet & click','rear',['ratchet','click','crownWheel'],'rat','The ratchet winds the mainspring and the click stops it slipping back. The energy is back in the barrel, and the cycle begins again.']];
const TOUR_SIMPLE=[
'The mainspring is the watch’s battery: it stores energy and releases it slowly as it unwinds.',
'The first gear receives that energy and turns once an hour. It also carries the minute hand.',
'This middle gear passes the energy onward and increases the movement’s speed.',
'The fourth wheel turns once a minute and drives the seconds hand.',
'The escape wheel releases the stored power in small, controlled steps.',
'The pallet fork alternately locks and frees the escape wheel. That quick action is the tick.',
'The balance wheel swings back and forth like a pendulum. The hairspring keeps that rhythm steady.',
'At the back, your arm movement swings the rotor. This is what makes the watch automatic.',
'The winding gears turn the rotor’s movement in either direction into winding motion.',
'The ratchet gathers that motion into the mainspring, and the click stops it unwinding backward.'];
const segs=TOUR.map((t,i)=>{if(!i||TOUR[i-1][1]!==t[1])return null;const m=new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(WP[TOUR[i-1][3]],WP[t[3]]),8,.016,8,false),hotMat);m.visible=false;flow.add(m);return m});
const tour={on:false,i:0,m:[],et:0},HANDS=['hour','minute','second'];
function tourGlow(keys){
 tour.m.forEach(([m,o])=>m.material=o);tour.m=[];const set=new Set();keys.forEach(k=>meshesOf(k).forEach(m=>set.add(m)));
 set.forEach(m=>{const mats=Array.isArray(m.material)?m.material:[m.material];
  const c=mats.map(x=>{const y=x.clone();y.emissive=new THREE.Color(0xd6a94f);y.emissiveIntensity=1.5;return y});
  tour.m.push([m,m.material]);m.material=Array.isArray(m.material)?c:c[0]})}
function focusKeys(keys,side){const b=new THREE.Box3();keys.forEach(k=>parts[k].forEach(o=>b.expandByObject(o)));
 const c=b.getCenter(V()),sz=b.getSize(V()).length(),dir=(side=='rear'?V(.3,-.3,-1):V(.2,-.25,1)).normalize();
 flyTo(c.clone().addScaledVector(dir,Math.max(3.2,sz*2+1.4)*(IS_MOBILE?1.35:1)),c)}
function renderTourText(){
 if(!tour.on)return;
 $('ttext').textContent=depth==='simple'?TOUR_SIMPLE[tour.i]:TOUR[tour.i][4]
}
function goTour(i){
 if(i<0)return;if(i>=TOUR.length){endTour();return}
 tour.i=i;tour.et=0;const [n,side,keys]=TOUR[i];
 $('tstep').textContent='Step '+(i+1)+' of '+TOUR.length+' · '+(side=='rear'?'Rear':'Front');$('tname').textContent=n;renderTourText();
 $('tprog').style.width=((i+1)/TOUR.length*100)+'%';
 $('tnext').textContent=i==TOUR.length-1?'Finish':'Next ›';$('tprev').disabled=i===0;
 tourGlow(keys);segs.forEach((m,j)=>{if(m)m.visible=j<=i&&TOUR[j][1]===side});focusKeys(keys,side)}
function startTour(){select(null);exT=0;const be=$('bEx');if(be){be.classList.remove('on');be.setAttribute('aria-pressed','false')}
 tour.on=true;flow.visible=true;orb.visible=true;HANDS.forEach(k=>parts[k].forEach(o=>o.visible=false));
 $('tour').classList.remove('min');$('tmin').setAttribute('aria-expanded','true');$('tmin').setAttribute('aria-label','Minimise tour');$('tmin').title='Minimise tour';$('tmin').textContent='−';
 $('tour').style.display='block';$('bTour').classList.add('on');$('bTour').setAttribute('aria-pressed','true');labelsDirty=true;invalidate();goTour(0)}
function endTour(){tour.on=false;tourGlow([]);flow.visible=false;orb.visible=false;HANDS.forEach(k=>parts[k].forEach(o=>o.visible=true));
 $('tour').style.display='none';$('tour').classList.remove('min');$('bTour').classList.remove('on');$('bTour').setAttribute('aria-pressed','false');labelsDirty=true;invalidate()}
$('bTour').onclick=()=>tour.on?endTour():startTour();
$('tnext').onclick=()=>goTour(tour.i+1);$('tprev').onclick=()=>goTour(tour.i-1);$('tx').onclick=endTour;
$('tmin').onclick=()=>{
 const min=$('tour').classList.toggle('min');
 $('tmin').setAttribute('aria-expanded',String(!min));
 $('tmin').setAttribute('aria-label',min?'Expand tour':'Minimise tour');
 $('tmin').title=min?'Expand tour':'Minimise tour';
 $('tmin').textContent=min?'+':'−'
};
addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 if($('glossary').classList.contains('on'))closeGlossary();
 else if(tour.on)endTour();
 else if($('info').classList.contains('on'))select(null);
 else if(IS_MOBILE&&$('side').classList.contains('on'))closePartsDrawer()
});
setDepth('simple');
function tourTick(dt){
 if(!tour.on)return;tour.et+=dt;const et=tour.et,t=TOUR[tour.i],cur=WP[t[3]],prev=segs[tour.i]?WP[TOUR[tour.i-1][3]]:null;
 if(prev){const u=(et*.55)%1;orb.position.lerpVectors(prev,cur,u*u*(3-2*u))}
 else orb.position.set(cur.x+Math.cos(et*2.4)*.34,cur.y+Math.sin(et*2.4)*.34,cur.z);
 orb.scale.setScalar(reduceMotion?1:1+.25*Math.sin(et*9));
 const v=reduceMotion?1.55:1.4+.6*Math.sin(et*5);tour.m.forEach(([m])=>(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>x.emissiveIntensity=v))}

/* ---------- optional projected labels ---------- */
const labelRoot=$('labels'),labelPoint=V();labelRoot.hidden=true;
let labelUpdates=0;
const LABEL_GROUPS={
 front:['barrel','centerWheel','escapeWheel','palletFork','balance','crown'],
 rear:['rotor','bearing','reverser','ratchet','crownWheel'],
 side:['crown','caseMid','lugs']
};
const labelEntries=Object.entries(LABEL_GROUPS).flatMap(([side,keys])=>keys.map(k=>({key:k,side,el:(()=>{
 const b=document.createElement('button');b.type='button';b.className='scene-label';b.textContent=I[k][0];
 b.setAttribute('aria-label','Show '+I[k][0]);b.onclick=()=>select(k,true);labelRoot.appendChild(b);return b
})()}))).filter((entry,i,all)=>all.findIndex(x=>x.key===entry.key)===i);
const labelsOnRef={value:false};
function setLabels(on){
 labelsOnRef.value=on;$('bLabels').classList.toggle('on',on);$('bLabels').setAttribute('aria-pressed',String(on));
 labelRoot.hidden=!on;labelsDirty=true;
 if(!on)labelEntries.forEach(x=>x.el.classList.remove('show'));else updateLabels()
}
$('bLabels').onclick=()=>setLabels(!labelsOnRef.value);
function updateLabels(){
 if(!labelsOnRef.value||tour.on){if(labelRoot.childElementCount)labelEntries.forEach(x=>x.el.classList.remove('show'));return}
 if(!labelsDirty)return;labelsDirty=false;
 labelUpdates++;
 const dist=camera.position.length(),frontness=Math.abs(camera.position.z)/Math.max(dist,.001);
 const group=frontness<.3?'side':camera.position.z>0?'front':'rear';
 labelEntries.forEach(({key,side,el})=>{
  const o=parts[key]?.[0];
  if(side!==group||!o||!vis(o)){el.classList.remove('show');return}
  o.getWorldPosition(labelPoint).project(camera);
  const x=(labelPoint.x*.5+.5)*innerWidth,y=(-labelPoint.y*.5+.5)*innerHeight;
  const visible=labelPoint.z>-1&&labelPoint.z<1&&x>54&&x<innerWidth-54&&y>36&&y<innerHeight-(IS_MOBILE?92:82);
  el.classList.toggle('show',visible);
  if(visible)el.style.transform=`translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
 })
}

/* ---------- true meshing: initial tooth phase so neighbouring gears interlock ---------- */
const frac=x=>x-Math.floor(x);
function meshAngle(thA,pa,NA,pb,NB){const al=Math.atan2(pb.y-pa.y,pb.x-pa.x),dA=frac((al-thA)*NA/(2*PI)-.31),dB=frac(.5-dA);return al+PI-(dB+.31)*2*PI/NB}
const O=V(),TH={};
TH.b=0;TH.c=meshAngle(TH.b,barrel.position,62,cw.position,48);TH.t=meshAngle(TH.c,cw.position,48,tw.position,40);TH.f=meshAngle(TH.t,tw.position,40,fw.position,32);
TH.v1=meshAngle(0,O,30,rv1.position,32);TH.v2=meshAngle(0,O,30,rv2.position,32);TH.red=meshAngle(0,O,30,red.position,36);
TH.rat=meshAngle(TH.red,red.position,36,rat.position,50);TH.crw=meshAngle(TH.rat,rat.position,50,crw.position,36);
const stp=(v,rate)=>{const f=v*rate,n=Math.floor(f),u=Math.min(1,(f-n)/.18);return (n+u*u*(3-2*u))/rate};

/* ---------- animation ---------- */
const explodeObjects=Object.values(parts).flat().filter(o=>o.userData.p0);
const clock=new THREE.Clock();let tm=0,firstFrameRendered=false,postQueued=false,batchQueued=false,renderedFrames=0;
const scheduleIdle=window.requestIdleCallback?fn=>window.requestIdleCallback(fn,{timeout:900}):fn=>setTimeout(fn,90);
function afterFirstPaint(){
 const loader=$('loader');
 if(loader){$('loadStatus').textContent='Movement ready';loader.classList.add('hide')}
 $('app').setAttribute('aria-busy','false');
 window.__watchFirstPaintMs=Math.round(performance.now());
 setTimeout(()=>resizeRenderer(),420);
 if(!batchQueued){batchQueued=true;scheduleIdle(()=>optimiseGeometry())}
 if(!postQueued){postQueued=true;scheduleIdle(()=>setupPostProcessing())}
}
function renderFrame(){
 rafId=0;
 const continuous=!paused||!!controls?.autoRotate||tour.on||!!fly||ex!==exT;
 if(!needsRender&&!continuous){clock.getDelta();return}
 const dt=Math.min(clock.getDelta(),.1);
 if(!paused){tm+=dt;if(lapse===1)hs=actualSeconds();else hs+=dt*lapse}
 if(ex!==exT){
  ex+=(exT-ex)*Math.min(1,dt*4);
  if(Math.abs(exT-ex)<.0005)ex=exT;
  for(const o of explodeObjects)o.position.copy(o.userData.p0).addScaledVector(o.userData.ex,ex);
  labelsDirty=true
 }
 // escapement: one beat = half balance oscillation; everything steps on the beat
 const bt=tm*2.5,fl=Math.floor(bt),uu=Math.min(1,(bt-fl)/.22),S=fl+uu*uu*(3-2*uu);
 bal.rotation.z=1.5*Math.sin(PI*bt);pal.rotation.z=.13*Math.tanh(8*Math.sin(PI*bt));ew.rotation.z=S*PI/15;
 // going train: Δθ_B = -(N_A/N_B)·Δθ_A keeps every tooth pair interlocked
 const df=-S*.07,dT=-(32/40)*df,dC=-(40/48)*dT,dB=-(48/62)*dC;
 fw.rotation.z=TH.f+df;tw.rotation.z=TH.t+dT;cw.rotation.z=TH.c+dC;barrel.rotation.z=TH.b+dB;
 // automatic winding train (always one-way: rotor angle is monotonic)
 const ra=tm*.45+.35*Math.sin(tm*1.1);rotG.rotation.z=ra;
 rv1.rotation.z=TH.v1-(30/32)*ra;rv2.rotation.z=TH.v2-(30/32)*ra;
 const dR=-(30/36)*ra,dRt=-(36/50)*dR;red.rotation.z=TH.red+dR;rat.rotation.z=TH.rat+dRt;crw.rotation.z=TH.crw-(50/36)*dRt;
 // Hands follow real device time in five beat-aligned steps per second.
 const shownSeconds=paused?hs:lapse===1?actualSeconds():hs;
 const hq=stp(shownSeconds,5);hS.rotation.z=-(hq%60)/60*2*PI;hM.rotation.z=-(hq%3600)/3600*2*PI;hH.rotation.z=-(hq%43200)/43200*2*PI;
 if(fly){fly.s+=dt/1.1;const k=fly.s>=1?1:1-Math.pow(1-fly.s,3);camera.position.lerpVectors(fly.p0,fly.p1,k);controls.target.lerpVectors(fly.t0,fly.t1,k);labelsDirty=true;if(fly.s>=1)fly=null}
 {const g=performance.now()*.001;glowG.emissiveIntensity=.55+.12*Math.sin(g*1.6);glowS.emissiveIntensity=.5+.1*Math.sin(g*1.6);glowB.emissiveIntensity=.45+.1*Math.sin(g*1.6+1)}
 if(film)film.uniforms.time.value=performance.now()*.001;
 if(!paused)hl();tourTick(dt);needsRender=false;controls?.update();updateLabels();
 composer?composer.render():renderer.render(scene,camera);
 renderedFrames++;
 if(!firstFrameRendered){firstFrameRendered=true;requestAnimationFrame(afterFirstPaint)}
 if(continuous||needsRender)invalidate()
}
window.__watchRuntime={
 getState:()=>({paused,autoRotate:!!controls?.autoRotate,rafId,needsRender,labelsDirty,labelUpdates,renderedFrames,composer:!!composer,meshes:watchMeshes()})
};
invalidate();
})().catch(error=>{
 console.error(error);
 const err=document.getElementById('err'),status=document.getElementById('loadStatus');
 if(err){err.style.display='block';err.textContent='Error: '+(error&&error.message||error)}
 if(status)status.textContent='The 3D scene could not finish loading'
});
