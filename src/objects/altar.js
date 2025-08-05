import { Water } from 'three/examples/jsm/objects/Water.js';
import * as THREE from 'three';
import { scene } from '../scene.js';
import { sun } from '../shadowManager.js';

export const altars = [];

export function spawnWaterAltar(position, formName = 'wyvern') {
  const altarGroup = new THREE.Group();
  altarGroup.position.copy(position);
  altarGroup.userData.formName = formName;
  altarGroup.userData.type = 'altar';

  // Base compatta
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.3, 32),
    new THREE.MeshStandardMaterial({ color: 0x555555 })
  );
  base.position.y = 0;
  altarGroup.add(base);

  // Tetto compatto
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 0.2, 32),
    new THREE.MeshStandardMaterial({ color: 0x444444 })
  );
  top.position.y = 1.8;
  altarGroup.add(top);

  // Colonne verticali
  const colGeom = new THREE.CylinderGeometry(0.1, 0.1, 1.8, 8);
  const colMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const columnPositions = [
    [0.8, 0.8],
    [-0.8, 0.8],
    [0.8, -0.8],
    [-0.8, -0.8]
  ];
  for (const [x, z] of columnPositions) {
    const col = new THREE.Mesh(colGeom, colMat);
    col.position.set(x, 0.9, z);
    altarGroup.add(col);
  }

  // Acqua centrale animata (Water.js)
  const waterGeometry = new THREE.CircleGeometry(0.7, 32);
  const water = new Water(waterGeometry, {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: new THREE.TextureLoader().load('/textures/terrain/waternormals.jpg', t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    }),
    sunDirection: sun?.position.clone().normalize() ?? new THREE.Vector3(1, 1, 1),
    sunColor: 0xffffff,
    waterColor: 0x3399ff,
    distortionScale: 1.5,
    fog: scene.fog !== undefined
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.16;
  altarGroup.add(water);

  // Alone pulsante attorno all’acqua
  const ringGeom = new THREE.RingGeometry(0.8, 1.4, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.17;
  altarGroup.add(ring);

  // Punto luce centrale
  const pointLight = new THREE.PointLight(0x66ccff, 1, 4, 2);
  pointLight.position.set(0, 1.2, 0);
  altarGroup.add(pointLight);

  // Particelle ascendenti magiche
  const particleCount = 30;
  const particleGeom = new THREE.BufferGeometry();
  const particlePositions = [];

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.6 + Math.random() * 0.2;
    const x = Math.cos(angle) * radius;
    const y = Math.random() * 1.5;
    const z = Math.sin(angle) * radius;
    particlePositions.push(x, y, z);
  }

  particleGeom.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));

  const particleMat = new THREE.PointsMaterial({
    color: 0x99ccff,
    size: 0.07,
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });

  const particles = new THREE.Points(particleGeom, particleMat);
  altarGroup.add(particles);

  // Animazione alone + particelle
  let scaleDir = 1;
  function animate() {
    // Alone pulsante
    ring.scale.multiplyScalar(1 + scaleDir * 0.005);
    ring.material.opacity += scaleDir * 0.01;
    if (ring.scale.x > 1.1 || ring.scale.x < 0.95) scaleDir *= -1;

    // Movimento particelle verso l’alto
    const posAttr = particles.geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      posAttr.array[i * 3 + 1] += 0.005; // y-axis
      if (posAttr.array[i * 3 + 1] > 2.0) posAttr.array[i * 3 + 1] = 0.2;
    }
    posAttr.needsUpdate = true;

    requestAnimationFrame(animate);
  }

  animate();

  // Abilita ombre
  altarGroup.traverse(obj => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  scene.add(altarGroup);
  altars.push(altarGroup);
}
