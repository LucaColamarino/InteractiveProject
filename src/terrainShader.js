import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  const noiseTex = textureLoader.load('/textures/terrain/noise.jpg');
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    fog: true,
  });

  baseMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       varying vec3 vWorldPosition;
       varying vec2 vUv;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
       vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
       vUv = uv;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform sampler2D grassColor;
       uniform sampler2D rockColor;
       uniform sampler2D snowColor;
       uniform sampler2D noiseMap;
       uniform float time;
       varying vec3 vWorldPosition;
       varying vec2 vUv;`
    );

    shader.uniforms.grassColor = { value: textureLoader.load('/textures/terrain/grass_color.jpg') };
    shader.uniforms.rockColor = { value: textureLoader.load('/textures/terrain/rock_color.jpg') };
    shader.uniforms.snowColor = { value: textureLoader.load('/textures/terrain/snow_color.jpg') };
    shader.uniforms.noiseMap = { value: noiseTex };
    shader.uniforms.time = { value: 0.0 };

    baseMaterial.userData.shaderRef = shader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
        vec2 macroUv = vUv * 4.0;
        vec2 microUv = vUv * 80.0;
        vec2 noiseUv = vUv * 20.0 + vec2(time * 0.05, time * 0.03);
        float height = vWorldPosition.y;

        float grassBlend = 1.0 - smoothstep(12.0, 17.0, height);
        float rockBlend  = smoothstep(12.0, 17.0, height) * (1.0 - smoothstep(24.0, 29.0, height));
        float snowBlend  = smoothstep(24.0, 29.0, height);
        float total = grassBlend + rockBlend + snowBlend + 0.0001;
        grassBlend /= total;
        rockBlend  /= total;
        snowBlend  /= total;

        vec3 gTex = mix(texture2D(grassColor, macroUv).rgb, texture2D(grassColor, microUv).rgb, 0.5);
        vec3 rTex = mix(texture2D(rockColor, macroUv).rgb, texture2D(rockColor, microUv).rgb, 0.5);
        vec3 sTex = mix(texture2D(snowColor, macroUv).rgb, texture2D(snowColor, microUv).rgb, 0.5);

        float noise = texture2D(noiseMap, noiseUv).r;
        noise = clamp(noise, 0.0, 1.0);
        grassBlend += (noise - 0.5) * 0.1;
        rockBlend  += (0.5 - noise) * 0.08;

        vec3 blended = clamp(grassBlend * gTex + rockBlend * rTex + snowBlend * sTex, 0.0, 1.0);
        diffuseColor.rgb = blended;
      `
    );
  };

  return baseMaterial;
}
