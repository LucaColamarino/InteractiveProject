import * as THREE from 'three';

export function createTerrainMaterial(textureLoader) {
  const grassColor = textureLoader.load('/textures/grass_color.jpg');
  const rockColor = textureLoader.load('/textures/rock_color.jpg');
  const snowColor = textureLoader.load('/textures/snow_color.jpg');

  const grassNormal = textureLoader.load('/textures/grass_normal.jpg');
  const rockNormal = textureLoader.load('/textures/rock_normal.jpg');
  const snowNormal = textureLoader.load('/textures/snow_normal.jpg');

  [grassColor, rockColor, snowColor, grassNormal, rockNormal, snowNormal].forEach(tex => {
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
      vec2 tiledUv = vUv * 140.0;
      vec3 gTex = texture2D(grassColor, tiledUv).rgb;
      vec3 rTex = texture2D(rockColor, tiledUv).rgb;
      vec3 sTex = texture2D(snowColor, tiledUv).rgb;

      float h = vWorldPosition.y;
      float gFactor = smoothstep(0.0, 15.0, h);
      float rFactor = smoothstep(10.0, 25.0, h);
      float sFactor = smoothstep(20.0, 60.0, h);

      float total = gFactor + rFactor + sFactor + 0.0001;
      gFactor /= total;
      rFactor /= total;
      sFactor /= total;

      vec3 blendedColor = gTex * gFactor + rTex * rFactor + sTex * sFactor;

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
    precision: 'highp',
    depthWrite: true,
    depthTest: true,
    transparent: false,
    extensions: { derivatives: true }
  });
} 
