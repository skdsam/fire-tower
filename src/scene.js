import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const host=document.querySelector('#scene'),hero=document.querySelector('.hero'),status=document.querySelector('#scene-status');
const exploreButton=document.querySelector('#explore'),panel=document.querySelector('#explore-panel'),motionButton=document.querySelector('#motion');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let paused=reduced.matches,exploring=false,ready=false,transition=null,currentView='overview',frameCount=0,lastFrame=0,visible=true,time=0,lastTick=performance.now();
let renderer,controls,scene,camera,sky,sun,ambient,tower,landscape,environmentTarget;
const look=new THREE.Vector3(),clockStart=performance.now();
const params={quality:innerWidth<700?'mobile':'desktop',pixelRatio:Math.min(devicePixelRatio,innerWidth<700?1.25:1.6),shadowSize:innerWidth<700?1024:2048,seed:83};
const themes={
  golden:{top:0x738785,horizon:0xecc99b,fog:0xc6b496,sun:0xffce8e,sky:0xc2cfca,ground:0x574b32,intensity:3.4,hemi:1.9,exposure:1.05},
  day:{top:0x558eb4,horizon:0xd6e4dc,fog:0xacc3c3,sun:0xfff0d5,sky:0xc9e4fa,ground:0x5b6543,intensity:3.5,hemi:2.2,exposure:1.12},
  blue:{top:0x172840,horizon:0x8e8c9e,fog:0x667988,sun:0x9db5e2,sky:0x8aa6c5,ground:0x172924,intensity:.7,hemi:1.1,exposure:.9}
};
let themeName='golden',targetTheme=themes.golden;
const vertex=`varying vec3 vDir; void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment=`
varying vec3 vDir;uniform vec3 topColor;uniform vec3 horizonColor;uniform float uTime;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float n=0.,a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=mat2(1.6,-1.2,1.2,1.6)*p;a*=.5;}return n;}
void main(){vec3 d=normalize(vDir);float elevation=max(d.y,0.);vec3 color=mix(horizonColor,topColor,pow(elevation,.48));
if(d.y>.055){vec2 p=d.xz/(d.y+.15)*2.4+vec2(uTime*.012,0);float f=fbm(p+fbm(p*.55));float band=smoothstep(.07,.18,d.y)*(1.-smoothstep(.5,.8,d.y));float cloud=smoothstep(.48,.7,f)*band;vec3 cloudColor=mix(horizonColor,vec3(1.,.95,.84),.65);color=mix(color,cloudColor,cloud*.75);}
gl_FragColor=vec4(color,1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;

function setStatus(text){status.textContent=text;}
function cameraPose(view=currentView){
  const mobile=host.clientWidth<700;const h=19.4;
  if(view==='cabin')return {position:new THREE.Vector3(-.76*h,1.01*h,-1.1*h),target:new THREE.Vector3(-.025*h,.8*h,-.025*h)};
  if(view==='stairs')return {position:new THREE.Vector3(-1.12*h,.8*h,-1.85*h),target:new THREE.Vector3(-.08*h,.42*h,-.24*h)};
  if(exploring)return {position:new THREE.Vector3(1.6*h,1.12*h,-2.1*h),target:new THREE.Vector3(0,.48*h,-.07*h)};
  if(mobile)return {position:new THREE.Vector3(1.52*h,1.25*h,-2.45*h),target:new THREE.Vector3(0,-.07*h,-.06*h)};
  return {position:new THREE.Vector3(1.7*h,1.18*h,-2.2*h),target:new THREE.Vector3(.8*h,.52*h,0)};
}
function gotoView(view,animate=true){
  currentView=view;const pose=cameraPose(view);
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  if(!animate||reduced.matches){camera.position.copy(pose.position);controls.target.copy(pose.target);controls.update();transition=null;}
  else transition={start:performance.now(),from:camera.position.clone(),fromTarget:controls.target.clone(),to:pose.position,target:pose.target,duration:1300};
}
function enterExplore(view='overview'){
  if(!ready)return;exploring=true;hero.classList.add('exploring');panel.hidden=false;controls.enabled=true;controls.enableZoom=true;controls.enableRotate=true;gotoView(view);setStatus('Drag to look around');
}
function exitExplore(){exploring=false;hero.classList.remove('exploring');panel.hidden=true;controls.enabled=false;gotoView('overview');setStatus('YOUR LOOKOUT · LIVE 3D');exploreButton.focus({preventScroll:true});}
function applyTheme(name){themeName=name;targetTheme=themes[name];document.querySelectorAll('[data-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.light===name)));}
function updateMotionButton(){motionButton.setAttribute('aria-label',paused?'Resume scene motion':'Pause scene motion');motionButton.title=paused?'Resume scene motion':'Pause scene motion';motionButton.innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12M16 6v12"/></svg>';}
updateMotionButton();exploreButton.disabled=true;

async function init(){
  renderer=new THREE.WebGLRenderer({antialias:innerWidth>=700,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(params.pixelRatio);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=themes.golden.exposure;renderer.outputColorSpace=THREE.SRGBColorSpace;host.append(renderer.domElement);
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(themes.golden.fog,.007);
  camera=new THREE.PerspectiveCamera(42,1,.15,1800);
  controls=new OrbitControls(camera,renderer.domElement);controls.enabled=false;controls.enablePan=false;controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=8;controls.maxDistance=85;controls.maxPolarAngle=Math.PI*.49;controls.minPolarAngle=.22;
  controls.addEventListener('start',()=>{transition=null;});
  const room=new RoomEnvironment();const pmrem=new THREE.PMREMGenerator(renderer);environmentTarget=pmrem.fromScene(room,.04);scene.environment=environmentTarget.texture;pmrem.dispose();room.dispose();
  sky=new THREE.Mesh(new THREE.SphereGeometry(1200,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:vertex,fragmentShader:fragment,uniforms:{topColor:{value:new THREE.Color(themes.golden.top)},horizonColor:{value:new THREE.Color(themes.golden.horizon)},uTime:{value:0}}}));sky.renderOrder=-1;scene.add(sky);
  ambient=new THREE.HemisphereLight(themes.golden.sky,themes.golden.ground,themes.golden.hemi);scene.add(ambient);
  sun=new THREE.DirectionalLight(themes.golden.sun,themes.golden.intensity);sun.position.set(-32,48,-30);sun.castShadow=true;sun.shadow.mapSize.set(params.shadowSize,params.shadowSize);Object.assign(sun.shadow.camera,{left:-38,right:38,top:38,bottom:-38,near:1,far:160});sun.shadow.normalBias=.06;sun.shadow.bias=-.00012;scene.add(sun);
  const glow=new THREE.PointLight(0xffb656,8,7,2);glow.position.set(0,15.7,0);scene.add(glow);
  gotoView('overview',false);resize();
  const loader=new GLTFLoader();
  const [towerAsset,landscapeAsset]=await Promise.all([loader.loadAsync(new URL('./assets/tower.glb',import.meta.url).href),loader.loadAsync(new URL('./assets/landscape.glb',import.meta.url).href)]);
  tower=towerAsset.scene;landscape=landscapeAsset.scene;
  tower.traverse(o=>{if(o.isMesh){o.castShadow=!o.name.includes('Glass');o.receiveShadow=true;if(o.name.includes('Glass')){o.material.transparent=true;o.material.opacity=.3;o.material.depthWrite=false;o.material.side=THREE.DoubleSide;}if(o.material){o.material.envMapIntensity=.5;}}});
  landscape.updateMatrixWorld(true);
  const groups=new Map(),remove=[];
  landscape.traverse(o=>{
    if(!o.isMesh)return;
    o.receiveShadow=true;o.castShadow=o.name.includes('Forest_');
    if(o.name.includes('Grass')){o.material.side=THREE.DoubleSide;o.castShadow=false;}
    if(o.name.includes('Forest_Pine')){const key=o.geometry.uuid+o.material.uuid;if(!groups.has(key))groups.set(key,{geometry:o.geometry,material:o.material,items:[]});groups.get(key).items.push(o.matrixWorld.clone());remove.push(o);}
  });
  for(const g of groups.values()){const inst=new THREE.InstancedMesh(g.geometry,g.material,g.items.length);g.items.forEach((m,i)=>inst.setMatrixAt(i,m));inst.instanceMatrix.needsUpdate=true;inst.castShadow=true;inst.receiveShadow=true;landscape.add(inst);}
  remove.forEach(o=>o.removeFromParent());scene.add(tower,landscape);
  ready=true;exploreButton.disabled=false;document.querySelector('.hero-fallback').style.opacity='0';setStatus('YOUR LOOKOUT · LIVE 3D');
  window.__fireTower={ready:true,source:'Firewatch_Improved.blend',towerMeshes:29,quality:params.quality,get diagnostics(){return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frames:frameCount,theme:themeName,view:currentView,motionPaused:paused};}};
  requestAnimationFrame(render);
}
function resize(){if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();gotoView(currentView,false);}
function render(now){
  if(!renderer)return;requestAnimationFrame(render);if(!visible||document.hidden)return;if(now-lastFrame<1000/30)return;
  const delta=Math.min((now-lastTick)/1000,.1);lastTick=now;lastFrame=now;if(!paused)time+=delta;
  if(transition){const t=Math.min(1,(now-transition.start)/transition.duration),e=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,e);controls.target.lerpVectors(transition.fromTarget,transition.target,e);if(t>=1)transition=null;}
  else if(!exploring){const pose=cameraPose();if(!paused){pose.position.x+=Math.sin(time*.09)*1.2;pose.position.z+=Math.sin(time*.07)*.6;}camera.position.copy(pose.position);controls.target.copy(pose.target);}
  controls.update();
  const smoothing=1-Math.exp(-delta*3);
  sky.material.uniforms.topColor.value.lerp(new THREE.Color(targetTheme.top),smoothing);sky.material.uniforms.horizonColor.value.lerp(new THREE.Color(targetTheme.horizon),smoothing);sky.material.uniforms.uTime.value=time;
  scene.fog.color.lerp(new THREE.Color(targetTheme.fog),smoothing);sun.color.lerp(new THREE.Color(targetTheme.sun),smoothing);ambient.color.lerp(new THREE.Color(targetTheme.sky),smoothing);ambient.groundColor.lerp(new THREE.Color(targetTheme.ground),smoothing);sun.intensity=THREE.MathUtils.lerp(sun.intensity,targetTheme.intensity,smoothing);ambient.intensity=THREE.MathUtils.lerp(ambient.intensity,targetTheme.hemi,smoothing);renderer.toneMappingExposure=THREE.MathUtils.lerp(renderer.toneMappingExposure,targetTheme.exposure,smoothing);
  renderer.render(scene,camera);frameCount++;
}
exploreButton.addEventListener('click',()=>enterExplore());
document.querySelector('#close-explore').addEventListener('click',exitExplore);
document.querySelector('#reset-view').addEventListener('click',()=>gotoView('overview'));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>gotoView(b.dataset.view)));
document.querySelectorAll('[data-light]').forEach(b=>b.addEventListener('click',()=>applyTheme(b.dataset.light)));
document.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{hero.scrollIntoView({behavior:reduced.matches?'instant':'smooth'});enterExplore(b.dataset.jump);}));
motionButton.addEventListener('click',()=>{paused=!paused;updateMotionButton();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&exploring)exitExplore();});
new ResizeObserver(resize).observe(host);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;lastTick=performance.now();},{rootMargin:'100px'}).observe(hero);
reduced.addEventListener('change',e=>{if(e.matches){paused=true;updateMotionButton();}});
window.addEventListener('pagehide',()=>{controls?.dispose();environmentTarget?.dispose();renderer?.dispose();renderer=null;});
init().catch(error=>{console.error('Scene could not load:',error);hero.classList.add('scene-failed');setStatus('Scene preview · 3D unavailable on this device');exploreButton.disabled=true;window.__fireTower={ready:false,error:String(error)};});
