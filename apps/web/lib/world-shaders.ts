// @ts-nocheck
/* CAMPUS shader set (visual bible v2): linear-light PBR-ish shading, sun shadow map, procedural materials,
 * ACES tone mapping, aerial perspective, and a sky dome. Pure strings: no GL calls here so tests can import it. */

export const SUN_DIR = [-0.55, 0.9, 0.55];

const PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n`;

// ---------------------------------------------------------------------------------------------------------------
// Main surface shader (shared by the plain and the instanced programs)
// ---------------------------------------------------------------------------------------------------------------
export const FRAG = PRECISION + `
uniform vec3 uColor; uniform vec3 uLight; uniform vec3 uEye;
uniform float uEmissive; uniform float uAlpha; uniform float uNight;
uniform float uShadowOn; uniform float uShadowTexel; uniform float uShadowQ; uniform float uDetail; uniform float uPlain;
uniform mat4 uLightVP; uniform sampler2D uShadowMap;
uniform sampler2D uTexP; uniform sampler2D uTexG; uniform sampler2D uTexW; uniform sampler2D uTexR; uniform float uTexOn;
varying vec3 vNormal; varying vec3 vWorld; varying vec3 vColor;

float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),f.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),f.x),f.y); }
float fbm(vec2 p){ return vn(p)*.55+vn(p*2.03+7.1)*.30+vn(p*4.1+3.3)*.15; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0); }

float ign(vec2 p){ return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715)))); }
float shadowAt(vec3 wp, vec3 ng, float ndl){
  if(uShadowOn<.5) return 1.0;
  vec4 sc=uLightVP*vec4(wp+ng*(.07+.16*(1.0-ndl)),1.0);
  vec3 p=sc.xyz*.5+.5;
  if(p.x<=.0||p.x>=1.0||p.y<=.0||p.y>=1.0||p.z>=1.0) return 1.0;
  float edge=1.0-smoothstep(.78,1.0,max(abs(sc.x),abs(sc.y)));
  float bias=.0005+.0016*(1.0-ndl);
  float s=0.0;
  if(uShadowQ<.5){ s=step(p.z-bias,texture2D(uShadowMap,p.xy).r); }
  else {
    // Per-pixel rotated Poisson-disc PCF: turns the stair-stepped shadow-map texels into a smooth, dithered penumbra.
    float a=6.2831853*ign(gl_FragCoord.xy); float ca=cos(a), sa=sin(a); mat2 rot=mat2(ca,sa,-sa,ca);
    float r=uShadowTexel*(uShadowQ<1.5?1.7:2.1);
    vec2 d0=vec2(-.94,-.40), d1=vec2(.95,-.77), d2=vec2(-.09,-.93), d3=vec2(.34,.29), d4=vec2(-.92,.46), d5=vec2(-.38,.28);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d0*r).r);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d1*r).r);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d2*r).r);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d3*r).r);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d4*r).r);
    s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*d5*r).r);
    if(uShadowQ>1.5){
      vec2 e0=vec2(.80,.93), e1=vec2(.18,-.40), e2=vec2(-.62,-.92), e3=vec2(.66,.04), e4=vec2(-.30,.88), e5=vec2(.52,-.55);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e0*r).r);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e1*r).r);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e2*r).r);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e3*r).r);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e4*r).r);
      s+=step(p.z-bias,texture2D(uShadowMap,p.xy+rot*e5*r).r);
      s/=12.0;
    } else s/=6.0;
  }
  return mix(1.0,s,edge);
}

void main(){
 float nLen=length(vNormal); float panelFlag=step(1.5,nLen)*step(nLen,2.5); vec3 ng=normalize(vNormal); vec3 n=ng; vec3 L=normalize(uLight); vec3 V=normalize(uEye-vWorld);
 float dist=length(uEye-vWorld);
 float near=1.0-smoothstep(14.0,55.0,dist);
 float emv=step(1.5,max(vColor.r,max(vColor.g,vColor.b))); vec3 vcol=vColor-vec3(2.0*emv);
 float emis=max(uEmissive,emv*.15); vec3 base=uColor*vcol;
 float glass=1.0-smoothstep(.05,.14,distance(base,vec3(.659,.89,.965)));
 float gdiff=base.g-max(base.r,base.b);
 float isUp=step(.8,n.y); float lowY=1.0-smoothstep(.22,.5,vWorld.y);
 float ground=isUp*lowY*(1.0-glass);
 float grassy=step(.06,gdiff)*ground;
 float flatWall=step(.994,max(abs(n.x),abs(n.z)))*(1.0-step(.2,abs(n.y)));
 float foliage=step(.05,gdiff)*(1.0-flatWall)*(1.0-ground)*step(1.0,vWorld.y)*(1.0-glass);
 float roofSlope=(1.0-isUp)*step(.22,n.y)*step(1.9,vWorld.y)*(1.0-glass)*(1.0-foliage);
 float paving=ground*(1.0-grassy);
 float wall=(1.0-step(.3,abs(n.y)))*(1.0-glass)*(1.0-foliage);
 // block coursing belongs on painted building walls only: not on brown timber/trunks (orange-brown hue) or near-black poles
 float lumB=dot(base,vec3(.299,.587,.114)); float brown=step(1.18,base.r/(base.g+.004))*step(1.08,base.g/(base.b+.004));
 float wallT=wall*(1.0-brown)*(1.0-max(uPlain,panelFlag))*smoothstep(.09,.18,lumB); // uPlain: GLB props/decor/avatar parts (sign lettering, lamps, trunks) never get masonry; only building shells do
 // ---- sampled material-detail textures (original, tileable: R albedo detail, GB normal xy, A cavity). Taps are unconditional so mip selection stays valid. ----
 vec4 tP=texture2D(uTexP,vWorld.xz*.6); vec4 tG=texture2D(uTexG,vWorld.xz*.9); vec4 tW=texture2D(uTexW,vec2(vWorld.x+vWorld.z,vWorld.y)*.85);
 vec4 tP2=texture2D(uTexP,vWorld.xz*3.1+.37); vec4 tG2=texture2D(uTexG,vWorld.xz*4.3+.11); // second, finer tap: keeps ground sharp at close range
 vec2 rDir=normalize(ng.xz+vec2(1e-4)); vec2 rAx=vec2(-rDir.y,rDir.x);
 vec4 tR=texture2D(uTexR,vec2(dot(vWorld.xz,rAx)*3.4,dot(vWorld.xz,rDir)*2.7)/4.0);
 float dAo=1.0; float dSpec=1.0;
 if(uTexOn>.5&&uDetail>.5){
  float tf=1.0-smoothstep(35.0,110.0,dist); float tn=1.0-smoothstep(4.0,20.0,dist);
  vec2 pn=(tP.gb-.5)*2.0, gn=(tG.gb-.5)*2.0, wn=(tW.gb-.5)*2.0, rn=(tR.gb-.5)*2.0, pn2=(tP2.gb-.5)*2.0, gn2=(tG2.gb-.5)*2.0;
  base*=mix(vec3(1.0),vec3(tP.r*2.0),paving*(.46+.26*tf)); base*=mix(vec3(1.0),vec3(tP2.r*2.0),paving*.22*tn);
  base*=mix(vec3(1.0),vec3(tG.r*2.0),grassy*(.34+.26*tf)); base*=mix(vec3(1.0),vec3(tG2.r*2.0),grassy*.20*tn);
  base*=mix(vec3(1.0),vec3(tW.r*2.0),wallT*(.50+.30*tf));
  base*=mix(vec3(1.0),vec3(tR.r*2.0),roofSlope*(.55+.30*tf));
  n=normalize(n+vec3(pn.x,0.0,pn.y)*.55*paving*tf+vec3(pn2.x,0.0,pn2.y)*.25*paving*tn+vec3(gn.x,0.0,gn.y)*.34*grassy*tf+vec3(gn2.x,0.0,gn2.y)*.22*grassy*tn
   +vec3(wn.x*.7,wn.y*.8,wn.x*.7)*.55*wallT*tf
   +(vec3(rAx.x,0.0,rAx.y)*rn.x+vec3(rDir.x,0.0,rDir.y)*rn.y)*.60*roofSlope*tf);
  dAo=mix(1.0,tP.a,paving*tf)*mix(1.0,tG.a,grassy*tf)*mix(1.0,tW.a,wallT*tf)*mix(1.0,tR.a,roofSlope*tf);
  dSpec=mix(1.0,.35+.65*tP.a,paving*tf)*mix(1.0,.4+.6*tR.a,roofSlope*tf);
 }

 // ---- procedural bump (grass blades, leaves, plaster) ----
 // Each detail layer runs only on pixels of its own material (and only when near enough): a pixel pays for ONE material, not all of them.
 vec2 lp=vec2(vWorld.x+vWorld.z*.7,vWorld.y*1.6+vWorld.z*.3)*5.0;
 if(grassy>0.0&&near>0.0&&uDetail>.9){
  vec2 bp=vWorld.xz*6.0;
  vec2 gr=vec2(vn(bp+vec2(.37,0.0))-vn(bp-vec2(.37,0.0)),vn(bp+vec2(0.0,.37))-vn(bp-vec2(0.0,.37)));
  n=normalize(n+vec3(gr.x,0.0,gr.y)*.55*grassy*near);
 }
 if(foliage>0.0&&uDetail>.9){
  vec3 lg=vec3(vn(lp+vec2(.4,0.0))-vn(lp-vec2(.4,0.0)),vn(lp+vec2(0.0,.4))-vn(lp-vec2(0.0,.4)),vn(lp*1.7)-.5);
  n=normalize(n+lg*.85*foliage*mix(.45,1.0,near));
 }
 if(wall>0.0&&near>0.0&&uDetail>.9){
  vec2 wp=vec2(vWorld.x+vWorld.z,vWorld.y)*7.0;
  vec2 wg=vec2(vn(wp+vec2(.3,0.0))-vn(wp-vec2(.3,0.0)),vn(wp+vec2(0.0,.3))-vn(wp-vec2(0.0,.3)));
  n=normalize(n+vec3(wg.x*.5,wg.y*.6,wg.x*.5)*.18*wall*near);
 }

 // ---- albedo breakup per material ----
 if(grassy>0.0){
  float lf=vn(vWorld.xz*.07)*.65+vn(vWorld.xz*.31)*.35;
  base=mix(base,base*vec3(1.20,1.12,.72),smoothstep(.5,.8,lf)*grassy*.75);
  base*=1.0+(lf-.5)*.30*grassy;
  if(uDetail>.5){
   float patch=fbm(vWorld.xz*.45);
   base*=1.0+(patch-.5)*.22*grassy;
   base*=1.0+(h21(floor(vWorld.xz*9.0))-.5)*.16*grassy*near;
  }
  base*=1.0+(step(.5,fract(vWorld.x*.28))-.5)*.04*grassy;
 }
 // paving: running-bond tiles with joints, per-tile tint, grime near edges
 if(paving>0.0){
  vec2 tp=vWorld.xz/.8; float row=floor(tp.y); tp.x+=row*.5; vec2 tf=fract(tp); vec2 tid=floor(tp);
  float jx=min(tf.x,1.0-tf.x), jy=min(tf.y,1.0-tf.y); float j=1.0-smoothstep(.0,.045,min(jx,jy*.9));
  float fade=1.0-smoothstep(16.0,48.0,dist);
  base*=1.0-.20*j*fade*paving;
  base*=1.0+(h21(tid)-.5)*.10*paving*(.35+.65*fade);
  if(uDetail>.5) base*=1.0+(fbm(vWorld.xz*1.3)-.5)*.14*paving;
 }
 // roof tiles along the slope direction
 if(roofSlope>0.0){
  vec2 dr=normalize(n.xz+vec2(1e-4)); float t=dot(vWorld.xz,dr)*2.7; float c=dot(vWorld.xz,vec2(-dr.y,dr.x))*3.4;
  float fr=fract(t); float ridge=smoothstep(.0,.16,fr)*(1.0-smoothstep(.84,1.0,fr)*.0);
  float fadeR=1.0-smoothstep(25.0,85.0,dist);
  base*=mix(1.0,.80+.20*ridge,fadeR*roofSlope);
  base*=1.0+(h21(vec2(floor(t),floor(c)))-.5)*.14*roofSlope*fadeR;
  if(uDetail>.5) base*=1.0+(fbm(vWorld.xz*.9)-.5)*.16*roofSlope;
 }
 // flat roofs / terraces
 float flatRoof=isUp*step(1.9,vWorld.y)*(1.0-glass)*(1.0-foliage);
 if(flatRoof>0.0&&uDetail>.5) base*=1.0+(fbm(vWorld.xz*1.7)-.5)*.14*flatRoof;
 // plaster, soot at the plinth, floor-slab banding on tall walls
 if(wall>0.0){
  base*=1.0+(fbm(vec2(vWorld.x+vWorld.z,vWorld.y)*1.6)-.5)*.13*wall*uDetail;
  if(vWorld.y<1.1&&uDetail>.5) base*=1.0-wall*.20*smoothstep(1.1,.0,vWorld.y)*(.6+.4*fbm(vWorld.xz*3.0));
  float sf=fract(vWorld.y/3.2); float sl=1.0-smoothstep(.0,.05,min(sf,1.0-sf)); base*=1.0-wall*.05*sl*step(3.0,vWorld.y)*near;
 }
 // leaf colour variation: light catches the tips, deep green inside
 if(foliage>0.0){
  float lv=vn(lp*.6);
  base=mix(base,base*vec3(1.22,1.18,.74),smoothstep(.55,.9,lv)*foliage*.8);
  base*=1.0-foliage*.28*smoothstep(.5,.0,lv);
 }

 { // natural-material grade: pull toy-saturated paint toward chalky, sun-faded pigments (buildings, props, ground)
  float lm=dot(base,vec3(.299,.587,.114)); float mx=max(base.r,max(base.g,base.b)); float mn=min(base.r,min(base.g,base.b)); float sat=(mx-mn)/max(mx,.001);
  float keep=max(glass,max(foliage,emv));
  base=mix(base,vec3(lm),clamp(sat-.38,0.0,.6)*.62*(1.0-keep));
  base=mix(base,base*vec3(1.04,1.0,.93),.5*(1.0-keep));
  float gg=grassy; base=mix(base,mix(base,vec3(lm),.28)*vec3(1.02,1.0,.86),gg);
 }
 if(emis>0.0&&uNight>0.0){ base=mix(base,vec3(1.0,.80,.42),glass*uNight); }
 vec3 albedo=pow(clamp(base,0.0,1.0),vec3(2.2));

 // ---- lighting (linear) ----
 float ndl=dot(n,L); float d=max(ndl,0.0); float ndlG=max(dot(ng,L),0.0);
 float sh=shadowAt(vWorld,ng,ndlG);
 float lit=sh*step(.0,dot(ng,L));
 float hemi=n.y*.5+.5;
 float ao=mix(.55,1.0,smoothstep(0.0,2.6,vWorld.y));
 ao*=mix(1.0,.8,wall*(1.0-smoothstep(.0,.5,vWorld.y)));
 ao*=dAo;
 vec3 sunCol=mix(vec3(2.35,1.98,1.5),vec3(.42,.55,1.05),uNight);
 vec3 skyAmb=mix(vec3(.46,.62,.98),vec3(.10,.14,.34),uNight)*mix(.50,.62,hemi);
 vec3 gndAmb=mix(vec3(.46,.36,.24),vec3(.07,.07,.12),uNight)*.55;
 vec3 amb=mix(gndAmb,skyAmb,hemi)*ao;
 // warm bounce into shaded sides facing the sun, soft wrap on terminators
 float wrap=clamp((ndl+.3)/1.3,0.0,1.0);
 vec3 direct=sunCol*(d*lit+wrap*.07*sh)*(1.0-uNight*.45);
 vec3 bounce=vec3(.55,.40,.22)*max(-n.y,0.0)*.5*(1.0-uNight)+vec3(.30,.24,.16)*max(dot(n,-normalize(vec3(L.x,0.0,L.z))),0.0)*.30*(1.0-uNight);
 vec3 col=albedo*(direct+amb+bounce);
 // leaf translucency: sun glowing through canopies seen from the shaded side (palms/trees read lush instead of flat dark green)
 col+=albedo*vec3(1.05,1.0,.42)*foliage*sh*pow(max(dot(-V,L),0.0),2.0)*max(1.0-d,0.0)*.55*(1.0-uNight);
 // soft sheen on sun-lit paving and roof tiles (stone and ceramic are never perfectly matte)
 col+=sunCol*lit*(paving*.018+roofSlope*.02)*pow(max(dot(n,normalize(L+V)),0.0),8.0);
 col+=albedo*emis*(1.0+uNight*9.0)*1.3;

 // specular + glass reflection
 vec3 H=normalize(L+V); float spec=pow(max(dot(n,H),0.0),mix(30.0,140.0,glass))*(.05*dSpec+glass*1.0+roofSlope*.09*dSpec+wall*.0)*lit*(1.0-uNight*.75);
 col+=sunCol*spec*.5;
 float fres=pow(1.0-max(dot(n,V),0.0),3.0); vec3 R=reflect(-V,n);
 vec3 skyR=mix(vec3(.60,.74,.92),vec3(.14,.34,.78),clamp(R.y,0.0,1.0))*mix(1.0,.12,uNight);
 col=mix(col,skyR*.9,glass*(.30+fres*.55));
 col+=skyR*fres*.05*hemi*(1.0-glass);

 // ---- tone map, grade, aerial perspective ----
 col=aces(col*.56);
 col=pow(col,vec3(1.0/2.2));
 float lum=dot(col,vec3(.299,.587,.114)); col=clamp(mix(vec3(lum),col,1.04),0.0,1.0);
 vec3 fogC=mix(vec3(.78,.88,.97),vec3(.04,.06,.15),uNight);
 float fogA=smoothstep(60.0,165.0,dist)*.9+smoothstep(0.0,40.0,vWorld.y)*0.0;
 col=mix(col,fogC,fogA);
 gl_FragColor=vec4(col,uAlpha);
}`;

// ---------------------------------------------------------------------------------------------------------------
// Shadow-map depth pass
// ---------------------------------------------------------------------------------------------------------------
export const SHADOW_VERT = `attribute vec3 aPos; uniform mat4 uMvp; void main(){ gl_Position=uMvp*vec4(aPos,1.0); }`;
export const SHADOW_VERT_I = `attribute vec3 aPos; attribute vec4 aM0; attribute vec4 aM1; attribute vec4 aM2; attribute vec4 aM3; uniform mat4 uVP; void main(){ gl_Position=uVP*(mat4(aM0,aM1,aM2,aM3)*vec4(aPos,1.0)); }`;
export const SHADOW_FRAG = PRECISION + `void main(){ gl_FragColor=vec4(1.0); }`;

// ---------------------------------------------------------------------------------------------------------------
// Sky dome (full-screen triangle, drawn first, gamma-space output matching the fog colour)
// ---------------------------------------------------------------------------------------------------------------
export const SKY_VERT = `attribute vec2 aP; varying vec2 vUv; void main(){ vUv=aP; gl_Position=vec4(aP,.9999,1.0); }`;
export const SKY_FRAG = PRECISION + `
uniform vec3 uF; uniform vec3 uR; uniform vec3 uU; uniform float uTan; uniform float uAspect; uniform vec3 uSun; uniform float uNight; uniform float uTime;
varying vec2 vUv;
float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
 vec3 dir=normalize(uF+uR*vUv.x*uAspect*uTan+uU*vUv.y*uTan);
 float t=clamp(dir.y,0.0,1.0);
 vec3 hor=vec3(.78,.88,.97), mid=vec3(.42,.65,.92), top=vec3(.13,.34,.78);
 vec3 col=mix(hor,mid,smoothstep(.0,.22,t)); col=mix(col,top,smoothstep(.18,.85,t));
 float sd=max(dot(dir,normalize(uSun)),0.0);
 col+=vec3(1.0,.82,.55)*(pow(sd,6.0)*.20+pow(sd,48.0)*.30)+vec3(1.0,.96,.85)*smoothstep(.9992,.9998,sd)*1.4;
 vec3 nh=vec3(.04,.06,.15), nt=vec3(.01,.02,.07);
 vec3 ncol=mix(nh,nt,smoothstep(.0,.6,t));
 vec2 sp=floor(dir.xz/(dir.y+1.2)*140.0); float st=step(.9965,h21(sp))*smoothstep(.1,.4,t)*(.6+.4*sin(uTime*2.0+h21(sp+3.0)*20.0));
 ncol+=vec3(st);
 col=mix(col,ncol,uNight);
 gl_FragColor=vec4(col,1.0);
}`;
