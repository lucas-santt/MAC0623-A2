// MAC0623 — Class 8 — WebXR Grab & Bimanual Manipulation — STARTER
//
// Provided: scene setup, renderer/camera, the WebXR bootstrap (the five
// lines from Class 8 that turn a desktop three.js app into a VR one), both
// controllers with target-ray and grip poses visualized, a raycasting
// helper for picking, HUD wiring, and the render loop.
//
// You implement: single-hand grab (attach/detach) and two-handed
// scale/rotate, inside the blocks marked
//
//   // ===== STUDENT TODO ===== ... // ===== END STUDENT TODO =====
//
// near the end of this file.
// 
// Everything you need to touch for the baseline exercises is inside those
// blocks. Read the lab description in our class home page
// for the full task description and worked code hints.
//
// Render loop note: WebXR requires `renderer.setAnimationLoop(callback)`,
// not `requestAnimationFrame`. three.js swaps the timing source
// automatically once an XR session starts — you don't need to branch on
// whether you're in VR inside `animate()`.

import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

// ---------------------------------------------------------------------------
// Module-scope state — provided
// ---------------------------------------------------------------------------

let scene, camera, renderer;
let controller0, controller1, controllerGrip0, controllerGrip1;
let grabbables = [];
let attachModeSelect, handModeSelect, statusEl;

// ---------------------------------------------------------------------------
// main() is called from the last line in this file
//
function main() {
  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 50);
  camera.position.set(0, 1.6, 1.2);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  // ---- The five lines from Class 8 ----
  renderer.xr.enabled = true;
  document.body.appendChild(VRButton.createButton(renderer));
  // (the other three — getController(0), scene.add(controller), and the
  // selectstart listener — happen below, generalized to both controllers)

  document.body.appendChild(renderer.domElement);

  const built = buildScene();
  scene = built.scene;
  grabbables = built.objects;

  // arrow functions are very convenient, try to get used to it in Javascript
  renderer.xr.addEventListener("sessionstart", () => setStatus("In VR", true));
  renderer.xr.addEventListener("sessionend", () => setStatus("Left VR"));

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const ctrls = buildControllers(renderer, scene);
  controller0 = ctrls.controller0;
  controller1 = ctrls.controller1;
  controllerGrip0 = ctrls.grip0;
  controllerGrip1 = ctrls.grip1;

  [controller0, controller1].forEach((controller) => {
    controller.addEventListener("selectstart", onSelectStart);
    controller.addEventListener("selectend", onSelectEnd);
  });

  attachModeSelect = document.getElementById("attachMode");
  handModeSelect = document.getElementById("handMode");
  statusEl = document.getElementById("status");

  renderer.setAnimationLoop(animate);
}

// ---------------------------------------------------------------------------
function animate() {
  updateTwoHandGesture();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------
/**
 * buildScene()
 *
 * Builds the static contents of the scene: lighting, a reference grid, and
 * three grabbable objects spread at a comfortable standing-reach distance
 * (about arm's length, roughly eye height). Colors are just for telling
 * them apart on the HUD/debrief, not semantic.
 *
 * @returns {{ scene: THREE.Scene, objects: THREE.Mesh[] }}
 */

const WHITE = 0xffffff;
const GREY1 = 0X111111;
const GREY2 = 0X222222;
const GREY4 = 0x444444;

function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GREY1);

  scene.add(new THREE.HemisphereLight(WHITE, GREY4, 1.2));
  const dirLight = new THREE.DirectionalLight(WHITE, 0.8);
  dirLight.position.set(2, 4, 3);
  scene.add(dirLight);

  scene.add(new THREE.GridHelper(6, 24, GREY4, GREY2));
  scene.add(new THREE.AxesHelper(0.6));

  const specs = [
    { geo: new THREE.BoxGeometry(0.2, 0.2, 0.2), color: 0xdd5544, pos: [-0.3, 1.2, -0.6] },
    { geo: new THREE.SphereGeometry(0.12, 24, 16), color: 0x44aadd, pos: [0.0, 1.2, -0.6] },
    { geo: new THREE.BoxGeometry(0.15, 0.3, 0.15), color: 0x88dd44, pos: [0.3, 1.2, -0.6] },
  ];

  const objects = specs.map(({ geo, color, pos }) => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color }));
    mesh.position.set(...pos);
    scene.add(mesh);
    return mesh;
  });

  return { scene, objects };
}

// ---------------------------------------------------------------------------
/**
 * buildControllers(renderer, scene)
 *
 * Sets up both input sources. Each has two Object3Ds that track different
 * poses:
 *   - controller (renderer.xr.getController(i))     — the "target ray" pose,
 *     roughly where the controller is pointing. Visualized as a colored line.
 *   - grip (renderer.xr.getControllerGrip(i))        — the "grip" pose,
 *     roughly the physical hand position. Visualized as a small sphere.
 *
 * Controller 0 is red, controller 1 is blue, purely so you can tell them
 * apart on the headset and in the emulator. Neither color means "dominant" —
 * that's a convention you choose in your own two-hand logic.
 *
 * Does not wire selectstart/selectend — that happens in main(), pointing at
 * the STUDENT TODO handlers below.
 *
 * @returns {{ controller0, controller1, grip0, grip1 }}
 */
function buildControllers(renderer, scene) {
  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  function buildController(index) {
    const controller = renderer.xr.getController(index);
    const line = new THREE.Line(
      rayGeometry,
      new THREE.LineBasicMaterial({ color: index === 0 ? 0xff6666 : 0x66aaff })
    );
    line.name = "ray";
    line.scale.z = 1.5;
    controller.add(line);
    scene.add(controller);
    return controller;
  }

  function buildGrip(index) {
    const grip = renderer.xr.getControllerGrip(index);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 12, 8),
      new THREE.MeshBasicMaterial({ color: index === 0 ? 0xff6666 : 0x66aaff })
    );
    grip.add(marker);
    scene.add(grip);
    return grip;
  }

  return {
    controller0: buildController(0),
    controller1: buildController(1),
    grip0: buildGrip(0),
    grip1: buildGrip(1),
  };
}

// ---------------------------------------------------------------------------
/**
 * getIntersections(controller, objects)
 *
 * Provided raycasting helper. Casts a ray from `controller`'s current world
 * position along its local -Z axis (the direction the target-ray line
 * points) and returns every hit in `objects`, nearest first. Use this
 * inside your grab logic to find what a controller is currently pointing
 * at when `selectstart` fires.
 *
 * @returns {THREE.Intersection[]}
 */
function getIntersections(controller, objects) {
  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);

  const raycaster = new THREE.Raycaster();
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  return raycaster.intersectObjects(objects, false);
}

// ---------------------------------------------------------------------------
/**
 * setStatus(text, inVR)
 *
 * Provided. Small helper so STUDENT TODO code can report what it's doing
 * without touching the DOM directly. `inVR` just toggles the status pill's
 * color; it's a hint, not something the grading depends on.
 */
function setStatus(text, inVR = false) {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.toggle("in-vr", inVR);
}

// =====================================================================
// ===== STUDENT TODO: single-hand grab =================================
// =====================================================================
//
// Wired below (in main()) to both controllers' `selectstart` / `selectend`
// events. `event.target` is whichever controller (the target-ray Object3D)
// fired the event — NOT the grip. If you want to attach to the grip pose
// instead (per the "Attach to" HUD select and the lab's compare-both-poses
// exercise), you'll need to look up the matching grip Object3D yourself —
// `controller0`/`controllerGrip0` and `controller1`/`controllerGrip1` are
// in scope here as module-level variables.
//
// Fill in the two functions below (or replace them with your own design —
// the shape above is a hint, not a requirement).

function onSelectStart(event) {
  const controller = event.target;

  if(attachModeSelect.value === "ray") rayPoseStart(controller);
  else gripStart(controller);
}

function rayPoseStart(controller) {
  const hits = getIntersections(controller, grabbables);
  if(hits.length == 0) return;
  
  const object = hits[0].object;

  controller.attach(object);
  controller.userData.selected = object;
  object.userData.heldBy = controller;
}

function gripStart(controller) {
  const hits = getIntersections(controller, grabbables);
  if(hits.length == 0) return;

  const object = hits[0].object;

  controller.getWorldPosition(object.position);

  controller.attach(object);

  controller.userData.selected = object;
  object.userData.heldBy = controller;
}

function onSelectEnd(event) {
  const controller = event.target;
  const object = controller.userData.selected;
  if(!object) return;
  scene.attach(object);
  object.userData.heldBy = null;
  controller.userData.selected = null;
}

// ===== END STUDENT TODO ================================================


// =====================================================================
// ===== STUDENT TODO: two-handed scale and rotate =======================
// =====================================================================
//
// Called once per frame from the render loop (see animate() below). Only
// do anything while BOTH controllers have something selected — decide for
// yourself (and note in your README) whether that means the same object
// held by both hands, or two different objects.
//
// Worked example (distance drives scale, hand-to-hand vector drives
// orientation), from lab08.md:
//
// For the Guiard comparison (symmetric vs. asymmetric — see lab08.md and
// the #handMode HUD select), branch on `handModeSelect.value` and change
// which controller's motion is allowed to affect scale/rotation.

let twoHandState = null; // { distance, scale, direction } at gesture start

function updateTwoHandGesture() {
  const obj0 = controller0.userData.selected;
  const obj1 = controller1.userData.selected;
  const object = obj0 && obj1 && obj0 === obj1 ? obj0 : null;
  if (!object) { twoHandState = null; return; }

  if(handModeSelect.value === "symmetric") symmetric(object);
  else asymmetric(object);
}

function symmetric(obj) {
  const p1 = controller0.position, p2 = controller1.position;
  const distance = p1.distanceTo(p2);
  const direction = new THREE.Vector3().subVectors(p2, p1).normalize();

  if(!twoHandState) {
    twoHandState = { distance, scale: obj.scale.x, direction: direction.clone() };
    return;
  }

  const scaleFactor = distance / twoHandState.distance;
  obj.scale.setScalar(twoHandState.scale * scaleFactor);
  obj.quaternion.setFromUnitVectors(twoHandState.direction, direction);
}

function asymmetric(obj) {
  const p1 = controller0.position, p2 = controller1.position;
  const p1Dist = p1.distanceTo(obj.position);
  const direction = new THREE.Vector3().subVectors(p1, obj.position).normalize()
  
  if(!twoHandState) {
    twoHandState = { distance: p1Dist, scale: obj.scale.x, direction: direction.clone() };
    return;
  }
  
  const scaleFactor = p1Dist / twoHandState.distance;
  obj.scale.setScalar(twoHandState.scale * scaleFactor);
  obj.quaternion.setFromUnitVectors(twoHandState.direction, direction)
}

// ===== END STUDENT TODO ================================================

// call main()
main();
