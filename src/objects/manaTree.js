import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { interactionManager } from '../systems/interactionManager.js';
import { scene } from '../scene.js';
import { getTerrainHeightAt } from '../map/map.js';
import { LeafSiphonFX } from '../particles/LeafSiphonFX.js';
import { gameManager } from '../managers/gameManager.js';

const _fbxLoader = new FBXLoader();
const _texLoader = new THREE.TextureLoader();

function loadTex(path, { srgb = false, repeat = 1, anisotropy = 8 } = {}) {
  if (!path) return null;
  const t = _texLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  return t;
}

function makeTrunkMat(dir = '/textures/manaTree') {
  const map        = loadTex(`${dir}/trunk_diffuse.png`,   { srgb: true });
  const normalMap  = loadTex(`${dir}/trunk_normal.png`);
  const roughness  = loadTex(`${dir}/trunk_roughness.png`);
  const ao         = loadTex(`${dir}/trunk_ao.png`);
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap: roughness, aoMap: ao,
    roughness: 0.9, metalness: 0.0, envMapIntensity: 1.0,
  });
  if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
  return mat;
}

function makeLeavesMat(dir = '/textures/manaTree', { alphaTest = 0.5, shininess = 28 } = {}) {
  const diffuseMap   = loadTex(`${dir}/leaves_diffuse.png`,  { srgb: true });
  const alphaMap     = loadTex(`${dir}/leaves_alpha.png`);
  const specularMap  = loadTex(`${dir}/leaves_specular.png`);

  const mat = new THREE.MeshPhongMaterial({
    map: diffuseMap,
    alphaMap,
    specularMap,
    transparent: true,
    alphaTest,
    side: THREE.DoubleSide,
    depthWrite: false,
    shininess,
    specular: new THREE.Color(0x88aab0),
  });
  if (mat.map)         mat.map.colorSpace = THREE.SRGBColorSpace;
  if (mat.specularMap) mat.specularMap.colorSpace = THREE.LinearSRGBColorSpace;
  if (mat.alphaMap)    mat.alphaMap.colorSpace    = THREE.LinearSRGBColorSpace;
  return mat;
}

function makeGlow(color = 0x27e8a7) {
  const g = new THREE.SphereGeometry(0.9, 16, 12);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(0, 2.4, 0);
  return mesh;
}

function applyTreeMaterialsToNode(node, trunkMat, leavesMat, { debug = false } = {}) {
  if (!node.isMesh) return;

  const applySingle = () => {
    const name  = (node.name || '').toLowerCase();
    const mname = (node.material?.name || '').toLowerCase();
    const isLeaves = name.includes('leaf') || name.includes('leaves') || name.includes('foliage') || mname.includes('leaf');
    const isTrunk  = name.includes('trunk') || name.includes('bark')   || name.includes('wood')    || mname.includes('trunk') || mname.includes('bark');

    if (isLeaves) node.material = leavesMat;
    else if (isTrunk) node.material = trunkMat;
    else {
      const attr = node.geometry?.attributes?.position;
      const isLikelyLeaf = attr && attr.count < 5000;
      node.material = isLikelyLeaf ? leavesMat : trunkMat;
    }
  };

  if (Array.isArray(node.material)) {
    const original = node.material;
    const remapped = original.map((m, i) => {
      const nm = (m?.name || '').toLowerCase();
      if (nm.includes('leaf') || nm.includes('leaves') || nm.includes('foliage')) return leavesMat;
      if (nm.includes('trunk') || nm.includes('bark') || nm.includes('wood'))     return trunkMat;
      return i === 0 ? trunkMat : leavesMat;
    });
    node.material = remapped;
    if (debug) console.debug('[ManaTree] remap MultiMaterial:', node.name, original.map(m=>m?.name), '→', remapped.map(m=>m.type));
  } else {
    applySingle();
    if (debug) console.debug('[ManaTree] remap material:', node.name, node.material?.name, '→', node.material?.type);
  }

  node.castShadow = true;
  node.receiveShadow = true;
}

export class ManaTree {
  constructor(pos = new THREE.Vector3(), opts = {}) {
    this.maxEssence      = opts.maxEssence      ?? 150;
    this.regenPerSec     = opts.regenPerSec     ?? 4;
    this.drainPerSec     = opts.drainPerSec     ?? 30;
    this.emptyCooldown   = opts.emptyCooldown   ?? 30;
    this.minInteractDist = opts.minInteractDist ?? 3.0;

    this.currentEssence = this.maxEssence;
    this.cooldown = 0;
    this.scale        = opts.scale ?? 0.01;
    this.anchorHeight = opts.anchorHeight ?? 3.2;
    this._time = 0;

    this.group = new THREE.Group();
    this.group.position.copy(pos);
    this.group.scale.setScalar(this.scale);

    this.glow = makeGlow(opts.glowColor ?? 0x27e8a7);
    this.group.add(this.glow);
    this.glowPulse = (opts.glowPulse ?? true);

    this.anchor = new THREE.Object3D();
    this.anchor.position.set(0, this.anchorHeight, 0);
    this.group.add(this.anchor);

    this.fx = new LeafSiphonFX(scene);
    this._isDraining = false;
    this._drainController = null;
    const dir = opts.texturesDir || '/textures/manaTree';
    this.trunkMaterial  = opts.trunkMaterial  || makeTrunkMat(dir);
    this.leavesMaterial = opts.leavesMaterial || makeLeavesMat(dir, { alphaTest: opts.alphaTest ?? 0.5 });
    this._leafOpacity      = 1.0;
    this._leafOpacityMin   = 0.35;
    this._leafOpacityLerpK = 5.0; 
    this.modelPath = opts.modelUrl || '/models/environment/mana_tree.fbx';
    this.model = null;
    this.isLoaded = false;
    this._debugMaterials = !!opts.debugMaterials;
  }

  async load() {
    const root = await _fbxLoader.loadAsync(this.modelPath);
    this.model = root;
    this.model.position.set(0, 0, 0);
    this.model.scale.setScalar(1);

    this.model.traverse((n) => applyTreeMaterialsToNode(n, this.trunkMaterial, this.leavesMaterial, { debug: this._debugMaterials }));

    this.group.add(this.model);
    this.isLoaded = true;
    return this;
  }

  registerInteraction() {
    interactionManager.register({
      getWorldPosition: (out = new THREE.Vector3()) => {
        const p = this.group?.position;
        return out.copy(p);
      },
      canInteract: () => {
        return (this.cooldown <= 0) && (this.currentEssence > 0);
      },
      getPrompt: () => {
        if (this._isDraining) return { key: 'E', text: 'Stop absorbing' };
        if (this.cooldown > 0) return { key: null, text: 'Empty Tree(Charging)' };
        return { key: 'E', text: 'Absorb mana' };
      },
      onInteract: () => {
        if (this._isDraining) { this.stopDrain(); return; }
        this.startDrain();
      }
    });
  }

  startDrain() {
    if (this._isDraining || this.cooldown > 0 || this.currentEssence <= 0) return;
    const controller = gameManager?.controller;
    const player = controller?.player?.model;
    if (!player) return;
    const d = player.position.distanceTo(this.group.position);
    if (d > this.minInteractDist) return;

    this._isDraining = true;
    this._drainController = controller;
    this.fx.start(player, this.anchor);
  }

  stopDrain() {
    if (!this._isDraining) return;
    this._isDraining = false;
    this._drainController = null;
    this.fx.stop();
  }

  update(delta) {
    if (this.cooldown > 0) {
      this.cooldown -= delta;
      if (this.cooldown < 0) this.cooldown = 0;
    } else if (!this._isDraining && this.currentEssence < this.maxEssence) {
      this.currentEssence = Math.min(this.maxEssence, this.currentEssence + this.regenPerSec * delta);
    }
    if (this._isDraining) {
      const player = this._drainController?.player?.model;
      if (!player) {
        this.stopDrain();
      } else {
        const dist = player.position.distanceTo(this.group.position);
        if (dist > this.minInteractDist + 0.75) {
          this.stopDrain();
        } else if (this.cooldown <= 0 && this.currentEssence > 0) {
          if (gameManager?.controller?.stats?.regenMana) {
            gameManager.controller.stats.regenMana(delta, this.drainPerSec);
          }
          const amount = Math.min(this.drainPerSec * delta, this.currentEssence);
          if (amount > 0) {
            this.currentEssence -= amount;

            if (this.currentEssence <= 0) {
              this.currentEssence = 0;
              this.cooldown = this.emptyCooldown;
              this.stopDrain();
            }
          }
        }
      }
    }
    const ratio = this.getEssenceRatio();
    const targetOpacity = this._leafOpacityMin + (1.0 - this._leafOpacityMin) * ratio;
    this._leafOpacity += (targetOpacity - this._leafOpacity) * Math.min(1, delta * this._leafOpacityLerpK);
    if (this.leavesMaterial) {
      this.leavesMaterial.opacity = this._leafOpacity;
      this.leavesMaterial.transparent = true;
      this.leavesMaterial.depthWrite = false;
    }

    this.fx.update(delta);
    this._time += delta;
    if (this.glowPulse && this.glow?.material) {
      this.glow.material.opacity = 0.25 + 0.15 * (0.5 + 0.5 * Math.sin(this._time * 2.5));
    }
  }

  getEssenceRatio() {
    return this.maxEssence > 0 ? this.currentEssence / this.maxEssence : 0;
  }

  dispose() {
    this.stopDrain();
    if (this.group?.parent) this.group.parent.remove(this.group);
    this.group.traverse((n) => {
      if (n.isMesh) {
        n.geometry?.dispose?.();
      }
    });
  }
}

export const manaTrees = [];

export async function spawnManaTreeAt(x, z, opts = {}) {
  const yoffset = opts.yoffset ?? 0;
  const y = getTerrainHeightAt(x, z) + yoffset;
  const mt = new ManaTree(new THREE.Vector3(x, y, z), opts);
  await mt.load();
  scene.add(mt.group);
  mt.registerInteraction();
  manaTrees.push(mt);
  return mt;
}

export function updateManaTrees(delta) {
  for (const t of manaTrees) t.update(delta);
}

export function disposeAllManaTrees() {
  while (manaTrees.length) {
    const t = manaTrees.pop();
    t.dispose();
  }
}
