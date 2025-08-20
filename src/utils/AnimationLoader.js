import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE from 'three';

const loader = new FBXLoader();

export async function loadAnimations(baseModel, animationPaths) {
  const mixer = new THREE.AnimationMixer(baseModel);
  const actions = {};

  for (const [name, path] of Object.entries(animationPaths)) {
    const fbx = await loader.loadAsync(path);
    const clip = fbx.animations[0];
    const action = mixer.clipAction(clip);
// quando crei l'action
    if (name === 'standUp') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }else if (name === 'attack') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
    } else {
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
    }

    actions[name] = action;
  }

  return { mixer, actions };
}



export function fixAnimationLoop(clip, fps = 30) {
  const fixedClip = clip.clone();
  fixedClip.duration += 1 / fps;

  fixedClip.tracks.forEach(track => {
    const times = track.times;
    const values = track.values;

    const nValues = values.length;
    const valueSize = nValues / times.length;

    const lastTime = times[times.length - 1] + 1 / fps;
    const newTimes = new Float32Array(times.length + 1);
    const newValues = new Float32Array(values.length + valueSize);

    newTimes.set(times);
    newTimes[times.length] = lastTime;

    newValues.set(values);
    for (let i = 0; i < valueSize; i++) {
      newValues[values.length + i] = values[i];
    }

    track.times = newTimes;
    track.values = newValues;
  });

  return fixedClip;
}
