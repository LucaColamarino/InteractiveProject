import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  const grassColor = textureLoader.load('/textures/grass_color.jpg');
  const rockColor = textureLoader.load('/textures/rock_color.jpg');
  const snowColor = textureLoader.load('/textures/snow_color.jpg');

  const grassNormal = textureLoader.load('/textures/grass_normal.jpg');
  const rockNormal = textureLoader.load('/textures/rock_normal.jpg');
  const snowNormal = textureLoader.load('/textures/snow_normal.jpg');

  const splatMap = textureLoader.load('/textures/splatmap_more_grass.png');

  // Abilita wrapping per tiling corretto
  [grassColor, rockColor, snowColor, grassNormal, rockNormal, snowNormal].forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  console.log("Texture loaded:", grassColor, rockColor, snowColor, splatMap);

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
      shadowMatrix: { value: new THREE.Matrix4() },
      fogColor: { value: new THREE.Color(0xa8d0ff) },
      fogNear: { value: 100 },
      fogFar: { value: 600 }
    },
    THREE.UniformsLib.lights
  ]);

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;
    varying float vFogDepth;

    uniform mat4 shadowMatrix;

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      vShadowCoord = shadowMatrix * worldPosition;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vFogDepth = -mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    uniform sampler2D grassColor;
    uniform sampler2D rockColor;
    uniform sampler2D snowColor;
    uniform sampler2D grassNormal;
    uniform sampler2D rockNormal;
    uniform sampler2D snowNormal;
    uniform sampler2D splatMap;
    uniform vec3 lightDirection;
    uniform sampler2D shadowMap;
    uniform mat4 shadowMatrix;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;
    varying float vFogDepth;

    #include <packing>

    float getShadowFactor(vec4 shadowCoord) {
      vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
      if (projCoords.x < 0.0 || projCoords.x > 1.0 || projCoords.y < 0.0 || projCoords.y > 1.0 || projCoords.z > 1.0) return 1.0;
      float closestDepth = texture2D(shadowMap, projCoords.xy).r;
      float currentDepth = projCoords.z;
      float bias = 0.003;
      return currentDepth - bias > closestDepth ? 0.4 : 1.0;
    }

    void main() {
      vec4 splat = texture2D(splatMap, vUv);
      float total = splat.r + splat.g + splat.b;
      if (total < 0.0001) discard;

      vec2 tiledUv = vUv * 40.0;
      vec3 gTex = texture2D(grassColor, tiledUv).rgb;
      vec3 rTex = texture2D(rockColor, tiledUv).rgb;
      vec3 sTex = texture2D(snowColor, tiledUv).rgb;

      vec3 blendedColor = gTex * splat.r + rTex * splat.g + sTex * splat.b;

      vec3 lightDir = normalize(lightDirection);
      float diff = max(dot(normalize(vNormal), lightDir), 0.0);

      float shadow = getShadowFactor(vShadowCoord);
      vec3 ambient = vec3(0.3);
      vec3 finalColor = blendedColor * (ambient + diff * shadow);

      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      finalColor = mix(finalColor, fogColor, fogFactor);

      gl_FragColor = vec4(finalColor, 1.0);
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
    depthWrite: true,
    depthTest: true,
    transparent: false,
    extensions: { derivatives: true }
  });
}
