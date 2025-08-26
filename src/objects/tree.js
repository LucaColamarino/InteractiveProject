// TreeSpawner.js — versione semplice: opacità foglie proporzionale alla density (senza shader hook)
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class TreeSpawner {
  constructor({
    scene,
    getTerrainHeightAt,
    textures = {
      bark: {
        map: '/textures/tree/bark_diffuse.png',
        normalMap: '/textures/tree/bark_normal.png',
        roughnessMap: '/textures/tree/bark_roughness.png'
      },
      leaf: {
        map: '/textures/tree/leaf_diffuse.png',
        normalMap: '/textures/tree/leaf_normal.png',
        alphaMap: '/textures/tree/leaf_alpha.png'
      }
    },
    yoffset = -1,
    baseScale = 0.01,
    randomScaleRange = [0.8, 1.2],
    alphaTest = 0.5,
    anisotropy = 8,
    castShadow = true,
    receiveShadow = true,
    defaultBarkMaterialIndex = 0,
    maxInstancesPerBatch = 1000,
    useGeometryPooling = true,
    enableLOD = true,
    lodDistances = [60, 140, 260, 400],
    lodHysteresis = 15,
    frustumCulling = true,
    cellSize = 120,
    updateThrottleMs = 16,
    useSpatialHashing = true,
    enableOcclusion = true,     // (placeholder per future occlusion)
    maxVisibleInstances = 5000,
    shadowLODSettings = {
      castShadow: ['L1'],
      receiveShadow: ['L1', 'L2']
    },
  } = {}) {
    if (!scene) throw new Error('TreeSpawner: "scene" è richiesto.');
    if (!getTerrainHeightAt) throw new Error('TreeSpawner: "getTerrainHeightAt" è richiesto.');

    // config
    this.scene = scene;
    this.getTerrainHeightAt = getTerrainHeightAt;
    this.yoffset = yoffset;
    this.baseScale = baseScale;
    this.randomScaleRange = randomScaleRange;
    this.defaultBarkMaterialIndex = defaultBarkMaterialIndex;
    this.maxInstancesPerBatch = maxInstancesPerBatch;
    this.useGeometryPooling = useGeometryPooling;
    this.enableLOD = enableLOD;
    this.lodDistances = lodDistances;
    this.lodHysteresis = lodHysteresis;
    this.frustumCulling = frustumCulling;
    this.cellSize = cellSize;
    this.updateThrottleMs = updateThrottleMs;
    this.useSpatialHashing = useSpatialHashing;
    this.enableOcclusion = enableOcclusion;
    this.maxVisibleInstances = maxVisibleInstances;
    this.shadowLODSettings = shadowLODSettings;
    this.anisotropy = anisotropy;

    // loaders & caches
    this.loader = new FBXLoader();
    this.textureLoader = new THREE.TextureLoader();
    this._modelCache = new Map();
    this._geometryPool = new Map();
    this._batches = [];
    this._spatialGrid = new Map();

    // stats
    this._stats = { visibleInstances: 0, culledInstances: 0, lodSwitches: 0, lastUpdateTime: 0 };

    // materials
    const bark = this._loadTexSet(textures.bark, this.anisotropy);
    const leaf = this._loadTexSet(textures.leaf, this.anisotropy);

    this.barkMaterial = new THREE.MeshStandardMaterial({
      map: bark.map || null,
      normalMap: bark.normalMap || null,
      roughness: 1,
      roughnessMap: bark.roughnessMap || null,
      fog: true,
      dithering: true
    });

    this.leafMaterial = new THREE.MeshStandardMaterial({
      map: leaf.map || null,
      normalMap: leaf.normalMap || null,
      alphaMap: leaf.alphaMap || null,
      transparent: true,
      opacity: 1.0,
      alphaTest,
      side: THREE.DoubleSide,
      depthWrite: false,         // importante con alpha
      fog: true,
      dithering: true,
      premultipliedAlpha: false
    });

    if (this.barkMaterial.map) this.barkMaterial.map.colorSpace = THREE.SRGBColorSpace;
    if (this.leafMaterial.map) this.leafMaterial.map.colorSpace = THREE.SRGBColorSpace;

    // opacità globale foglie (pilotata dal game)
    this._leafOpacity = 1.0;
    this.setLeafGlobalOpacity = (opacity) => {
      console.log("SET LEAFT OPACITY", opacity);
      const o = Math.min(1, Math.max(0, opacity));
      if (o === this._leafOpacity) return;
      this._leafOpacity = o;
      this.leafMaterial.opacity = o;
      this.leafMaterial.needsUpdate = true;
    };

    // shadow flags
    this._castShadow = castShadow;
    this._receiveShadow = receiveShadow;

    // temp objects
    this._pos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._eulerY = new THREE.Euler(0, 0, 0, 'YXZ');
    this._camWorld = new THREE.Vector3();
    this._camPrevWorld = new THREE.Vector3();
    this._closest = new THREE.Vector3();
    this._frustum = new THREE.Frustum();
    this._matrix = new THREE.Matrix4();
    this._box3Temp = new THREE.Box3();

    // debug
    this._debug = { enabled: false, helpers: [], showStats: false, showSpatialGrid: false };
    this._lastLODUpdate = 0;
    this._pendingLODUpdate = false;
  }

  // ========= Utilities =========
  _loadTex(path) {
    if (!path) return null;
    const t = this.textureLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy || 8;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    return t;
  }

  _loadTexSet(set = {}, anisotropy = 8) {
    const out = {};
    for (const k of Object.keys(set || {})) {
      const tex = this._loadTex(set[k]);
      if (tex) tex.anisotropy = anisotropy;
      out[k] = tex;
    }
    return out;
  }

  _rand(a, b) { return a + Math.random() * (b - a); }
  _randScale() { const [mi, ma] = this.randomScaleRange; return this._rand(mi, ma) * this.baseScale; }

  _getSpatialKey(x, z) {
    const gridSize = this.cellSize * 2;
    return `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
  }

  getNearbyTrees(x, z, radius = 8) {
    const key = this._getSpatialKey(x, z);
    const nearbyKeys = this._getNearbyKeys(key, radius);
    const out = [];
    for (const k of nearbyKeys) {
      if (this._spatialGrid.has(k)) {
        for (const pos of this._spatialGrid.get(k)) out.push(pos);
      }
    }
    return out;
  }

  findClosestTree(x, z, maxDist = 4) {
    let best = null;
    let bestD2 = (maxDist * maxDist);
    const candidates = this.getNearbyTrees(x, z, Math.max(8, maxDist * 2));
    for (const p of candidates) {
      const dx = p.x - x;
      const dz = p.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) { best = p; bestD2 = d2; }
    }
    return best; // { x, z, matrix, lodLevel } | null
  }

  // ========= Geometry extraction / cache =========
  _extractGroupGeometry(srcGeom, group) {
    const poolKey = `${srcGeom.uuid}_${group.start}_${group.count}_${group.materialIndex}`;
    if (this.useGeometryPooling && this._geometryPool.has(poolKey)) {
      return this._geometryPool.get(poolKey).clone();
    }

    const geom = new THREE.BufferGeometry();

    // attributes
    for (const name of ['position', 'normal', 'uv']) {
      if (srcGeom.attributes[name]) geom.setAttribute(name, srcGeom.attributes[name].clone());
    }

    // indices
    const index = srcGeom.getIndex();
    if (index) {
      const sub = index.array.slice(group.start, group.start + group.count);
      geom.setIndex(new THREE.BufferAttribute(sub, 1));
    } else {
      const sub = new Uint32Array(group.count);
      const off = group.start;
      for (let i = 0; i < group.count; i++) sub[i] = off + i;
      geom.setIndex(new THREE.BufferAttribute(sub, 1));
    }

    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    geom.computeVertexNormals();

    if (this.useGeometryPooling) this._geometryPool.set(poolKey, geom.clone());
    return geom;
  }

  async _getMergedGeometries(modelPath, barkIndex) {
    const key = `${modelPath}__bm:${barkIndex}`;
    if (this._modelCache.has(key)) return this._modelCache.get(key);

    const fbx = await this.loader.loadAsync(modelPath);
    const bakeRot = new THREE.Matrix4().makeRotationX(0);

    const barkParts = [], leafParts = [], meshes = [];
    fbx.updateMatrixWorld(true);
    fbx.traverse(child => {
      if ((child.isMesh || child.isSkinnedMesh) && child.geometry) meshes.push(child);
    });

    for (const child of meshes) {
      const g = child.geometry.clone();
      child.updateWorldMatrix(true, false);
      g.applyMatrix4(child.matrixWorld);
      g.applyMatrix4(bakeRot);

      const groups = (g.groups?.length
        ? g.groups
        : [{ start: 0, count: (g.getIndex()?.count ?? g.attributes.position.count), materialIndex: 0 }]);

      for (const gr of groups) {
        const sub = this._extractGroupGeometry(g, gr);
        if (gr.materialIndex === barkIndex) barkParts.push(sub);
        else leafParts.push(sub);
      }
    }

    const barkGeom = barkParts.length ? BufferGeometryUtils.mergeGeometries(barkParts, false) : new THREE.BufferGeometry();
    const leafGeom = leafParts.length ? BufferGeometryUtils.mergeGeometries(leafParts, false) : new THREE.BufferGeometry();

    if (barkGeom.attributes.position) { barkGeom.computeBoundingSphere(); barkGeom.computeBoundingBox(); }
    if (leafGeom.attributes.position) { leafGeom.computeBoundingSphere(); leafGeom.computeBoundingBox(); }

    const merged = { barkGeom, leafGeom };
    this._modelCache.set(key, merged);
    return merged;
  }

  // ========= Spawning =========
  async spawn(modelPath, count, area, opts = {}) {
    const barkIndex = (opts.barkMaterialIndex ?? this.defaultBarkMaterialIndex) | 0;
    const { barkGeom, leafGeom } = await this._getMergedGeometries(modelPath, barkIndex);

    const hasBark = !!(barkGeom && barkGeom.attributes?.position);
    const hasLeaf = !!(leafGeom && leafGeom.attributes?.position);
    if (!hasBark && !hasLeaf) return;

    // 1) build matrices & positions
    const matrices = [];
    const positions = [];
    for (let i = 0; i < count; i++) {
      const x = area.x + Math.random() * area.width - area.width / 2;
      const z = area.z + Math.random() * area.depth - area.depth / 2;
      const y = this.getTerrainHeightAt(x, z) + this.yoffset;

      const s = this._randScale();
      this._pos.set(x, y, z);
      this._eulerY.set(0, this._rand(0, Math.PI * 2), 0);
      this._quat.setFromEuler(this._eulerY);
      this._scale.set(s, s, s);

      const matrix = new THREE.Matrix4().compose(this._pos.clone(), this._quat.clone(), this._scale.clone());
      matrices.push(matrix);
      positions.push({ x, z, matrix, lodLevel: 'L1' });
    }

    // 2) spatial hashing
    if (this.useSpatialHashing) {
      for (const pos of positions) {
        const key = this._getSpatialKey(pos.x, pos.z);
        if (!this._spatialGrid.has(key)) this._spatialGrid.set(key, []);
        this._spatialGrid.get(key).push(pos);
      }
    }

    // 3) cell binning
    const cs = this.cellSize;
    const cellMap = new Map();
    for (const matrix of matrices) {
      const p = this._tmp.setFromMatrixPosition(matrix);
      const cx = Math.floor((p.x - (area.x - area.width / 2)) / cs);
      const cz = Math.floor((p.z - (area.z - area.depth / 2)) / cs);
      const key = `${cx},${cz}`;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key).push(matrix);
    }

    // 4) batches
    for (const mats of cellMap.values()) {
      for (let off = 0; off < mats.length; off += this.maxInstancesPerBatch) {
        const chunk = mats.slice(off, off + this.maxInstancesPerBatch);
        await this._createBatch(chunk, hasBark, hasLeaf, barkGeom, leafGeom);
      }
    }
  }

  async _createBatch(matrices, hasBark, hasLeaf, barkGeom, leafGeom) {
    const barkIMesh = hasBark ? new THREE.InstancedMesh(barkGeom, this.barkMaterial, matrices.length) : null;
    const leafIMesh = hasLeaf ? new THREE.InstancedMesh(leafGeom, this.leafMaterial, matrices.length) : null;

    const applyMatrices = (mesh, mats) => {
      if (!mesh) return;
      mesh.count = mats.length;
      for (let i = 0; i < mats.length; i++) mesh.setMatrixAt(i, mats[i]);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = this._castShadow;
      mesh.receiveShadow = this._receiveShadow;
      mesh.frustumCulled = this.frustumCulling;
      if (mesh.material) mesh.material.needsUpdate = true;
    };

    applyMatrices(barkIMesh, matrices);
    applyMatrices(leafIMesh, matrices);

    if (barkIMesh) this.scene.add(barkIMesh);
    if (leafIMesh) this.scene.add(leafIMesh);

    // batch bounds
    const box = new THREE.Box3().makeEmpty();
    for (const m of matrices) box.expandByPoint(this._tmp.setFromMatrixPosition(m));
    const avgScale = this.baseScale * (this.randomScaleRange[0] + this.randomScaleRange[1]) / 2;
    box.expandByScalar(avgScale * 10);

    const center = new THREE.Vector3();
    box.getCenter(center);

    const debugHelpers = this._createDebugHelpers(box, center);

    // LOD matrices
    const createLODLevel = (mats, targetReduction) => {
      if (mats.length <= 4) return mats;
      const targetCount = Math.max(1, Math.floor(mats.length * targetReduction));
      const step = mats.length / targetCount;
      const result = [];
      for (let i = 0; i < targetCount; i++) {
        const index = Math.floor(i * step);
        if (index < mats.length) result.push(mats[index]);
      }
      return result;
    };

    const lodMatrices = {
      L1: matrices,
      L2: createLODLevel(matrices, 0.7),
      L3: createLODLevel(matrices, 0.4),
      L4: createLODLevel(matrices, 0.2)
    };

    this._batches.push({
      barkIMesh, leafIMesh,
      matrices: lodMatrices,
      center, box,
      _lod: 'L1',
      _prevLod: 'L1',
      visible: true,
      lastDistance: Infinity,
      debug: debugHelpers,
      stats: { switches: 0, lastSwitch: 0 }
    });

    if (this._debug.enabled) {
      console.log('Batch created with LOD levels:', {
        L1: lodMatrices.L1.length,
        L2: lodMatrices.L2.length,
        L3: lodMatrices.L3.length,
        L4: lodMatrices.L4.length
      });
    }
  }

  _createDebugHelpers(box, center) {
    if (!this._debug.enabled) return null;

    const baseHelper = new THREE.Box3Helper(box, 0x00ffff);
    baseHelper.visible = false;
    this.scene.add(baseHelper);
    this._debug.helpers.push(baseHelper);

    const shells = [];
    const colors = [0x00ff00, 0xffff00, 0xff8800, 0xff0000];
    for (let i = 0; i < this.lodDistances.length; i++) {
      const shell = box.clone();
      shell.expandByScalar(this.lodDistances[i]);
      const helper = new THREE.Box3Helper(shell, colors[i % colors.length]);
      helper.visible = false;
      this.scene.add(helper);
      shells.push({ box: shell, helper });
      this._debug.helpers.push(helper);
    }

    // closest marker
    const closestGeom = new THREE.SphereGeometry(1.2, 8, 8);
    const closestMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const closestMesh = new THREE.Mesh(closestGeom, closestMat);
    closestMesh.visible = false;
    this.scene.add(closestMesh);
    this._debug.helpers.push(closestMesh);

    // line camera → closest
    const lineGeom = new THREE.BufferGeometry().setFromPoints([center, center]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(lineGeom, lineMat);
    line.visible = false;
    this.scene.add(line);
    this._debug.helpers.push(line);

    return { baseHelper, shells, closestMesh, line };
  }

  // ========= LOD =========
  updateLOD(camera) {
    if (!this.enableLOD || !camera || !this._batches || this._batches.length === 0) {
      if (this._debug.enabled) {
        console.log('UpdateLOD: early return', { enableLOD: this.enableLOD, hasCamera: !!camera, batchCount: this._batches?.length });
      }
      return;
    }

    const now = performance.now();
    if (!this._debug.enabled && now - this._lastLODUpdate < this.updateThrottleMs) {
      return;
    }
    this._lastLODUpdate = now;

    camera.getWorldPosition(this._camWorld);

    // movimento camera (no reassign bug)
    const cameraMoved = this._camWorld.distanceTo(this._camPrevWorld) > 1.0;
    this._camPrevWorld.copy(this._camWorld);

    if (this._debug.enabled) {
      console.log('UpdateLOD called:', { now, lastUpdate: this._lastLODUpdate, cameraMoved, cameraPos: this._camWorld.toArray() });
    }

    if (this.frustumCulling) {
      this._frustum.setFromProjectionMatrix(
        this._matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
    }

    const [L1, L2, L3, L4] = this.lodDistances;
    const H = this.lodHysteresis;

    let totalVisible = 0;
    const batchesToUpdate = [];

    for (const batch of this._batches) {
      const distance = batch.box.distanceToPoint(this._camWorld);

      if (this.frustumCulling && !this._frustum.intersectsBox(batch.box)) {
        if (batch.visible) this._setBatchVisibility(batch, false);
        continue;
      }

      if (!cameraMoved && Math.abs(distance - batch.lastDistance) < 5) {
        if (batch.visible) totalVisible += this._getBatchInstanceCount(batch);
        continue;
      }

      batch.lastDistance = distance;
      batchesToUpdate.push({ batch, distance });
    }

    batchesToUpdate.sort((a, b) => a.distance - b.distance);

    for (const { batch, distance } of batchesToUpdate) {
      const newLod = this._calculateLOD(batch._lod, distance, L1, L2, L3, L4, H);

      if (newLod !== batch._lod) {
        this._switchLOD(batch, newLod);
        this._stats.lodSwitches++;
      }

      if (batch.visible) {
        totalVisible += this._getBatchInstanceCount(batch);
      }

      if (totalVisible > this.maxVisibleInstances) {
        this._setBatchVisibility(batch, false);
      }

      this._updateDebugHelpers(batch, distance);
    }

    this._stats.visibleInstances = totalVisible;
    this._stats.culledInstances = this._batches.length * this.maxInstancesPerBatch - totalVisible;
  }

  _calculateLOD(currentLOD, distance, L1, L2, L3, L4, hysteresis) {
    switch (currentLOD) {
      case 'L1':
      default:
        if (distance > L4) return 'OFF';
        if (distance > L3) return 'L4';
        if (distance > L2) return 'L3';
        if (distance > L1) return 'L2';
        return 'L1';
      case 'L2':
        if (distance > L4) return 'OFF';
        if (distance > L3) return 'L4';
        if (distance > L2 + hysteresis) return 'L3';
        if (distance < L1 - hysteresis) return 'L1';
        return 'L2';
      case 'L3':
        if (distance > L4) return 'OFF';
        if (distance > L3 + hysteresis) return 'L4';
        if (distance < L2 - hysteresis) return (distance < L1 - hysteresis ? 'L1' : 'L2');
        return 'L3';
      case 'L4':
        if (distance > L4 + hysteresis) return 'OFF';
        if (distance < L3 - hysteresis) return (distance < L2 - hysteresis ? (distance < L1 - hysteresis ? 'L1' : 'L2') : 'L3');
        return 'L4';
      case 'OFF':
        if (distance < L4 - hysteresis) return 'L4';
        if (distance < L3 - hysteresis) return 'L3';
        if (distance < L2 - hysteresis) return 'L2';
        if (distance < L1 - hysteresis) return 'L1';
        return 'OFF';
    }
  }

  _switchLOD(batch, newLod) {
    if (batch._lod === newLod) return;

    batch._prevLod = batch._lod;
    batch._lod = newLod;
    batch.stats.switches++;
    batch.stats.lastSwitch = performance.now();

    const isVisible = newLod !== 'OFF';

    if (isVisible) {
      this._setBatchVisibility(batch, true);
      const matrices = batch.matrices[newLod] || batch.matrices.L1;
      this._updateBatchInstances(batch.barkIMesh, matrices);
      this._updateBatchInstances(batch.leafIMesh, matrices);

      const enableShadowCasting = this.shadowLODSettings.castShadow.includes(newLod);
      const enableShadowReceiving = this.shadowLODSettings.receiveShadow.includes(newLod);

      if (batch.barkIMesh) {
        batch.barkIMesh.castShadow = enableShadowCasting && this._castShadow;
        batch.barkIMesh.receiveShadow = enableShadowReceiving && this._receiveShadow;
      }
      if (batch.leafIMesh) {
        batch.leafIMesh.castShadow = enableShadowCasting && this._castShadow;
        batch.leafIMesh.receiveShadow = enableShadowReceiving && this._receiveShadow;
      }
    } else {
      this._setBatchVisibility(batch, false);
    }
  }

  _setBatchVisibility(batch, visible) {
    batch.visible = visible;
    if (batch.barkIMesh) {
      batch.barkIMesh.visible = visible;
      if (visible) batch.barkIMesh.instanceMatrix.needsUpdate = true;
    }
    if (batch.leafIMesh) {
      batch.leafIMesh.visible = visible;
      if (visible) batch.leafIMesh.instanceMatrix.needsUpdate = true;
    }
  }

  _updateBatchInstances(mesh, matrices) {
    if (!mesh || !matrices) return;
    mesh.count = matrices.length;
    const identity = new THREE.Matrix4();
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i] || identity);
    mesh.instanceMatrix.needsUpdate = true;
  }

  _getBatchInstanceCount(batch) {
    const lodKey = batch._lod === 'OFF' ? 'L1' : batch._lod;
    return batch.matrices[lodKey]?.length || 0;
  }

  _updateDebugHelpers(batch, distance) {
    if (!this._debug.enabled || !batch.debug) return;
    batch.box.clampPoint(this._camWorld, this._closest);
    batch.debug.closestMesh.position.copy(this._closest);

    const points = [this._camWorld.clone(), this._closest.clone()];
    batch.debug.line.geometry.setFromPoints(points);

    const visible = this._debug.enabled;
    batch.debug.baseHelper.visible = visible;
    batch.debug.closestMesh.visible = visible;
    batch.debug.line.visible = visible;

    for (const shell of batch.debug.shells) {
      shell.helper.visible = visible;
    }
  }

  // ========= Debug / Tools =========
  setDebugLOD(enabled) {
    this._debug.enabled = !!enabled;
    console.log(`TreeSpawner debug ${enabled ? 'enabled' : 'disabled'}`);
    for (const batch of this._batches) {
      if (!batch.debug) continue;
      batch.debug.baseHelper.visible = this._debug.enabled;
      batch.debug.closestMesh.visible = this._debug.enabled;
      batch.debug.line.visible = this._debug.enabled;
      for (const shell of batch.debug.shells) shell.helper.visible = this._debug.enabled;
    }
  }

  debugLODInfo(camera) {
    if (!camera || this._batches.length === 0) return;
    camera.getWorldPosition(this._camWorld);
    console.group('LOD Debug Info');
    console.log(`Camera position: ${this._camWorld.x.toFixed(1)}, ${this._camWorld.y.toFixed(1)}, ${this._camWorld.z.toFixed(1)}`);
    console.log(`Total batches: ${this._batches.length}`);
    console.log(`LOD distances: [${this.lodDistances.join(', ')}]`);
    console.log(`Hysteresis: ${this.lodHysteresis}`);
    let visibleCount = 0;
    for (let i = 0; i < Math.min(5, this._batches.length); i++) {
      const batch = this._batches[i];
      const distance = batch.box.distanceToPoint(this._camWorld);
      console.log(`Batch ${i}: LOD=${batch._lod}, distance=${distance.toFixed(1)}, visible=${batch.visible}, instances=${this._getBatchInstanceCount(batch)}`);
      if (batch.visible) visibleCount++;
    }
    console.log(`Visible batches: ${visibleCount}/${this._batches.length}`);
    console.groupEnd();
  }

  getStats() {
    return {
      ...this._stats,
      totalBatches: this._batches.length,
      geometriesPooled: this._geometryPool.size,
      modelsLoaded: this._modelCache.size
    };
  }

  optimizeMemory() {
    if (this._geometryPool.size > 100) {
      const toDelete = [];
      for (const [key, geom] of this._geometryPool) {
        if (Math.random() > 0.8) { geom.dispose(); toDelete.push(key); }
      }
      for (const key of toDelete) this._geometryPool.delete(key);
    }
  }

  clear() {
    for (const batch of this._batches) {
      if (batch.barkIMesh?.parent) batch.barkIMesh.parent.remove(batch.barkIMesh);
      if (batch.leafIMesh?.parent) batch.leafIMesh.parent.remove(batch.leafIMesh);

      if (batch.debug) {
        batch.debug.baseHelper?.parent?.remove(batch.debug.baseHelper);
        batch.debug.closestMesh?.parent?.remove(batch.debug.closestMesh);
        batch.debug.line?.parent?.remove(batch.debug.line);
        for (const shell of batch.debug.shells || []) shell.helper?.parent?.remove(shell.helper);
      }

      if (!this.useGeometryPooling) {
        batch.barkIMesh?.geometry?.dispose();
        batch.leafIMesh?.geometry?.dispose();
      }
    }

    this._batches.length = 0;
    this._spatialGrid.clear();
    this._stats.visibleInstances = 0;
    this._stats.culledInstances = 0;
    this._stats.lodSwitches = 0;
  }

  dispose() {
    this.clear();

    const disposeMaterial = (mat) => {
      if (!mat) return;
      ['map', 'normalMap', 'alphaMap', 'roughnessMap'].forEach(prop => {
        if (mat[prop]?.dispose) { mat[prop].dispose(); mat[prop] = null; }
      });
      mat.dispose();
    };

    disposeMaterial(this.barkMaterial);
    disposeMaterial(this.leafMaterial);

    for (const geom of this._geometryPool.values()) geom.dispose();
    this._geometryPool.clear();

    this._modelCache.clear();

    for (const helper of this._debug.helpers) {
      if (helper.parent) helper.parent.remove(helper);
      if (helper.geometry) helper.geometry.dispose();
      if (helper.material) helper.material.dispose();
    }
    this._debug.helpers.length = 0;

    this._spatialGrid.clear();
  }

  // ========= Spatial LOD =========
  updateLODSpatial(camera, radius = 500) {
    if (!this.enableLOD || !camera || !this.useSpatialHashing || !this._batches.length) {
      return this.updateLOD(camera);
    }

    camera.getWorldPosition(this._camWorld);
    const spatialKey = this._getSpatialKey(this._camWorld.x, this._camWorld.z);

    const nearbyKeys = this._getNearbyKeys(spatialKey, radius);
    const nearbyBatches = [];

    for (const key of nearbyKeys) {
      if (this._spatialGrid.has(key)) {
        for (const batch of this._batches) {
          const batchKey = this._getSpatialKey(batch.center.x, batch.center.z);
          if (batchKey === key) nearbyBatches.push(batch);
        }
      }
    }

    const batchesToUpdate = nearbyBatches.length > 0 ? nearbyBatches : this._batches;
    this._updateLODForBatches(batchesToUpdate, camera);
  }

  _getNearbyKeys(centerKey, radius) {
    const [cx, cz] = centerKey.split(',').map(Number);
    const gridSize = this.cellSize * 2;
    const gridRadius = Math.ceil(radius / gridSize);
    const keys = [];
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
      for (let dz = -gridRadius; dz <= gridRadius; dz++) {
        keys.push(`${cx + dx},${cz + dz}`);
      }
    }
    return keys;
  }

  _updateLODForBatches(batches, camera) {
    camera.getWorldPosition(this._camWorld);
    const [L1, L2, L3, L4] = this.lodDistances;
    const H = this.lodHysteresis;

    for (const batch of batches) {
      const distance = batch.box.distanceToPoint(this._camWorld);
      const newLod = this._calculateLOD(batch._lod, distance, L1, L2, L3, L4, H);

      if (newLod !== batch._lod) {
        this._switchLOD(batch, newLod);
        this._stats.lodSwitches++;
      }

      this._updateDebugHelpers(batch, distance);
    }
  }

  forceUpdateLOD(camera) {
    const oldThrottle = this.updateThrottleMs;
    this.updateThrottleMs = 0;
    this._lastLODUpdate = 0;
    this.updateLOD(camera);
    this.updateThrottleMs = oldThrottle;
  }

  optimizeBatches() {
    const smallBatches = this._batches.filter(b =>
      (b.matrices.L1?.length || 0) < this.maxInstancesPerBatch / 4
    );
    if (smallBatches.length < 2) return;

    const groups = [];
    const processed = new Set();

    for (const batch of smallBatches) {
      if (processed.has(batch)) continue;
      const group = [batch];
      processed.add(batch);

      for (const other of smallBatches) {
        if (processed.has(other)) continue;
        const distance = batch.center.distanceTo(other.center);
        if (distance < this.cellSize * 2) {
          group.push(other);
          processed.add(other);
        }
      }

      if (group.length > 1) groups.push(group);
    }

    for (const group of groups) this._combineBatches(group);
  }

  _combineBatches(batches) {
    if (batches.length < 2) return;

    const allMatrices = [];
    let combinedBox = new THREE.Box3().makeEmpty();

    for (const batch of batches) {
      allMatrices.push(...(batch.matrices.L1 || []));
      combinedBox.union(batch.box);

      const index = this._batches.indexOf(batch);
      if (index !== -1) this._batches.splice(index, 1);

      batch.barkIMesh?.parent?.remove(batch.barkIMesh);
      batch.leafIMesh?.parent?.remove(batch.leafIMesh);
    }

    if (allMatrices.length > 0) {
      const firstBatch = batches[0];
      this._createBatch(
        allMatrices,
        !!firstBatch.barkIMesh,
        !!firstBatch.leafIMesh,
        firstBatch.barkIMesh?.geometry,
        firstBatch.leafIMesh?.geometry
      );
    }
  }
}
