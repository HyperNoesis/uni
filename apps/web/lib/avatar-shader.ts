// @ts-nocheck
/* Textured avatar shader: albedo atlas + tint mask (R skin, G hair, B garment) so one texture serves every skin tone,
 * hair colour and outfit colour. Lighting (sun, hemisphere ambient, shadow map, ACES, fog) mirrors the world shader so
 * avatars sit in the same light; skin additionally gets wrap lighting, a warm terminator and a soft sheen.
 * The shadow-map sampler is sliced out of the world FRAG so there is a single implementation. */
import { FRAG } from "./world-shaders";

const PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n`;
const a = FRAG.indexOf("vec3 aces("), b = FRAG.indexOf("void main(){");
if (a < 0 || b < a) throw new Error("avatar shader: world shader layout changed (aces/shadowAt not found)");
const SHARED = FRAG.slice(a, b);

export const AVATAR_VERT = `attribute vec3 aPos; attribute vec3 aNormal; attribute vec2 aUv; uniform mat4 uMvp;
varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
void main(){ vWorld=aPos; vNormal=aNormal; vUv=aUv; gl_Position=uMvp*vec4(aPos,1.0); }`;

export const AVATAR_FRAG = PRECISION + `
uniform vec3 uLight; uniform vec3 uEye; uniform float uNight; uniform float uAlpha;
uniform float uShadowOn; uniform float uShadowTexel; uniform float uShadowQ; uniform mat4 uLightVP; uniform sampler2D uShadowMap;
uniform sampler2D uTexA; uniform sampler2D uTexM; uniform vec3 uSkinT; uniform vec3 uHairC; uniform vec3 uTopC; uniform float uHairL; uniform float uTopL;
uniform vec4 uTopRect; uniform vec4 uBotRect; uniform vec4 uShoeRect; uniform float uTopPat; uniform vec3 uTopAcc; uniform float uBotKind; uniform float uBotCut; uniform float uShoeKind; uniform vec3 uShoeC;
varying vec3 vNormal; varying vec3 vWorld; varying vec2 vUv;
float inR(vec4 r){ return step(r.x,vUv.x)*step(vUv.x,r.z)*step(r.y,vUv.y)*step(vUv.y,r.w); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h2(i),h2(i+vec2(1.0,0.0)),f.x),mix(h2(i+vec2(0.0,1.0)),h2(i+vec2(1.0,1.0)),f.x),f.y); }
` + SHARED + `
void main(){
 vec4 a=texture2D(uTexA,vUv); if(a.a<.5) discard;
 vec3 m=texture2D(uTexM,vUv).rgb; vec3 c=a.rgb; float L=dot(c,vec3(.299,.587,.114));
 float inTop=inR(uTopRect), inBot=inR(uBotRect), inShoe=inR(uShoeRect);
 vec2 lt=(vUv-uTopRect.xy)/(uTopRect.zw-uTopRect.xy), lb=(vUv-uBotRect.xy)/(uBotRect.zw-uBotRect.xy);
 if(inBot>.5){
  if(uBotKind>2.5&&lb.y>uBotCut) discard;
  if(uBotKind>.5&&uBotKind<1.5) c=vec3(.66,.55,.38)*(.45+1.0*L);
  else if(uBotKind>1.5&&uBotKind<2.5) c=vec3(.17,.18,.2)*(.55+.9*L);
 }
 if(inShoe>.5&&uShoeKind>.5) c=uShoeC*(.4+1.15*L);
 vec3 skinC=c*uSkinT, hairC=uHairC*clamp(L/uHairL,0.0,1.5), topC=uTopC*clamp(L/uTopL,0.0,1.6), topF=topC;
 if(inTop>.5&&uTopPat>.5){
  if(uTopPat<1.5){ float st=step(.5,fract(lt.y*16.0)); topF=mix(topC,uTopAcc*(.45+L),st*.85); }
  else if(uTopPat<2.5){
   vec2 p=fract(lt*vec2(7.0,9.0))-.5; float r=length(p); float ring=step(.30,r)-step(.38,r); float dt=1.0-step(.12,r);
   float dg=step(.5,fract((lt.x+lt.y)*14.0));
   topF=mix(topC,uTopAcc,dg*.55); topF=mix(topF,vec3(.95,.72,.15),ring); topF=mix(topF,vec3(.96,.94,.9),dt); topF*=(.62+.75*L);
  }
  else if(uTopPat<3.5){
   float n1=vn2(lt*14.0), n2=vn2(lt*14.0+7.3), n3=vn2(lt*26.0+2.0); vec3 cc=vec3(.55,.5,.33);
   cc=mix(cc,vec3(.30,.34,.20),step(.5,n1)); cc=mix(cc,vec3(.33,.24,.14),step(.58,n2)*.9); cc=mix(cc,vec3(.10,.12,.09),step(.62,n3)); topF=cc*(.55+.9*L);
  }
  else if(uTopPat<4.5){ topF=topC*(.9+.2*vn2(lt*220.0)); }
  else { float st=step(.5,fract(lt.x*9.0)); topF=mix(topC,uTopAcc*(.45+L),st*.8); }
 }
 c=mix(c,skinC,m.r); c=mix(c,hairC,m.g); c=mix(c,topF,m.b*.92);
 vec3 ng=normalize(vNormal); vec3 n=ng; vec3 Ld=normalize(uLight); vec3 V=normalize(uEye-vWorld); float dist=length(uEye-vWorld);
 vec3 albedo=pow(clamp(c,0.0,1.0),vec3(2.2));
 float ndl=dot(n,Ld); float d=max(ndl,0.0); float ndlG=max(dot(ng,Ld),0.0);
 float sh=shadowAt(vWorld,ng,ndlG); float lit=sh*step(.0,dot(ng,Ld));
 float hemi=n.y*.5+.5; float ao=mix(.62,1.0,smoothstep(0.0,1.1,vWorld.y));
 vec3 sunCol=mix(vec3(2.35,1.98,1.5),vec3(.42,.55,1.05),uNight);
 vec3 skyAmb=mix(vec3(.46,.62,.98),vec3(.10,.14,.34),uNight)*mix(.50,.62,hemi);
 vec3 gndAmb=mix(vec3(.46,.36,.24),vec3(.07,.07,.12),uNight)*.55;
 vec3 amb=mix(gndAmb,skyAmb,hemi)*ao;
 float wrapL=clamp((ndl+.45)/1.45,0.0,1.0);
 vec3 direct=sunCol*mix(d*lit,wrapL*sh,m.r*.5)*(1.0-uNight*.45);
 vec3 bounce=vec3(.55,.40,.22)*max(-n.y,0.0)*.5*(1.0-uNight);
 vec3 col=albedo*(direct+amb+bounce);
 col+=albedo*vec3(.95,.30,.14)*m.r*max(0.0,.30-abs(ndl))*.55*sh*(1.0-uNight);
 vec3 H=normalize(Ld+V); float sp=pow(max(dot(n,H),0.0),mix(22.0,70.0,m.r))*(m.r*.16+.04)*lit*(1.0-uNight*.75);
 col+=sunCol*sp*.5;
 float fres=pow(1.0-max(dot(n,V),0.0),4.0); col+=mix(vec3(.60,.74,.92),vec3(.14,.34,.78),clamp(reflect(-V,n).y,0.0,1.0))*mix(1.0,.12,uNight)*fres*.07*hemi;
 col=aces(col*.56); col=pow(col,vec3(1.0/2.2));
 float lum=dot(col,vec3(.299,.587,.114)); col=clamp(mix(vec3(lum),col,1.04),0.0,1.0);
 vec3 fogC=mix(vec3(.78,.88,.97),vec3(.04,.06,.15),uNight);
 col=mix(col,fogC,smoothstep(60.0,165.0,dist)*.9);
 gl_FragColor=vec4(col,uAlpha);
}`;
