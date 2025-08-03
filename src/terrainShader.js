import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  const grassColor = textureLoader.load('/textures/grass_color.jpg');
  const rockColor = textureLoader.load('/textures/rock_color.jpg');
  const snowColor = textureLoader.load('/textures/snow_color.jpg');

  const grassNormal = textureLoader.load('/textures/grass_normal.jpg');
  const rockNormal = textureLoader.load('/textures/rock_normal.jpg');
  const snowNormal = textureLoader.load('/textures/snow_normal.jpg');

  const splatMap = textureLoader.load('/textures/splatmap_more_grass.png');

  const uniforms = THREE.UniformsUtils.merge([
    {
      grassColor: { value: grassColor },
      rockColor: { value: rockColor },
      snowColor: { value: snowColor },
      grassNormal: { value: grassNormal },
      rockNormal: { value: rockNormal },
      snowNormal: { value: snowNormal },
      splatMap: { value: splatMap },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
      shadowMap: { value: null },
      shadowMatrix: { value: new THREE.Matrix4() }
    },
    THREE.UniformsLib.lights,
    THREE.UniformsLib.fog
  ]);

  const vertexShader = /* glsl */`
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;

    uniform mat4 shadowMatrix;

    #include <common>
    #include <shadowmap_pars_vertex>
    #include <fog_pars_vertex>

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vShadowCoord = shadowMatrix * worldPosition;

      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <shadowmap_vertex>
      #include <fog_vertex>
    }
  `;

  const fragmentShader = /* glsl */`
    uniform sampler2D grassColor;
    uniform sampler2D rockColor;
    uniform sampler2D snowColor;
    uniform sampler2D grassNormal;
    uniform sampler2D rockNormal;
    uniform sampler2D snowNormal;
    uniform sampler2D splatMap;
    uniform vec3 lightDirection;
    uniform sampler2D shadowMap;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;

    #include <common>
    #include <packing>
    #include <uv_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <logdepthbuf_pars_fragment>
    #include <fog_pars_fragment>

    vec2 macroTiling(vec2 uv) {
      float macroFreq = 6.0;
      return fract(uv * 80.0 + sin(uv.yx * macroFreq) * 0.05);
    }

    float getShadowFactor(vec4 shadowCoord) {
      vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
      bvec4 inFrustum = bvec4(
        projCoords.x >= 0.0, projCoords.x <= 1.0,
        projCoords.y >= 0.0, projCoords.y <= 1.0
      );

      if (!all(inFrustum)) return 1.0;

      float closestDepth = texture2D(shadowMap, projCoords.xy).r;
      float currentDepth = projCoords.z;
      float bias = 0.005;
      return currentDepth - bias > closestDepth ? 0.5 : 1.0;
    }

    void main() {
      vec4 splat = texture2D(splatMap, vUv);
      float total = splat.r + splat.g + splat.b;
      if (total < 0.001) discard;

      vec2 tiledUv = macroTiling(vUv);

      vec3 gTex = texture2D(grassColor, tiledUv).rgb;
      vec3 rTex = texture2D(rockColor, tiledUv).rgb;
      vec3 sTex = texture2D(snowColor, tiledUv).rgb;

      vec3 gNorm = texture2D(grassNormal, tiledUv).rgb * 2.0 - 1.0;
      vec3 rNorm = texture2D(rockNormal,  tiledUv).rgb * 2.0 - 1.0;
      vec3 sNorm = texture2D(snowNormal,  tiledUv).rgb * 2.0 - 1.0;

      vec3 blendedColor = gTex * splat.r + rTex * splat.g + sTex * splat.b;
      vec3 blendedNormal = normalize(gNorm * splat.r + rNorm * splat.g + sNorm * splat.b);

      vec3 normal = normalize(blendedNormal);
      vec3 lightDir = normalize(lightDirection);
      float diff = max(dot(normal, lightDir), 0.0);

      float shadow = getShadowFactor(vShadowCoord);

      vec3 ambient = vec3(0.3);
      vec3 finalColor = blendedColor * (ambient + diff * shadow);

      gl_FragColor = vec4(finalColor, 1.0);
      #include <fog_fragment>
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    fog: true,
    lights: true,
    side: THREE.FrontSide,
    shadowSide: THREE.FrontSide,
    extensions: { derivatives: true }
  });
}
