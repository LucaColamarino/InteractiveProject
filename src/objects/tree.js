
  // TreeSpawner.js (Ottimizzato con LOD migliorato e performance avanzate)
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
    lodDistances = [60, 140, 260, 400], // Aggiunto L0 per LOD ultra-distante
    lodHysteresis = 15,
    frustumCulling = true,
    cellSize = 120,
    updateThrottleMs = 16, // ~60fps per gli aggiornamenti LOD
    useSpatialHashing = true,
    enableOcclusion = false,
    maxVisibleInstances = 5000,
    // Configurazione ombre per LOD
    shadowLODSettings = {
      castShadow: ['L1'],                    // Solo L1 proietta ombre
      receiveShadow: ['L1', 'L2']            // L1 e L2 ricevono ombre  
    },
  } = {}) {
    if (!scene) throw new Error('TreeSpawner: "scene" è richiesto.');
    if (!getTerrainHeightAt) throw new Error('TreeSpawner: "getTerrainHeightAt" è richiesto.');
    this.yoffset = yoffset;
    this.scene = scene;
    this.getTerrainHeightAt = getTerrainHeightAt;
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

    this.loader = new FBXLoader();
    this.textureLoader = new THREE.TextureLoader();
    this._modelCache = new Map();
    this._batches = [];
    this._geometryPool = new Map();
    this._spatialGrid = new Map(); // Hash spaziale per culling veloce

    // Performance tracking
    this._stats = {
      visibleInstances: 0,
      culledInstances: 0,
      lodSwitches: 0,
      lastUpdateTime: 0
    };

    // Materiali con ottimizzazioni
    const bark = this._loadTexSet(textures.bark, anisotropy);
    const leaf = this._loadTexSet(textures.leaf, anisotropy);
    
    this.barkMaterial = new THREE.MeshStandardMaterial({
      map: bark.map || null,
      normalMap: bark.normalMap || null,
      roughness: 1,
      roughnessMap: bark.roughnessMap || null,
      // Ottimizzazioni materiale
      fog: true,
      dithering: true
    });
    
    this.leafMaterial = new THREE.MeshStandardMaterial({
      map: leaf.map || null,
      normalMap: leaf.normalMap || null,
      alphaMap: leaf.alphaMap || null,
      transparent: true,
      alphaTest,
      side: THREE.DoubleSide,
      depthWrite: true,
      // Ottimizzazioni foglie
      fog: true,
      dithering: true,
      premultipliedAlpha: false
    });

    if (this.barkMaterial.map) this.barkMaterial.map.colorSpace = THREE.SRGBColorSpace;
    if (this.leafMaterial.map) this.leafMaterial.map.colorSpace = THREE.SRGBColorSpace;

    this._castShadow = castShadow;
    this._receiveShadow = receiveShadow;

    // Oggetti temporanei per evitare allocazioni
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

    // DEBUG migliorato
    this._debug = {
      enabled: false,
      helpers: [],
      showStats: false,
      showSpatialGrid: false
    };

    // Throttling per aggiornamenti LOD
    this._lastLODUpdate = 0;
    this._pendingLODUpdate = false;
  }

  // === UTILITIES ===
  _loadTex(path) {
    if (!path) return null;
    const t = this.textureLoader.load(path);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.anisotropy || 8;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    // Preload ottimizzato
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
  
  _randScale() {
    const [mi, ma] = this.randomScaleRange;
    return this._rand(mi, ma) * this.baseScale;
  }

  // Hash spaziale per culling ottimizzato
  _getSpatialKey(x, z) {
    const gridSize = this.cellSize * 2; // Griglia più grande per spatial hashing
    return `${Math.floor(x / gridSize)},${Math.floor(z / gridSize)}`;
  }

  // === GEOMETRY EXTRACTION con cache migliorata ===
  _extractGroupGeometry(srcGeom, group) {
    const poolKey = `${srcGeom.uuid}_${group.start}_${group.count}_${group.materialIndex}`;
    if (this.useGeometryPooling && this._geometryPool.has(poolKey)) {
      return this._geometryPool.get(poolKey).clone();
    }

    const geom = new THREE.BufferGeometry();
    
    // Copia attributi essenziali
    const essentialAttribs = ['position', 'normal', 'uv'];
    for (const name of essentialAttribs) {
      if (srcGeom.attributes[name]) {
        geom.setAttribute(name, srcGeom.attributes[name].clone());
      }
    }

    // Gestione indici ottimizzata
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

    // Precomputa bounding volumes
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    
    // Ottimizzazione per rendering
    geom.computeVertexNormals();

    if (this.useGeometryPooling) {
      this._geometryPool.set(poolKey, geom.clone());
    }
    
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
      if ((child.isMesh || child.isSkinnedMesh) && child.geometry) {
        meshes.push(child);
      }
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
        if (gr.materialIndex === barkIndex) {
          barkParts.push(sub);
        } else {
          leafParts.push(sub);
        }
      }
    }

    // Merge con ottimizzazioni
    const barkGeom = barkParts.length ? BufferGeometryUtils.mergeGeometries(barkParts, false) : new THREE.BufferGeometry();
    const leafGeom = leafParts.length ? BufferGeometryUtils.mergeGeometries(leafParts, false) : new THREE.BufferGeometry();
    
    // Precomputa bounding volumes per LOD
    if (barkGeom.attributes.position) {
      barkGeom.computeBoundingSphere();
      barkGeom.computeBoundingBox();
    }
    if (leafGeom.attributes.position) {
      leafGeom.computeBoundingSphere();
      leafGeom.computeBoundingBox();
    }

    const merged = { barkGeom, leafGeom };
    this._modelCache.set(key, merged);
    return merged;
  }

  // === SPAWN OTTIMIZZATO ===
  async spawn(modelPath, count, area, opts = {}) {
    const barkIndex = (opts.barkMaterialIndex ?? this.defaultBarkMaterialIndex) | 0;
    const { barkGeom, leafGeom } = await this._getMergedGeometries(modelPath, barkIndex);

    const hasBark = !!(barkGeom && barkGeom.attributes?.position);
    const hasLeaf = !!(leafGeom && leafGeom.attributes?.position);
    if (!hasBark && !hasLeaf) return;

    // 1) Genera matrici con distribuzione migliorata
    const matrices = [];
    const positions = []; // Per spatial hashing
    
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

    // 2) Spatial hashing migliorato
    if (this.useSpatialHashing) {
      for (const pos of positions) {
        const key = this._getSpatialKey(pos.x, pos.z);
        if (!this._spatialGrid.has(key)) {
          this._spatialGrid.set(key, []);
        }
        this._spatialGrid.get(key).push(pos);
      }
    }

    // 3) Binning per celle con bilanciamento del carico
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

    // 4) Creazione batch ottimizzata
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
      for (let i = 0; i < mats.length; i++) {
        mesh.setMatrixAt(i, mats[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      
      // Ottimizzazioni rendering
      mesh.castShadow = this._castShadow;
      mesh.receiveShadow = this._receiveShadow;
      mesh.frustumCulled = this.frustumCulling;
      
      // Ottimizzazione per instancing
      if (mesh.material) {
        mesh.material.transparent = mesh.material.transparent || false;
        mesh.material.needsUpdate = true;
      }
    };

    applyMatrices(barkIMesh, matrices);
    applyMatrices(leafIMesh, matrices);

    if (barkIMesh) this.scene.add(barkIMesh);
    if (leafIMesh) this.scene.add(leafIMesh);

    // Calcola bounding box del batch
    const box = new THREE.Box3().makeEmpty();
    for (const m of matrices) {
      box.expandByPoint(this._tmp.setFromMatrixPosition(m));
    }
    
    // Espandi box per tenere conto della scala degli alberi
    const avgScale = this.baseScale * (this.randomScaleRange[0] + this.randomScaleRange[1]) / 2;
    box.expandByScalar(avgScale * 10); // Stima dell'altezza media degli alberi
    
    const center = new THREE.Vector3();
    box.getCenter(center);

    // Debug helpers ottimizzati
    const debugHelpers = this._createDebugHelpers(box, center);

    // Precalcola LOD matrices per performance - STRATEGIA DENSITÀ
    const createLODLevel = (matrices, targetReduction) => {
      if (matrices.length <= 4) return matrices; // Se poche istanze, tieni tutte
      
      const targetCount = Math.max(1, Math.floor(matrices.length * targetReduction));
      const step = matrices.length / targetCount;
      
      const result = [];
      for (let i = 0; i < targetCount; i++) {
        const index = Math.floor(i * step);
        if (index < matrices.length) result.push(matrices[index]);
      }
      return result;
    };

    const lodMatrices = {
      L1: matrices,                                    // 100%
      L2: createLODLevel(matrices, 0.7),              // ~70%
      L3: createLODLevel(matrices, 0.4),              // ~40%  
      L4: createLODLevel(matrices, 0.2)               // ~20%
    };

    this._batches.push({
      barkIMesh,
      leafIMesh,
      matrices: lodMatrices,
      center,
      box,
      _lod: 'L1',
      _prevLod: 'L1',
      visible: true,
      lastDistance: Infinity,
      debug: debugHelpers,
      stats: { switches: 0, lastSwitch: 0 }
    });
    
    // Debug info per LOD levels
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

    // Shell per ogni livello LOD
    const shells = [];
    const colors = [0x00ff00, 0xffff00, 0xff8800, 0xff0000];
    
    for (let i = 0; i < this.lodDistances.length; i++) {
      const shell = box.clone();
      shell.expandByScalar(this.lodDistances[i]);
      const helper = new THREE.Box3Helper(shell, colors[i]);
      helper.visible = false;
      this.scene.add(helper);
      shells.push({ box: shell, helper });
      this._debug.helpers.push(helper);
    }

    // Marker punto più vicino
    const closestGeom = new THREE.SphereGeometry(1.2, 8, 8);
    const closestMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const closestMesh = new THREE.Mesh(closestGeom, closestMat);
    closestMesh.visible = false;
    this.scene.add(closestMesh);
    this._debug.helpers.push(closestMesh);

    // Linea camera → closest point
    const lineGeom = new THREE.BufferGeometry().setFromPoints([center, center]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const line = new THREE.Line(lineGeom, lineMat);
    line.visible = false;
    this.scene.add(line);
    this._debug.helpers.push(line);

    return { baseHelper, shells, closestMesh, line };
  }

  // === LOD SYSTEM AVANZATO ===
  updateLOD(camera) {
    if (!this.enableLOD || !camera || !this._batches || this._batches.length === 0) {
      if (this._debug.enabled) console.log('UpdateLOD: early return', { enableLOD: this.enableLOD, hasCamera: !!camera, batchCount: this._batches?.length });
      return;
    }

    const now = performance.now();
    
    // Throttling per performance - MA non bloccare se debug è abilitato
    if (!this._debug.enabled && now - this._lastLODUpdate < this.updateThrottleMs) {
      return;
    }
    this._lastLODUpdate = now;

    // Aggiorna posizione camera
    camera.getWorldPosition(this._camWorld);
    
    // Calcola movimento camera per ottimizzazioni
    const cameraMoved = this._camWorld.distanceTo(this._camPrevWorld) > 1.0;
    this._camPrevWorld.copy(this._camWorld);

    // Debug: forza aggiornamento se debug abilitato
    if (this._debug.enabled) {
      console.log('UpdateLOD called:', { now, lastUpdate: this._lastLODUpdate, cameraMoved, cameraPos: this._camWorld.toArray() });
    }
    
    // Calcola movimento camera per ottimizzazioni
     cameraMoved = this._camWorld.distanceTo(this._camPrevWorld) > 1.0;
    this._camPrevWorld.copy(this._camWorld);

    // Frustum culling se abilitato
    if (this.frustumCulling) {
      this._frustum.setFromProjectionMatrix(
        this._matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      );
    }

    const [L1, L2, L3, L4] = this.lodDistances;
    const H = this.lodHysteresis;

    let totalVisible = 0;
    const batchesToUpdate = [];

    // Prima passata: calcola distanze e filtra batch
    for (const batch of this._batches) {
      const distance = batch.box.distanceToPoint(this._camWorld);
      
      // Frustum culling per batch
      if (this.frustumCulling && !this._frustum.intersectsBox(batch.box)) {
        if (batch.visible) {
          this._setBatchVisibility(batch, false);
        }
        continue;
      }

      // Skip se camera non si è mossa molto e distanza simile
      if (!cameraMoved && Math.abs(distance - batch.lastDistance) < 5) {
        if (batch.visible) totalVisible += this._getBatchInstanceCount(batch);
        continue;
      }

      batch.lastDistance = distance;
      batchesToUpdate.push({ batch, distance });
    }

    // Ordina per distanza per ottimizzare LOD switching
    batchesToUpdate.sort((a, b) => a.distance - b.distance);

    // Seconda passata: aggiorna LOD
    for (const { batch, distance } of batchesToUpdate) {
      const newLod = this._calculateLOD(batch._lod, distance, L1, L2, L3, L4, H);
      
      if (this._debug.enabled) {
        console.log(`Batch LOD calculation: current=${batch._lod}, distance=${distance.toFixed(1)}, newLod=${newLod}`);
      }
      
      if (newLod !== batch._lod) {
        this._switchLOD(batch, newLod);
        this._stats.lodSwitches++;
        
        if (this._debug.enabled) {
          console.log(`LOD switched: ${batch._lod} → ${newLod}`);
        }
      }

      if (batch.visible) {
        totalVisible += this._getBatchInstanceCount(batch);
      }

      // Limita istanze visibili totali per performance
      if (totalVisible > this.maxVisibleInstances) {
        this._setBatchVisibility(batch, false);
      }

      // Aggiorna debug helpers
      this._updateDebugHelpers(batch, distance);
    }

    this._stats.visibleInstances = totalVisible;
    this._stats.culledInstances = this._batches.length * this.maxInstancesPerBatch - totalVisible;
  }

  _calculateLOD(currentLOD, distance, L1, L2, L3, L4, hysteresis) {
    // Debug logging
    if (this._debug.enabled) {
      console.log(`Distance: ${distance.toFixed(1)}, Current: ${currentLOD}, Thresholds: [${L1}, ${L2}, ${L3}, ${L4}]`);
    }
    
    // Logica corretta: prima controlla la distanza attuale, poi applica hysteresis
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
        if (distance < L2 - hysteresis) return distance < L1 - hysteresis ? 'L1' : 'L2';
        return 'L3';

      case 'L4':
        if (distance > L4 + hysteresis) return 'OFF';
        if (distance < L3 - hysteresis) return distance < L2 - hysteresis ? (distance < L1 - hysteresis ? 'L1' : 'L2') : 'L3';
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
    
    // Debug logging
    if (this._debug.enabled) {
      console.log(`Batch LOD switch: ${batch._prevLod} → ${newLod}, visible: ${isVisible}`);
    }

    if (isVisible) {
      // Prima rendi visibile
      this._setBatchVisibility(batch, true);
      
      // Poi aggiorna le istanze
      const matrices = batch.matrices[newLod] || batch.matrices.L1;
      this._updateBatchInstances(batch.barkIMesh, matrices);
      this._updateBatchInstances(batch.leafIMesh, matrices);

      // === GESTIONE OMBRE BASATA SU LOD ===
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
      
      // Debug ombre
      if (this._debug.enabled) {
        console.log(`Shadow settings for LOD ${newLod}:`, {
          castShadow: enableShadowCasting && this._castShadow,
          receiveShadow: enableShadowReceiving && this._receiveShadow
        });
      }
    } else {
      // Nascondi quando OFF
      this._setBatchVisibility(batch, false);
    }
  }

  _setBatchVisibility(batch, visible) {
    batch.visible = visible;
    if (batch.barkIMesh) {
      batch.barkIMesh.visible = visible;
      // Forza l'aggiornamento della matrice se diventa visibile
      if (visible) batch.barkIMesh.instanceMatrix.needsUpdate = true;
    }
    if (batch.leafIMesh) {
      batch.leafIMesh.visible = visible;
      // Forza l'aggiornamento della matrice se diventa visibile
      if (visible) batch.leafIMesh.instanceMatrix.needsUpdate = true;
    }
    
    // Debug logging
    if (this._debug.enabled) {
      console.log(`Batch visibility set to: ${visible}, LOD: ${batch._lod}`);
    }
  }

  _updateBatchInstances(mesh, matrices) {
    if (!mesh || !matrices) return;
    
    mesh.count = matrices.length;
    const identity = new THREE.Matrix4();
    
    for (let i = 0; i < matrices.length; i++) {
      mesh.setMatrixAt(i, matrices[i] || identity);
    }
    
    mesh.instanceMatrix.needsUpdate = true;
  }

  _getBatchInstanceCount(batch) {
    const lodKey = batch._lod === 'OFF' ? 'L1' : batch._lod;
    return batch.matrices[lodKey]?.length || 0;
  }

  _updateDebugHelpers(batch, distance) {
    if (!this._debug.enabled || !batch.debug) return;

    // Punto più vicino
    batch.box.clampPoint(this._camWorld, this._closest);
    batch.debug.closestMesh.position.copy(this._closest);

    // Linea camera → closest
    const points = [this._camWorld.clone(), this._closest.clone()];
    batch.debug.line.geometry.setFromPoints(points);

    // Visibilità helpers
    const visible = this._debug.enabled;
    batch.debug.baseHelper.visible = visible;
    batch.debug.closestMesh.visible = visible;
    batch.debug.line.visible = visible;

    for (const shell of batch.debug.shells) {
      shell.helper.visible = visible;
    }
  }

  // === DEBUG E UTILITY ===
  setDebugLOD(enabled) {
    this._debug.enabled = !!enabled;
    console.log(`TreeSpawner debug ${enabled ? 'enabled' : 'disabled'}`);
    
    for (const batch of this._batches) {
      if (!batch.debug) continue;
      
      batch.debug.baseHelper.visible = this._debug.enabled;
      batch.debug.closestMesh.visible = this._debug.enabled;
      batch.debug.line.visible = this._debug.enabled;
      
      for (const shell of batch.debug.shells) {
        shell.helper.visible = this._debug.enabled;
      }
    }
  }

  // Metodo di debug per testare LOD manualmente
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

  // Ottimizzazione memoria
  optimizeMemory() {
    // Cleanup geometry pool se troppo grande
    if (this._geometryPool.size > 100) {
      const toDelete = [];
      for (const [key, geom] of this._geometryPool) {
        // Rimuovi geometrie non usate di recente (strategia LRU semplificata)
        if (Math.random() > 0.8) { // 20% di probabilità di rimozione
          geom.dispose();
          toDelete.push(key);
        }
      }
      for (const key of toDelete) {
        this._geometryPool.delete(key);
      }
    }
  }

  clear() {
    for (const batch of this._batches) {
      if (batch.barkIMesh?.parent) batch.barkIMesh.parent.remove(batch.barkIMesh);
      if (batch.leafIMesh?.parent) batch.leafIMesh.parent.remove(batch.leafIMesh);
      
      // Cleanup debug helpers
      if (batch.debug) {
        batch.debug.baseHelper?.parent?.remove(batch.debug.baseHelper);
        batch.debug.closestMesh?.parent?.remove(batch.debug.closestMesh);
        batch.debug.line?.parent?.remove(batch.debug.line);
        
        for (const shell of batch.debug.shells || []) {
          shell.helper?.parent?.remove(shell.helper);
        }
      }

      // Dispose geometrie se non pooled
      if (!this.useGeometryPooling) {
        batch.barkIMesh?.geometry?.dispose();
        batch.leafIMesh?.geometry?.dispose();
      }
    }
    
    this._batches.length = 0;
    this._spatialGrid.clear();
    
    // Reset stats
    this._stats.visibleInstances = 0;
    this._stats.culledInstances = 0;
    this._stats.lodSwitches = 0;
  }

  dispose() {
    this.clear();
    
    // Cleanup materiali
    const disposeMaterial = (mat) => {
      if (!mat) return;
      ['map', 'normalMap', 'alphaMap', 'roughnessMap'].forEach(prop => {
        if (mat[prop]?.dispose) {
          mat[prop].dispose();
          mat[prop] = null;
        }
      });
      mat.dispose();
    };
    
    disposeMaterial(this.barkMaterial);
    disposeMaterial(this.leafMaterial);
    
    // Cleanup geometry pool
    for (const geom of this._geometryPool.values()) {
      geom.dispose();
    }
    this._geometryPool.clear();
    
    // Cleanup model cache
    this._modelCache.clear();
    
    // Cleanup debug helpers
    for (const helper of this._debug.helpers) {
      if (helper.parent) helper.parent.remove(helper);
      if (helper.geometry) helper.geometry.dispose();
      if (helper.material) helper.material.dispose();
    }
    this._debug.helpers.length = 0;
    
    // Cleanup spatial grid
    this._spatialGrid.clear();
  }

  // === METODI AVANZATI ===
  
  // Aggiorna LOD solo per batch vicini alla camera (ottimizzazione spaziale)
  updateLODSpatial(camera, radius = 500) {
    if (!this.enableLOD || !camera || !this.useSpatialHashing || !this._batches.length) {
      // Fallback al metodo normale se spatial hashing non disponibile
      return this.updateLOD(camera);
    }
    
    camera.getWorldPosition(this._camWorld);
    const spatialKey = this._getSpatialKey(this._camWorld.x, this._camWorld.z);
    
    // Aggiorna solo batch nelle celle vicine
    const nearbyKeys = this._getNearbyKeys(spatialKey, radius);
    const nearbyBatches = [];
    
    for (const key of nearbyKeys) {
      if (this._spatialGrid.has(key)) {
        // Trova batch corrispondenti (implementazione semplificata)
        for (const batch of this._batches) {
          const batchKey = this._getSpatialKey(batch.center.x, batch.center.z);
          if (batchKey === key) {
            nearbyBatches.push(batch);
          }
        }
      }
    }
    
    // Se non ci sono batch vicini, usa tutti i batch
    const batchesToUpdate = nearbyBatches.length > 0 ? nearbyBatches : this._batches;
    
    // Aggiorna batch
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
  
  // Forza aggiornamento LOD senza throttling (per debug)
  forceUpdateLOD(camera) {
    const oldThrottle = this.updateThrottleMs;
    this.updateThrottleMs = 0;
    this._lastLODUpdate = 0;
    this.updateLOD(camera);
    this.updateThrottleMs = oldThrottle;
  }
  
  // Ottimizza batch troppo piccoli combinandoli
  optimizeBatches() {
    const smallBatches = this._batches.filter(b => 
      (b.matrices.L1?.length || 0) < this.maxInstancesPerBatch / 4
    );
    
    if (smallBatches.length < 2) return;
    
    console.log(`Ottimizzando ${smallBatches.length} batch piccoli...`);
    
    // Raggruppa batch vicini spazialmente
    const groups = [];
    const processed = new Set();
    
    for (const batch of smallBatches) {
      if (processed.has(batch)) continue;
      
      const group = [batch];
      processed.add(batch);
      
      // Trova batch vicini
      for (const other of smallBatches) {
        if (processed.has(other)) continue;
        
        const distance = batch.center.distanceTo(other.center);
        if (distance < this.cellSize * 2) {
          group.push(other);
          processed.add(other);
        }
      }
      
      if (group.length > 1) {
        groups.push(group);
      }
    }
    
    // Combina i gruppi
    for (const group of groups) {
      this._combineBatches(group);
    }
  }
  
  _combineBatches(batches) {
    if (batches.length < 2) return;
    
    // Combina tutte le matrici
    const allMatrices = [];
    let combinedBox = new THREE.Box3().makeEmpty();
    
    for (const batch of batches) {
      allMatrices.push(...(batch.matrices.L1 || []));
      combinedBox.union(batch.box);
      
      // Rimuovi batch originali
      const index = this._batches.indexOf(batch);
      if (index !== -1) {
        this._batches.splice(index, 1);
      }
      
      // Cleanup
      if (batch.barkIMesh?.parent) batch.barkIMesh.parent.remove(batch.barkIMesh);
      if (batch.leafIMesh?.parent) batch.leafIMesh.parent.remove(batch.leafIMesh);
    }
    
    // Crea nuovo batch combinato
    if (allMatrices.length > 0) {
      // Nota: questa è una versione semplificata, 
      // in un caso reale dovresti ricreare le geometrie
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
  
  // Metodo per debug performance
  logPerformanceStats() {
    const stats = this.getStats();
    console.group('TreeSpawner Performance Stats');
    console.log('Istanze visibili:', stats.visibleInstances);
    console.log('Istanze cullate:', stats.culledInstances);
    console.log('Switch LOD:', stats.lodSwitches);
    console.log('Batch totali:', stats.totalBatches);
    console.log('Geometrie in pool:', stats.geometriesPooled);
    console.log('Modelli caricati:', stats.modelsLoaded);
    console.log('Memoria geometrie (MB):', (stats.geometriesPooled * 0.1).toFixed(2)); // Stima
    console.groupEnd();
  }
  
  // Metodo per regolare dinamicamente la qualità in base alle performance
  adaptiveQuality(targetFPS = 60) {
    const currentFPS = this._estimateFPS();
    
    if (currentFPS < targetFPS * 0.8) {
      // Performance scarse, riduci qualità
      this.lodDistances = this.lodDistances.map(d => d * 0.9);
      this.maxInstancesPerBatch = Math.max(500, this.maxInstancesPerBatch * 0.9);
      console.log('Qualità ridotta per migliorare performance');
    } else if (currentFPS > targetFPS * 1.1) {
      // Performance buone, aumenta qualità
      this.lodDistances = this.lodDistances.map(d => d * 1.05);
      this.maxInstancesPerBatch = Math.min(2000, this.maxInstancesPerBatch * 1.05);
      console.log('Qualità aumentata');
    }
  }
  
  _estimateFPS() {
    const now = performance.now();
    if (this._lastFrameTime) {
      const deltaTime = now - this._lastFrameTime;
      const fps = 1000 / deltaTime;
      this._lastFrameTime = now;
      return fps;
    }
    this._lastFrameTime = now;
    return 60; // Default
  }
  
  // Precarica modelli per ridurre stuttering
  async preloadModels(modelPaths, barkIndices = [0]) {
    const promises = [];
    
    for (const modelPath of modelPaths) {
      for (const barkIndex of barkIndices) {
        promises.push(this._getMergedGeometries(modelPath, barkIndex));
      }
    }
    
    try {
      await Promise.all(promises);
      console.log(`Precaricati ${promises.length} modelli`);
    } catch (error) {
      console.warn('Errore nel precaricamento modelli:', error);
    }
  }
  
  // Esporta configurazione ottimale trovata dinamicamente
  exportOptimalConfig() {
    return {
      lodDistances: [...this.lodDistances],
      maxInstancesPerBatch: this.maxInstancesPerBatch,
      lodHysteresis: this.lodHysteresis,
      cellSize: this.cellSize,
      updateThrottleMs: this.updateThrottleMs,
      stats: this.getStats()
    };
  }
  
  // Importa configurazione ottimale
  importOptimalConfig(config) {
    if (config.lodDistances) this.lodDistances = [...config.lodDistances];
    if (config.maxInstancesPerBatch) this.maxInstancesPerBatch = config.maxInstancesPerBatch;
    if (config.lodHysteresis) this.lodHysteresis = config.lodHysteresis;
    if (config.cellSize) this.cellSize = config.cellSize;
    if (config.updateThrottleMs) this.updateThrottleMs = config.updateThrottleMs;
    
    console.log('Configurazione ottimale importata:', config);
  }
}