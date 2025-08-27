// terrainShader.js
import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  function loadTexture(path) {
    const tex = textureLoader.load(path);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    return tex;
  }

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    fog: true,
    side: THREE.FrontSide,
  });

  baseMaterial.onBeforeCompile = (shader) => {
    // ==== VERTEX ====
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

    // ==== FRAGMENT (uniforms & varyings) ====
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
       uniform sampler2D grassColor;
       uniform sampler2D rockColor;
       uniform sampler2D snowColor;

       uniform sampler2D grassNormal;
       uniform sampler2D rockNormal;
       uniform sampler2D snowNormal;

       uniform sampler2D grassAO;
       uniform sampler2D rockAO;
       uniform sampler2D snowAO;

       uniform sampler2D noiseMap;
       uniform float time;
       uniform float dayFactor; // 0 notte, 1 giorno

       varying vec3 vWorldPosition;
       varying vec2 vUv;

       // porteremo qui il "normalMap" blended (tangent-like, approx)
       vec3 blendedTangentNormal = vec3(0.0);
      `
    );

    // ==== FRAGMENT (color/ao/normal maps blend + TINT) ====
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
        // UVs: macro/micro per colore, micro per normal/ao
        vec2 macroUv = vUv * 10.0;
        vec2 microUv = vUv * 120.0;
        vec2 noiseUv = vUv * 20.0 + vec2(time * 0.05, time * 0.03);

        // altezza mondo (layering erba/roccia/neve)
        float height = vWorldPosition.y;
        float grassBlend = 1.0 - smoothstep(12.0, 17.0, height);
        float rockBlend  = smoothstep(12.0, 17.0, height) * (1.0 - smoothstep(24.0, 29.0, height));
        float snowBlend  = smoothstep(24.0, 29.0, height);

        // noise per rompere transizioni
        float noise = texture2D(noiseMap, noiseUv).r;
        noise = clamp(noise, 0.0, 1.0);
        grassBlend += (noise - 0.5) * 0.10;
        rockBlend  += (0.5 - noise) * 0.08;

        // normalizza
        float total = grassBlend + rockBlend + snowBlend + 0.0001;
        grassBlend /= total;
        rockBlend  /= total;
        snowBlend  /= total;

        // campiona colori (macro+micro)
        vec3 gTex = mix(texture2D(grassColor, macroUv).rgb, texture2D(grassColor, microUv).rgb, 0.5);
        vec3 rTex = mix(texture2D(rockColor,  macroUv).rgb, texture2D(rockColor,  microUv).rgb, 0.5);
        vec3 sTex = mix(texture2D(snowColor,  macroUv).rgb, texture2D(snowColor,  microUv).rgb, 0.5);

        // blend colore base
        vec3 blended = clamp(grassBlend * gTex + rockBlend * rTex + snowBlend * sTex, 0.0, 1.0);

        // ====== TINT giorno/notte (mantiene SEMPRE la texture) ======
        // notte più scura e leggermente blu/grigia
        vec3 nightTint = vec3(0.42, 0.48, 0.56);
        float tintMix = smoothstep(0.28, 0.95, dayFactor); // notte piena applica di più la tinta
        vec3 tint = mix(nightTint, vec3(1.0), tintMix);
        diffuseColor.rgb = blended * tint;


        // AO (micro)
        float gAO = texture2D(grassAO, microUv).r;
        float rAO = texture2D(rockAO,  microUv).r;
        float sAO = texture2D(snowAO,  microUv).r;
        float aoBlend = clamp(grassBlend * gAO + rockBlend * rAO + snowBlend * sAO, 0.0, 1.0);
        diffuseColor.rgb *= aoBlend;

        // Normali (tangent-like approx per migliorare risposta alle luci locali)
        vec3 gN = texture2D(grassNormal, microUv).rgb * 2.0 - 1.0;
        vec3 rN = texture2D(rockNormal,  microUv).rgb * 2.0 - 1.0;
        vec3 sN = texture2D(snowNormal,  microUv).rgb * 2.0 - 1.0;
        blendedTangentNormal = normalize(grassBlend * gN + rockBlend * rN + snowBlend * sN);
      `
    );

    // ==== FRAGMENT (inject blended normals into lighting pipeline) ====
    // Sostituiamo il blocco normal maps con una approssimazione:
    // spingiamo un po' la normal finale verso la tangent-normal blended.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      // Approx: in assenza di TBN esplicita, pieghiamo la normal geometrica verso la "tangent normal" blended.
      // Questo è leggero ma sufficiente a recuperare micro-dettaglio vicino a luci locali (falò).
      normal = normalize( normal + blendedTangentNormal * 0.5 );

      // mantieni gli altri effetti standard (clearcoat, ecc) disattivati qui
      `
    );

    // Uniforms
    shader.uniforms.grassColor = { value: loadTexture('/textures/terrain/grass_color.jpg') };
    shader.uniforms.rockColor  = { value: loadTexture('/textures/terrain/rock_color.jpg') };
    shader.uniforms.snowColor  = { value: loadTexture('/textures/terrain/snow_color.jpg') };

    shader.uniforms.grassNormal = { value: loadTexture('/textures/terrain/grass_normal.jpg') };
    shader.uniforms.rockNormal  = { value: loadTexture('/textures/terrain/rock_normal.jpg') };
    shader.uniforms.snowNormal  = { value: loadTexture('/textures/terrain/snow_normal.jpg') };

    shader.uniforms.grassAO = { value: loadTexture('/textures/terrain/grass_ao.jpg') };
    shader.uniforms.rockAO  = { value: loadTexture('/textures/terrain/rock_ao.jpg') };
    shader.uniforms.snowAO  = { value: loadTexture('/textures/terrain/snow_ao.jpg') };

    shader.uniforms.noiseMap = { value: loadTexture('/textures/terrain/noise.jpg') };
    shader.uniforms.time = { value: 0.0 };
    shader.uniforms.dayFactor = { value: 1.0 };

    baseMaterial.userData.shaderRef = shader;
  };

  return baseMaterial;
}
