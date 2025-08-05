import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  const grassColor = textureLoader.load('/textures/terrain/grass_color.jpg');
  const rockColor = textureLoader.load('/textures/terrain/rock_color.jpg');
  const snowColor = textureLoader.load('/textures/terrain/snow_color.jpg');
  const grassNormal = textureLoader.load('/textures/terrain/grass_normal.jpg');
  const rockNormal = textureLoader.load('/textures/terrain/rock_normal.jpg');
  const snowNormal = textureLoader.load('/textures/terrain/snow_normal.jpg');
  const grassAO = textureLoader.load('/textures/terrain/grass_ao.jpg');
  const rockAO = textureLoader.load('/textures/terrain/rock_ao.jpg');
  const snowAO = textureLoader.load('/textures/terrain/snow_ao.jpg');
  const grassRough = textureLoader.load('/textures/terrain/grass_roughness.jpg');
  const rockRough = textureLoader.load('/textures/terrain/rock_roughness.jpg');
  const snowRough = textureLoader.load('/textures/terrain/snow_roughness.jpg');
  const noiseTex = textureLoader.load('/textures/terrain/noise.jpg');

  [
    grassColor, rockColor, snowColor,
    grassNormal, rockNormal, snowNormal,
    grassAO, rockAO, snowAO,
    grassRough, rockRough, snowRough,
    noiseTex
  ].forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  });

  const uniforms = THREE.UniformsUtils.merge([
    {
      grassColor: { value: grassColor },
      rockColor: { value: rockColor },
      snowColor: { value: snowColor },
      grassNormal: { value: grassNormal },
      rockNormal: { value: rockNormal },
      snowNormal: { value: snowNormal },
      grassAO: { value: grassAO },
      rockAO: { value: rockAO },
      snowAO: { value: snowAO },
      grassRough: { value: grassRough },
      rockRough: { value: rockRough },
      snowRough: { value: snowRough },
      noiseMap: { value: noiseTex },
      lightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
      shadowMap: { value: null },
      shadowMatrix: { value: new THREE.Matrix4() },
      fogColor: { value: new THREE.Color(0xbec8e0) },
      fogNear: { value: 100 },
      fogFar: { value: 600 },
      time: { value: 0.0 }
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
    uniform sampler2D grassColor, rockColor, snowColor;
    uniform sampler2D grassNormal, rockNormal, snowNormal;
    uniform sampler2D grassAO, rockAO, snowAO;
    uniform sampler2D grassRough, rockRough, snowRough;
    uniform sampler2D noiseMap;
    uniform vec3 lightDirection;
    uniform sampler2D shadowMap;
    uniform mat4 shadowMatrix;
    uniform vec3 fogColor;
    uniform float fogNear, fogFar, time;

    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vWorldPosition;
    varying vec4 vShadowCoord;
    varying float vFogDepth;

    #include <packing>

    float getShadowFactor(vec4 shadowCoord) {
      vec3 projCoords = shadowCoord.xyz / shadowCoord.w;
      if (projCoords.x < 0.0 || projCoords.x > 1.0 || projCoords.y < 0.0 || projCoords.y > 1.0 || projCoords.z > 1.0) return 1.0;
      float bias = -0.003;
      float shadow = 0.0;
      float texelSize = 1.0 / 8192.0;
      for (int x = -1; x <= 1; ++x) {
        for (int y = -1; y <= 1; ++y) {
          vec2 offset = vec2(x, y) * texelSize;
          float closestDepth = texture2D(shadowMap, projCoords.xy + offset).r;
          shadow += (projCoords.z - bias > closestDepth) ? 0.4 : 1.0;
        }
      }
      return shadow / 9.0;
    }

    void main() {
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
      grassBlend += (noise - 0.5) * 0.1;
      rockBlend  += (0.5 - noise) * 0.08;

      vec3 baseColor = grassBlend * gTex + rockBlend * rTex + snowBlend * sTex;

      float gAO = texture2D(grassAO, macroUv).r;
      float rAO = texture2D(rockAO, macroUv).r;
      float sAO = texture2D(snowAO, macroUv).r;
      float ao = grassBlend * gAO + rockBlend * rAO + snowBlend * sAO;

      float gRough = texture2D(grassRough, macroUv).r;
      float rRough = texture2D(rockRough, macroUv).r;
      float sRough = texture2D(snowRough, macroUv).r;
      float roughness = grassBlend * gRough + rockBlend * rRough + snowBlend * sRough;

      float shoreFade = smoothstep(4.5, 6.0, height);
      vec3 wetColor = vec3(0.06, 0.08, 0.1);
      vec3 finalColor = mix(wetColor, baseColor, shoreFade);

      vec3 lightDir = normalize(lightDirection);
      float diff = max(dot(normalize(vNormal), lightDir), 0.0);
      float shadow = getShadowFactor(vShadowCoord);
      vec3 ambient = vec3(0.3);

      diff *= (1.0 - 0.4 * roughness);
      finalColor *= (ambient + diff * shadow);

      finalColor *= ao;

      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      vec3 halfDir = normalize(viewDir + lightDir);
      float spec = pow(max(dot(normalize(vNormal), halfDir), 0.0), 32.0);
      spec *= 1.0 - roughness;
      finalColor += vec3(0.2) * spec * shadow;

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
    precision: 'highp',
    depthWrite: true,
    depthTest: true,
    transparent: false,
    extensions: { derivatives: true }
  });
}
