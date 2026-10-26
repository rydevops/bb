// Low-resolution renderer: the 3D scene is drawn into a small render target (320x180 / 427x240 / 640x360 tall),
// then an ordered-dither, reduced-colour-depth pass writes it to the canvas, which is scaled up with
// nearest-neighbour filtering (CSS image-rendering: pixelated).
import * as THREE from '../vendor/three.module.js';

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const FRAG = `
precision highp float;
uniform sampler2D tDiffuse; uniform vec2 res; uniform float levels; uniform float dither;
uniform vec3 tint; uniform float tintAmt; uniform float bright; uniform float hue; uniform float glitch; uniform float time; uniform float vignette; uniform float invert; uniform float sat;
varying vec2 vUv;
float bayer(vec2 p){
  vec2 q = mod(floor(p), 4.0);
  float x0 = mod(q.x, 2.0), x1 = floor(q.x / 2.0), y0 = mod(q.y, 2.0), y1 = floor(q.y / 2.0);
  return (8.0 * abs(x0 - y0) + 4.0 * y0 + 2.0 * abs(x1 - y1) + y1) / 16.0;
}
vec3 hueRot(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a), sa = sin(a);
  return c * ca + cross(k, c) * sa + k * dot(k, c) * (1.0 - ca);
}
void main(){
  vec2 uv = vUv;
  if (glitch > 0.0) {
    float band = floor(uv.y * 24.0 + floor(time * 12.0));
    uv.x += (fract(sin(band * 91.7) * 4375.5) - 0.5) * 0.12 * glitch * step(0.7, fract(sin(band * 12.9) * 437.5));
  }
  vec3 c = texture2D(tDiffuse, uv).rgb;
  if (hue != 0.0) c = hueRot(c, hue);
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, sat);
  c = mix(c, c * tint, tintAmt) * bright;
  if (invert > 0.5) c = 1.0 - c;
  float v = 1.0 - vignette * smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.35);
  c *= v;
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));      // linear -> display, then quantise so the banding is even
  float t = bayer(vUv * res) - 0.5;
  c = floor(c * levels + 0.5 + t * dither) / levels;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createRenderer(canvas) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); }
  catch (e) { renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); }
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.3, 400);
  camera.rotation.order = 'YXZ';
  let rt = null;
  const uniforms = {
    tDiffuse: { value: null }, res: { value: new THREE.Vector2(427, 240) }, levels: { value: 8 }, dither: { value: 1 },
    tint: { value: new THREE.Color(1.35, 0.55, 0.55) }, tintAmt: { value: 0 }, bright: { value: 1 }, hue: { value: 0 }, glitch: { value: 0 }, time: { value: 0 }, vignette: { value: 0 }, invert: { value: 0 }, sat: { value: 1 },
  };
  const post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false }));
  const postScene = new THREE.Scene(); postScene.add(post);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const R = { renderer, scene, camera, uniforms, quality: 240, w: 427, h: 240, roll: 0 };

  R.resize = (quality) => {
    if (quality) R.quality = +quality;
    const vw = window.innerWidth, vh = window.innerHeight, aspect = vw / vh;
    const h = R.quality, w = Math.round(h * Math.min(Math.max(aspect, 1), 2.4));
    if (w !== R.w || h !== R.h || !rt) {
      R.w = w; R.h = h;
      rt?.dispose();
      rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      renderer.setSize(w, h, false);
      uniforms.res.value.set(w, h); uniforms.tDiffuse.value = rt.texture;
    }
    camera.aspect = w / h; camera.fov = aspect < 1.5 ? 82 : 72; camera.updateProjectionMatrix();
    canvas.style.width = '100%'; canvas.style.height = '100%';
  };
  R.render = (time) => {
    uniforms.time.value = time;
    renderer.setRenderTarget(rt); renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  };
  R.resize();
  return R;
}
