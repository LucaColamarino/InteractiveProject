// AnimationLoader.js
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';

const loader = new FBXLoader();

const NON_LOOP = new Set(['standUp','swordAttack','wandCast','attack','block','jump','die']);

export async function loadAnimations(baseModel, animations) {
  const mixer = new THREE.AnimationMixer(baseModel);
  const actions = {};

  const entries = Object.entries(animations || {});
  const clipsData = await Promise.all(entries.map(async ([name, path]) => {
    if (!path) return [name, null];
    try {
      const fbx = await loader.loadAsync(path);
      const clip = fbx.animations?.[0] || null;
      return [name, clip];
    } catch (err) {
      console.warn(`[Anim] Skip '${name}' (${path}):`, err);
      return [name, null];
    }
  }));

  for (const [name, rawClip] of clipsData) {
    if (!rawClip) continue;
    const isLoco = (name === 'idle' || name === 'walk' || name === 'run' || name === 'fly' || name === 'sitIdle');
    const clip = isLoco ? fixAnimationLoop(rawClip, 30) : rawClip;

    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.setEffectiveTimeScale(1);

    if (NON_LOOP.has(name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    actions[name] = action;
  }

  // idle di default
  if (actions.idle) {
    actions.idle.enabled = true;
    actions.idle.setEffectiveWeight?.(1);
    if (!actions.idle.isRunning?.()) actions.idle.play();
  }

  // Cleanup pesi a fine non-loop
  mixer.addEventListener('finished', (e) => {
    const a = e?.action;
    if (a) a.setEffectiveWeight?.(0);
  });

  return { mixer, actions };
}

export function fixAnimationLoop(clip, fps = 30) {
  const fixed = clip.clone();
  const dt = 1 / fps;
  fixed.duration += dt;
  fixed.tracks = fixed.tracks.map((track) => {
    const times = track.times, values = track.values;
    const valueSize = values.length / times.length;

    const newTimes = new Float32Array(times.length + 1);
    const newValues = new Float32Array(values.length + valueSize);

    newTimes.set(times, 0);
    newTimes[newTimes.length - 1] = times[times.length - 1] + dt;

    newValues.set(values, 0);
    for (let i = 0; i < valueSize; i++) {
      newValues[newValues.length - valueSize + i] = values[i];
    }

    const cloned = track.clone();
    cloned.times = newTimes;
    cloned.values = newValues;
    return cloned;
  });
  return fixed;
}
