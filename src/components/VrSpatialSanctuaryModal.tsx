import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LoreFile, Chat, Folder } from '../types';
import {
  X,
  Glasses,
  Mic,
  MicOff,
  Compass,
  BookOpen,
  Users,
  Sparkles,
  Volume2,
  VolumeX,
  RotateCcw,
  ChevronRight,
  ChevronDown,
  Eye,
  Send
} from 'lucide-react';

interface VrSpatialSanctuaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeChat?: Chat;
  activeFolder?: Folder;
  loreFiles: LoreFile[];
  onSendSpatialPrompt: (promptText: string) => void;
}

interface CharacterTotemData {
  id: string;
  name: string;
  role: string;
  color: number;
  hex: string;
  position: [number, number, number];
  loreNote: string;
}

const INITIAL_TOTEMS: CharacterTotemData[] = [
  {
    id: 'kolder',
    name: 'Kolder Zekshoyu',
    role: 'Protagonista · Portador Rúnico',
    color: 0x38bdf8,
    hex: '#38bdf8',
    position: [-0.8, 1.08, 0.3],
    loreNote: 'Postura táctica silenciosa, mate rúnico y guardia de medio alcance.'
  },
  {
    id: 'hinistra',
    name: 'Hinistra',
    role: 'Vanguardia · Resonancia',
    color: 0xf43f5e,
    hex: '#f43f5e',
    position: [0.75, 1.08, 0.25],
    loreNote: 'Despliegue ofensivo asimétrico y control de línea frontal.'
  },
  {
    id: 'jukkou',
    name: 'Núcleo Jukkou',
    role: 'Anomalía de Monstereth',
    color: 0xa855f7,
    hex: '#a855f7',
    position: [0.0, 1.08, -0.45],
    loreNote: 'Eje gravitacional del conflicto en Monstereth.'
  },
  {
    id: 'zankyou',
    name: 'Eco Zankyou',
    role: 'Rastro Acústico / Memoria',
    color: 0xf59e0b,
    hex: '#f59e0b',
    position: [-0.45, 1.08, -0.35],
    loreNote: 'Distorsión de eco residual entre capítulos.'
  },
  {
    id: 'gurasha',
    name: 'Gurasha',
    role: 'Observador / Flanco',
    color: 0x10b981,
    hex: '#10b981',
    position: [0.48, 1.08, -0.38],
    loreNote: 'Posicionamiento lateral de intercepción.'
  }
];

type SpatialStation = 'overview' | 'core' | 'tomes' | 'diorama';

// Pre-allocated scratch vectors/matrices/colors outside the render loop
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.08);
const _intersectPoint = new THREE.Vector3();
const _tempMatrix = new THREE.Matrix4();
const _cameraTargetPos = new THREE.Vector3(0, 2.2, 5.2);
const _cameraLookAtPos = new THREE.Vector3(0, 1.3, 0);
const _currentLookAt = new THREE.Vector3(0, 1.3, 0);
const _moveForward = new THREE.Vector3();
const _moveRight = new THREE.Vector3();
const _upVector = new THREE.Vector3(0, 1, 0);
const _targetBgColor = new THREE.Color(0x06070c);

function createLabelTexture(title: string, subtitle: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark glass rounded background
  ctx.fillStyle = 'rgba(9, 9, 14, 0.86)';
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 22);
  ctx.fill();
  ctx.stroke();

  // Title
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.slice(0, 26), canvas.width / 2, 68);

  // Subtitle
  ctx.fillStyle = accentHex;
  ctx.font = '600 20px Inter, system-ui, sans-serif';
  ctx.fillText(subtitle.slice(0, 36), canvas.width / 2, 114);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export const VrSpatialSanctuaryModal: React.FC<VrSpatialSanctuaryModalProps> = ({
  isOpen,
  onClose,
  activeChat,
  activeFolder,
  loreFiles,
  onSendSpatialPrompt
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rigRef = useRef<THREE.Group | null>(null);

  const [station, setStation] = useState<SpatialStation>('overview');
  const [webXrSupported, setWebXrSupported] = useState<boolean>(false);
  const [isInXrSession, setIsInXrSession] = useState<boolean>(false);
  const [xrStatusMsg, setXrStatusMsg] = useState<string>('Modo Interactivo 3D Libre (WASD / Ratón / Touch / WebXR)');
  const [selectedTome, setSelectedTome] = useState<any | null>(null);
  const [selectedTotem, setSelectedTotem] = useState<CharacterTotemData>(INITIAL_TOTEMS[0]);
  const [totemPositions, setTotemPositions] = useState<Record<string, [number, number, number]>>(() => {
    const map: Record<string, [number, number, number]> = {};
    INITIAL_TOTEMS.forEach((t) => {
      map[t.id] = [...t.position];
    });
    return map;
  });

  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceDraft, setVoiceDraft] = useState<string>('');
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [atmospherePreset, setAtmospherePreset] = useState<'noir' | 'astral' | 'crimson'>('noir');
  const [isHudCollapsed, setIsHudCollapsed] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const totemMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const draggingTotemIdRef = useRef<string | null>(null);
  const hoveredObjectNameRef = useRef<string | null>(null);
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);

  const lastAssistantMessage = React.useMemo(() => {
    if (!activeChat?.messages) return null;
    for (let i = activeChat.messages.length - 1; i >= 0; i--) {
      if (activeChat.messages[i].role === 'assistant' && activeChat.messages[i].content.trim()) {
        return activeChat.messages[i];
      }
    }
    return null;
  }, [activeChat?.messages]);

  // Check WebXR support for Meta Quest 3 / PSVR2 (PC adapter / WebXR browser)
  useEffect(() => {
    if (!isOpen) return;
    if (typeof navigator !== 'undefined' && 'xr' in navigator && (navigator as any).xr) {
      (navigator as any).xr
        .isSessionSupported('immersive-vr')
        .then((supported: boolean) => {
          setWebXrSupported(Boolean(supported));
        })
        .catch(() => setWebXrSupported(false));
    }
  }, [isOpen]);

  // Speak assistant response when in VR voice mode if TTS enabled
  useEffect(() => {
    if (!isOpen || !ttsEnabled || !lastAssistantMessage || lastAssistantMessage.isStreaming) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const cleanText = lastAssistantMessage.content
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/[#*_`~>-]/g, '')
      .slice(0, 360);
    if (!cleanText.trim()) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(cleanText);
    utter.lang = 'es-ES';
    utter.rate = 1.04;
    window.speechSynthesis.speak(utter);
  }, [lastAssistantMessage?.id, lastAssistantMessage?.isStreaming, isOpen, ttsEnabled]);

  // Camera station transitions
  useEffect(() => {
    if (station === 'overview') {
      _cameraTargetPos.set(0, 2.35, 5.4);
      _cameraLookAtPos.set(0, 1.35, 0);
    } else if (station === 'core') {
      _cameraTargetPos.set(0, 2.05, 1.6);
      _cameraLookAtPos.set(0, 2.15, -3.1);
    } else if (station === 'tomes') {
      _cameraTargetPos.set(-1.35, 1.85, 2.2);
      _cameraLookAtPos.set(-3.1, 1.45, -0.4);
    } else if (station === 'diorama') {
      _cameraTargetPos.set(0, 2.35, 1.95);
      _cameraLookAtPos.set(0, 1.0, 0);
    }
  }, [station]);

  // Update atmosphere color preset
  useEffect(() => {
    const targetHex =
      atmospherePreset === 'noir'
        ? 0x06070c
        : atmospherePreset === 'astral'
        ? 0x071324
        : 0x16070c;
    _targetBgColor.setHex(targetHex);
  }, [atmospherePreset]);

  // Initialize Three.js + WebXR 3D Sanctuary
  useEffect(() => {
    if (!isOpen || !mountRef.current) return;

    const container = mountRef.current;
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070c);
    scene.fog = new THREE.FogExp2(0x06070c, 0.042);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 120);
    camera.position.set(0, 2.35, 5.4);
    cameraRef.current = camera;

    const cameraRig = new THREE.Group();
    cameraRig.position.set(0, 0, 0);
    scene.add(cameraRig);
    rigRef.current = cameraRig;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 1.1;
    controls.maxDistance = 14;
    controls.target.set(0, 1.35, 0);
    controlsRef.current = controls;

    // 3-Point + Rim Lighting Setup
    const ambientLight = new THREE.HemisphereLight(0xa5b4fc, 0x09090b, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xe0f2fe, 1.8);
    keyLight.position.set(4.5, 8.5, 5.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xa855f7, 3.2, 14);
    rimLight.position.set(0, 3.6, -3.5);
    scene.add(rimLight);

    const tableSpot = new THREE.SpotLight(0x38bdf8, 4.0, 10, Math.PI / 4, 0.45, 1.5);
    tableSpot.position.set(0, 4.2, 0);
    tableSpot.castShadow = true;
    scene.add(tableSpot);

    const disposableGeometries: THREE.BufferGeometry[] = [];
    const disposableMaterials: THREE.Material[] = [];
    const disposableTextures: THREE.Texture[] = [];
    const interactiveObjects: THREE.Object3D[] = [];

    // 1. ARCHITECTURAL SANCTUARY FLOOR & RUNES
    const floorGeo = new THREE.CircleGeometry(16, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090a10,
      roughness: 0.25,
      metalness: 0.75
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);
    disposableGeometries.push(floorGeo);
    disposableMaterials.push(floorMat);

    const gridHelper = new THREE.GridHelper(28, 56, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = 0.01;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.24;
    scene.add(gridHelper);

    // Outer Astral Pillars (8 architectural monoliths around the sanctuary)
    const pillarGeo = new THREE.BoxGeometry(0.45, 5.5, 0.45);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x11131f,
      roughness: 0.35,
      metalness: 0.85
    });
    const pillarStripGeo = new THREE.BoxGeometry(0.08, 4.8, 0.48);
    const pillarStripMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.4
    });
    disposableGeometries.push(pillarGeo, pillarStripGeo);
    disposableMaterials.push(pillarMat, pillarStripMat);

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const radius = 8.2;
      const pillarGroup = new THREE.Group();
      pillarGroup.position.set(Math.cos(angle) * radius, 2.75, Math.sin(angle) * radius);
      pillarGroup.lookAt(0, 2.75, 0);

      const pMesh = new THREE.Mesh(pillarGeo, pillarMat);
      pMesh.castShadow = true;
      pMesh.receiveShadow = true;
      const sMesh = new THREE.Mesh(pillarStripGeo, pillarStripMat);
      pillarGroup.add(pMesh, sMesh);
      scene.add(pillarGroup);
    }

    // 2. STATION A: KIZUNA-ZEK 3D CORE (Composite Gyroscope + Crystalline Polyhedron at North Z = -3.2)
    const coreGroup = new THREE.Group();
    coreGroup.position.set(0, 2.15, -3.2);
    coreGroup.userData = { type: 'station-core', label: 'Núcleo Kizuna-Zek · Pulsa para hablar o enfocar' };
    scene.add(coreGroup);

    const corePedestalGeo = new THREE.CylinderGeometry(0.65, 0.85, 0.9, 32);
    const corePedestalMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.3,
      metalness: 0.85
    });
    const corePedestal = new THREE.Mesh(corePedestalGeo, corePedestalMat);
    corePedestal.position.set(0, -1.7, 0);
    corePedestal.castShadow = true;
    coreGroup.add(corePedestal);

    const innerCoreGeo = new THREE.IcosahedronGeometry(0.52, 1);
    const innerCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.4,
      roughness: 0.15,
      metalness: 0.2,
      transmission: 0.65,
      thickness: 1.0
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    innerCoreMesh.userData = { type: 'station-core', label: 'Núcleo Kizuna-Zek · Comando de Voz Espacial' };
    coreGroup.add(innerCoreMesh);
    interactiveObjects.push(innerCoreMesh);

    const wireCoreGeo = new THREE.IcosahedronGeometry(0.62, 1);
    const wireCoreMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    const wireCoreMesh = new THREE.Mesh(wireCoreGeo, wireCoreMat);
    coreGroup.add(wireCoreMesh);

    const ring1Geo = new THREE.TorusGeometry(0.86, 0.022, 16, 96);
    const ring1Mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.1,
      metalness: 0.9,
      roughness: 0.2
    });
    const ring1Mesh = new THREE.Mesh(ring1Geo, ring1Mat);
    coreGroup.add(ring1Mesh);

    const ring2Geo = new THREE.TorusGeometry(1.12, 0.018, 16, 96);
    const ring2Mat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x9333ea,
      emissiveIntensity: 1.2,
      metalness: 0.9,
      roughness: 0.2
    });
    const ring2Mesh = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2Mesh.rotation.x = Math.PI / 3;
    coreGroup.add(ring2Mesh);

    const coreLabelTex = createLabelTexture('KIZUNA-ZEK CORE', 'Núcleo Neural & Voz VR', '#38bdf8');
    const coreLabelMat = new THREE.SpriteMaterial({ map: coreLabelTex, transparent: true });
    const coreLabelSprite = new THREE.Sprite(coreLabelMat);
    coreLabelSprite.position.set(0, 1.48, 0);
    coreLabelSprite.scale.set(2.2, 0.68, 1);
    coreGroup.add(coreLabelSprite);

    disposableGeometries.push(corePedestalGeo, innerCoreGeo, wireCoreGeo, ring1Geo, ring2Geo);
    disposableMaterials.push(corePedestalMat, innerCoreMat, wireCoreMat, ring1Mat, ring2Mat, coreLabelMat);
    disposableTextures.push(coreLabelTex);

    // 3. STATION B: 3D TACTICAL DIORAMA TABLE OF MONSTERETH (Center X=0, Z=0)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(0, 0, 0);
    scene.add(tableGroup);

    const tableBaseGeo = new THREE.CylinderGeometry(1.35, 1.55, 0.96, 48);
    const tableBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f131f,
      roughness: 0.35,
      metalness: 0.85
    });
    const tableBaseMesh = new THREE.Mesh(tableBaseGeo, tableBaseMat);
    tableBaseMesh.position.y = 0.48;
    tableBaseMesh.castShadow = true;
    tableBaseMesh.receiveShadow = true;
    tableGroup.add(tableBaseMesh);

    const tableRimGeo = new THREE.TorusGeometry(1.42, 0.045, 20, 96);
    const tableRimMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0369a1,
      emissiveIntensity: 0.95,
      metalness: 0.9,
      roughness: 0.2
    });
    const tableRimMesh = new THREE.Mesh(tableRimGeo, tableRimMat);
    tableRimMesh.rotation.x = Math.PI / 2;
    tableRimMesh.position.y = 0.98;
    tableGroup.add(tableRimMesh);

    // Top holographic terrain disc
    const holoMapGeo = new THREE.CylinderGeometry(1.32, 1.32, 0.04, 48);
    const holoMapMat = new THREE.MeshStandardMaterial({
      color: 0x082f49,
      emissive: 0x0c4a6e,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.6
    });
    const holoMapMesh = new THREE.Mesh(holoMapGeo, holoMapMat);
    holoMapMesh.position.y = 0.99;
    holoMapMesh.receiveShadow = true;
    holoMapMesh.userData = { type: 'diorama-surface', label: 'Mesa Táctica de Monstereth · Arrastra los Tótems' };
    tableGroup.add(holoMapMesh);

    // Tactical concentric rings on table surface
    const innerRingGeo = new THREE.RingGeometry(0.45, 0.47, 64);
    const outerRingGeo = new THREE.RingGeometry(0.88, 0.9, 64);
    const ringOverlayMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45
    });
    const innerRingMesh = new THREE.Mesh(innerRingGeo, ringOverlayMat);
    innerRingMesh.rotation.x = -Math.PI / 2;
    innerRingMesh.position.y = 1.015;
    const outerRingMesh = new THREE.Mesh(outerRingGeo, ringOverlayMat);
    outerRingMesh.rotation.x = -Math.PI / 2;
    outerRingMesh.position.y = 1.015;
    tableGroup.add(innerRingMesh, outerRingMesh);

    disposableGeometries.push(tableBaseGeo, tableRimGeo, holoMapGeo, innerRingGeo, outerRingGeo);
    disposableMaterials.push(tableBaseMat, tableRimMat, holoMapMat, ringOverlayMat);

    // Create 3D Character Totems on the Tactical Table (composite multi-part figurines)
    totemMeshesRef.current.clear();
    const pawnBaseGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.08, 24);
    const pawnBodyGeo = new THREE.ConeGeometry(0.095, 0.28, 24);
    const pawnHeadGeo = new THREE.OctahedronGeometry(0.075, 1);
    const pawnHaloGeo = new THREE.TorusGeometry(0.12, 0.012, 12, 32);
    disposableGeometries.push(pawnBaseGeo, pawnBodyGeo, pawnHeadGeo, pawnHaloGeo);

    INITIAL_TOTEMS.forEach((totem) => {
      const totemGroup = new THREE.Group();
      const savedPos = totemPositions[totem.id] || totem.position;
      totemGroup.position.set(savedPos[0], 1.08, savedPos[2]);

      const mat = new THREE.MeshStandardMaterial({
        color: totem.color,
        emissive: totem.color,
        emissiveIntensity: 0.45,
        roughness: 0.25,
        metalness: 0.75
      });
      disposableMaterials.push(mat);

      const baseMesh = new THREE.Mesh(pawnBaseGeo, mat);
      baseMesh.castShadow = true;

      const bodyMesh = new THREE.Mesh(pawnBodyGeo, mat);
      bodyMesh.position.y = 0.18;
      bodyMesh.castShadow = true;

      const headMesh = new THREE.Mesh(pawnHeadGeo, mat);
      headMesh.position.y = 0.38;
      headMesh.castShadow = true;

      const haloMesh = new THREE.Mesh(pawnHaloGeo, mat);
      haloMesh.rotation.x = Math.PI / 2;
      haloMesh.position.y = 0.22;

      const labelTex = createLabelTexture(totem.name, totem.role, totem.hex);
      const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
      const labelSprite = new THREE.Sprite(labelMat);
      labelSprite.position.set(0, 0.62, 0);
      labelSprite.scale.set(0.92, 0.28, 1);
      disposableMaterials.push(labelMat);
      disposableTextures.push(labelTex);

      const userDataPayload = {
        type: 'totem',
        totemId: totem.id,
        totemData: totem,
        label: `Tótem 3D: ${totem.name} (Arrastra en la mesa)`
      };

      totemGroup.userData = userDataPayload;
      baseMesh.userData = userDataPayload;
      bodyMesh.userData = userDataPayload;
      headMesh.userData = userDataPayload;

      totemGroup.add(baseMesh, bodyMesh, headMesh, haloMesh, labelSprite);
      scene.add(totemGroup);
      totemMeshesRef.current.set(totem.id, totemGroup);
      interactiveObjects.push(baseMesh, bodyMesh, headMesh);
    });

    // 4. STATION C: 3D LORE BÓVEDA TOMES (Floating 3D Grimoires on Left Arc X < 0)
    const displayTomes: any[] =
      loreFiles.length > 0
        ? loreFiles.slice(0, 8)
        : [
            {
              id: 'demo-cap-1',
              title: 'Cap. 1 · El Eco de Monstereth',
              fileType: 'canon',
              estimatedTokens: 4120,
              updatedAt: Date.now(),
              summary: 'Apertura en Monstereth. Kolder establece su cadencia física frente a la anomalía acústica.',
              content:
                'El viento frío de Monstereth cortaba la piedra húmeda mientras Kolder ajustaba el agarre de su mate rúnico...'
            },
            {
              id: 'demo-cap-2',
              title: 'Cap. 2 · Geometría de Hinistra',
              fileType: 'canon',
              estimatedTokens: 3890,
              updatedAt: Date.now(),
              summary: 'Sincronización de vanguardia entre Hinistra y Kolder en el corredor norte.',
              content:
                'Hinistra no miró atrás; el pulso carmesí de su línea de ataque marcaba el compás exacto de entrada...'
            },
            {
              id: 'demo-cap-3',
              title: 'Códice · Sistema Rúnico & Zankyou',
              fileType: 'glossary',
              estimatedTokens: 2750,
              updatedAt: Date.now(),
              summary: 'Reglas físicas de resonancia Zankyou y límites estructurales del portador.',
              content:
                'Toda resonancia en Jukkou no Zankyou deja una huella térmica y acústica proporcional a la densidad...'
            }
          ];

    const tomeStandGeo = new THREE.CylinderGeometry(0.24, 0.32, 1.05, 20);
    const tomeStandMat = new THREE.MeshStandardMaterial({
      color: 0x131624,
      roughness: 0.4,
      metalness: 0.8
    });
    const bookCoverGeo = new THREE.BoxGeometry(0.36, 0.48, 0.07);
    const bookPagesGeo = new THREE.BoxGeometry(0.33, 0.45, 0.055);
    const bookPagesMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      roughness: 0.6,
      metalness: 0.1
    });
    disposableGeometries.push(tomeStandGeo, bookCoverGeo, bookPagesGeo);
    disposableMaterials.push(tomeStandMat, bookPagesMat);

    const floatingBooks: THREE.Group[] = [];

    displayTomes.forEach((tome: any, idx) => {
      const arcAngle = Math.PI * 0.62 + (idx / Math.max(1, displayTomes.length - 1)) * (Math.PI * 0.65);
      const radius = 3.45;
      const x = Math.cos(arcAngle) * radius;
      const z = Math.sin(arcAngle) * radius;

      const pedestalGroup = new THREE.Group();
      pedestalGroup.position.set(x, 0, z);
      pedestalGroup.lookAt(0, 0, 0);
      scene.add(pedestalGroup);

      const standMesh = new THREE.Mesh(tomeStandGeo, tomeStandMat);
      standMesh.position.y = 0.525;
      standMesh.castShadow = true;
      pedestalGroup.add(standMesh);

      const bookGroup = new THREE.Group();
      bookGroup.position.set(0, 1.38, 0);

      const tomeType = tome.fileType || tome.type || 'canon';
      const tomeName = tome.title || tome.name || tome.filename || 'Tomo sin título';
      const tomeTokens = tome.estimatedTokens || tome.tokenCount || 0;

      const accentColor =
        tomeType === 'canon' ? 0x10b981 : tomeType === 'character' ? 0xf43f5e : 0xa855f7;
      const accentHex =
        tomeType === 'canon' ? '#10b981' : tomeType === 'character' ? '#f43f5e' : '#a855f7';

      const coverMat = new THREE.MeshStandardMaterial({
        color: 0x1e1b4b,
        emissive: accentColor,
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.7
      });
      disposableMaterials.push(coverMat);

      const coverMesh = new THREE.Mesh(bookCoverGeo, coverMat);
      coverMesh.castShadow = true;
      const pagesMesh = new THREE.Mesh(bookPagesGeo, bookPagesMat);
      pagesMesh.position.x = 0.015;

      const labelTex = createLabelTexture(
        tomeName,
        `${tomeTokens.toLocaleString()} tok · ${String(tomeType).toUpperCase()}`,
        accentHex
      );
      const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
      const labelSprite = new THREE.Sprite(labelMat);
      labelSprite.position.set(0, 0.45, 0);
      labelSprite.scale.set(1.25, 0.38, 1);
      disposableMaterials.push(labelMat);
      disposableTextures.push(labelTex);

      const payload = {
        type: 'tome',
        tomeData: {
          ...tome,
          name: tomeName,
          type: tomeType,
          tokenCount: tomeTokens,
          summary: tome.summary || (tome.content ? tome.content.slice(0, 140) + '...' : '')
        },
        label: `Abrir Tomo 3D: ${tomeName}`
      };
      coverMesh.userData = payload;
      pagesMesh.userData = payload;
      bookGroup.userData = payload;

      bookGroup.add(coverMesh, pagesMesh, labelSprite);
      pedestalGroup.add(bookGroup);
      floatingBooks.push(bookGroup);
      interactiveObjects.push(coverMesh, pagesMesh);
    });

    // 5. AMBIENT ASTRAL PARTICLES
    const particleCount = 420;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      particlePositions[i * 3] = (Math.random() - 0.5) * 20;
      particlePositions[i * 3 + 1] = 0.3 + Math.random() * 6.5;
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.045,
      transparent: true,
      opacity: 0.65
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);
    disposableGeometries.push(particleGeo);
    disposableMaterials.push(particleMat);

    // 6. WEBXR CONTROLLERS (Meta Quest 3 Touch Plus & PSVR2 Sense Controllers Laser Rays)
    const controllerLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -4.5)
    ]);
    const controllerLineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8 });
    disposableGeometries.push(controllerLineGeo);
    disposableMaterials.push(controllerLineMat);

    const controllers: THREE.Group[] = [];
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const laserLine = new THREE.Line(controllerLineGeo, controllerLineMat);
      controller.add(laserLine);

      controller.addEventListener('selectstart', () => {
        _tempMatrix.identity().extractRotation(controller.matrixWorld);
        _raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        _raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_tempMatrix);
        const hits = _raycaster.intersectObjects(interactiveObjects, false);
        if (hits.length > 0) {
          const hitData = hits[0].object.userData;
          if (hitData?.type === 'tome' && hitData.tomeData) {
            setSelectedTome(hitData.tomeData);
            setStation('tomes');
          } else if (hitData?.type === 'totem' && hitData.totemData) {
            setSelectedTotem(hitData.totemData);
            draggingTotemIdRef.current = hitData.totemId;
          } else if (hitData?.type === 'station-core') {
            setStation('core');
          }
        }
      });

      controller.addEventListener('selectend', () => {
        draggingTotemIdRef.current = null;
      });

      cameraRig.add(controller);
      controllers.push(controller);
    }

    // 7. POINTER & KEYBOARD WASD INTERACTION FOR 3D FREE ROAM & TOTEM DRAGGING
    const keysPressed = new Set<string>();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      keysPressed.add(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const updateNormalizedPointer = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerDown = (e: PointerEvent) => {
      updateNormalizedPointer(e.clientX, e.clientY);
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects(interactiveObjects, false);

      if (hits.length > 0) {
        const data = hits[0].object.userData;
        if (data?.type === 'totem' && data.totemId) {
          draggingTotemIdRef.current = data.totemId;
          setSelectedTotem(data.totemData);
          controls.enabled = false;
        } else if (data?.type === 'tome' && data.tomeData) {
          setSelectedTome(data.tomeData);
          setStation('tomes');
        } else if (data?.type === 'station-core') {
          setStation('core');
        }
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      updateNormalizedPointer(e.clientX, e.clientY);
      _raycaster.setFromCamera(_pointerNdc, camera);

      if (draggingTotemIdRef.current) {
        if (_raycaster.ray.intersectPlane(_dragPlane, _intersectPoint)) {
          // Constrain totem inside the circular tactical table radius (1.18m)
          const planarDist = Math.hypot(_intersectPoint.x, _intersectPoint.z);
          if (planarDist > 1.18) {
            _intersectPoint.x = (_intersectPoint.x / planarDist) * 1.18;
            _intersectPoint.z = (_intersectPoint.z / planarDist) * 1.18;
          }
          const totemMesh = totemMeshesRef.current.get(draggingTotemIdRef.current);
          if (totemMesh) {
            totemMesh.position.set(_intersectPoint.x, 1.08, _intersectPoint.z);
            const id = draggingTotemIdRef.current;
            setTotemPositions((prev) => ({
              ...prev,
              [id]: [
                Number(_intersectPoint.x.toFixed(2)),
                1.08,
                Number(_intersectPoint.z.toFixed(2))
              ]
            }));
          }
        }
        return;
      }

      const hits = _raycaster.intersectObjects(interactiveObjects, false);
      const hitLabel = hits.length > 0 ? hits[0].object.userData?.label || null : null;
      if (hitLabel !== hoveredObjectNameRef.current) {
        hoveredObjectNameRef.current = hitLabel;
        setHoveredLabel(hitLabel);
        renderer.domElement.style.cursor = hitLabel ? 'pointer' : 'grab';
      }
    };

    const handlePointerUp = () => {
      if (draggingTotemIdRef.current) {
        draggingTotemIdRef.current = null;
        controls.enabled = true;
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    // Resize listener
    const handleResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth || window.innerWidth;
      const h = mountRef.current.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 8. ANIMATION LOOP (Supports both standard 60/120fps and WebXR 90/120Hz stereo rendering)
    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Update background atmosphere smoothly without allocating inside the loop
      if (scene.background instanceof THREE.Color) {
        scene.background.lerp(_targetBgColor, 0.05);
      }

      // Animate Kizuna-Zek 3D Core
      innerCoreMesh.rotation.y = elapsed * 0.65;
      innerCoreMesh.rotation.x = Math.sin(elapsed * 0.5) * 0.35;
      wireCoreMesh.rotation.y = -elapsed * 0.45;
      ring1Mesh.rotation.z = elapsed * 0.8;
      ring1Mesh.rotation.x = Math.sin(elapsed * 0.7) * 0.5;
      ring2Mesh.rotation.y = -elapsed * 0.95;

      // Float 3D Lore Tomes smoothly
      for (let i = 0; i < floatingBooks.length; i++) {
        const b = floatingBooks[i];
        b.position.y = 1.38 + Math.sin(elapsed * 1.8 + i * 0.9) * 0.06;
        b.rotation.y = Math.sin(elapsed * 0.6 + i) * 0.18;
      }

      // Subtle rotation on astral particles
      particleSystem.rotation.y = elapsed * 0.03;

      // Keyboard WASD locomotion in non-XR mode
      if (!renderer.xr.isPresenting) {
        const moveSpeed = 3.2 * delta;
        camera.getWorldDirection(_moveForward);
        _moveForward.y = 0;
        _moveForward.normalize();
        _moveRight.crossVectors(_moveForward, _upVector).normalize();

        let movedManually = false;
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) {
          camera.position.addScaledVector(_moveForward, moveSpeed);
          controls.target.addScaledVector(_moveForward, moveSpeed);
          movedManually = true;
        }
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) {
          camera.position.addScaledVector(_moveForward, -moveSpeed);
          controls.target.addScaledVector(_moveForward, -moveSpeed);
          movedManually = true;
        }
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) {
          camera.position.addScaledVector(_moveRight, -moveSpeed);
          controls.target.addScaledVector(_moveRight, -moveSpeed);
          movedManually = true;
        }
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) {
          camera.position.addScaledVector(_moveRight, moveSpeed);
          controls.target.addScaledVector(_moveRight, moveSpeed);
          movedManually = true;
        }

        // Smooth camera station glide when not manually orbiting/moving
        if (!movedManually && !draggingTotemIdRef.current) {
          _currentLookAt.lerp(_cameraLookAtPos, 0.06);
          controls.target.copy(_currentLookAt);
        }
        controls.update();
      } else {
        // WebXR Thumbstick Locomotion (Meta Quest 3 / PSVR2 Sense Joysticks)
        const session = renderer.xr.getSession();
        if (session) {
          for (const source of session.inputSources) {
            if (source.gamepad && source.gamepad.axes.length >= 4) {
              const axisX = source.gamepad.axes[2] || 0;
              const axisY = source.gamepad.axes[3] || 0;
              if (Math.abs(axisX) > 0.15 || Math.abs(axisY) > 0.15) {
                cameraRig.position.x += axisX * 2.4 * delta;
                cameraRig.position.z += axisY * 2.4 * delta;
              }
            }
          }
        }
      }

      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      controls.dispose();
      disposableGeometries.forEach((g) => g.dispose());
      disposableMaterials.forEach((m) => m.dispose());
      disposableTextures.forEach((t) => t.dispose());
      renderer.dispose();
    };
  }, [isOpen, loreFiles]);

  // Enter / Exit native WebXR immersive-vr session (Quest 3 / PSVR2)
  const handleToggleWebXr = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    if (isInXrSession) {
      const currentSession = renderer.xr.getSession();
      if (currentSession) {
        await currentSession.end();
      }
      setIsInXrSession(false);
      return;
    }

    if (typeof navigator !== 'undefined' && 'xr' in navigator && (navigator as any).xr) {
      try {
        const sessionInit = {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers']
        };
        const session = await (navigator as any).xr.requestSession('immersive-vr', sessionInit);
        renderer.xr.setReferenceSpaceType('local-floor');
        await renderer.xr.setSession(session);
        setIsInXrSession(true);
        setXrStatusMsg('Sesión WebXR Activa · Meta Quest 3 / PSVR2 6DoF');
        session.addEventListener('end', () => {
          setIsInXrSession(false);
          setXrStatusMsg('Modo Interactivo 3D Libre (WASD / Ratón / Touch / WebXR)');
        });
      } catch (err: any) {
        setXrStatusMsg(
          'WebXR bloqueado por el contenedor o sin visor conectado. Usando Cámara Espacial 3D Libre.'
        );
      }
    } else {
      setXrStatusMsg('Usa el navegador de Meta Quest 3 o PCVR (PSVR2) para WebXR nativo.');
    }
  };

  // Voice Recognition inside the 3D Sanctuary
  const toggleSpatialVoice = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setXrStatusMsg('Reconocimiento de voz no disponible en este navegador.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const rec = new SpeechRec();
    rec.lang = 'es-AR';
    rec.continuous = false;
    rec.interimResults = true;

    rec.onstart = () => {
      setIsListening(true);
      setStation('core');
    };
    rec.onresult = (event: any) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setVoiceDraft(transcript);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    rec.onerror = () => {
      setIsListening(false);
    };

    recognitionRef.current = rec;
    rec.start();
  };

  // Dispatch spatial tactical coordinates + prompt to Kizuna-Zek
  const handleSendTacticalAnalysis = () => {
    const coordsSummary = INITIAL_TOTEMS.map((t) => {
      const pos = totemPositions[t.id] || t.position;
      const distFromCenter = Math.hypot(pos[0], pos[2]).toFixed(2);
      const sector =
        pos[2] < -0.25 ? 'Sector Norte (Vanguardia)' : pos[2] > 0.25 ? 'Sector Sur (Retaguardia)' : 'Eje Central';
      return `- **${t.name}** (${t.role}): Coordenadas 3D [X:${pos[0]}, Z:${pos[2]}] · Radio ${distFromCenter}m · ${sector}`;
    }).join('\n');

    const prompt = `[SANTUARIO ESPACIAL 3D · MESA TÁCTICA DE MONSTERETH]\nHe dispuesto los tótems 3D en la mesa táctica con la siguiente geometría espacial:\n${coordsSummary}\n\nAnaliza la coreografía espacial de esta escena para *Jukkou no Zankyou*: líneas de visión, distancias de ataque/resonancia entre Kolder e Hinistra respecto al Núcleo Jukkou, y cómo narrar el movimiento físico en este bloqueo escénico.`;
    onSendSpatialPrompt(prompt);
    setXrStatusMsg('Coreografía 3D enviada al motor de Kizuna-Zek.');
  };

  const handleResetTotems = () => {
    const resetMap: Record<string, [number, number, number]> = {};
    INITIAL_TOTEMS.forEach((t) => {
      resetMap[t.id] = [...t.position];
      const mesh = totemMeshesRef.current.get(t.id);
      if (mesh) {
        mesh.position.set(t.position[0], t.position[1], t.position[2]);
      }
    });
    setTotemPositions(resetMap);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-[#06070c] text-zinc-100 flex flex-col overflow-hidden select-none">
      {/* FULL-VIEWPORT INTERACTIVE 3D THREE.JS + WEBXR CANVAS */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* FLOATING 3D OBJECT HOVER RETICLE PILL */}
      {hoveredLabel && (
        <div className="pointer-events-none fixed top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full bg-zinc-950/85 border border-sky-500/40 text-sky-300 text-xs font-medium tracking-wide shadow-lg backdrop-blur-md">
          {hoveredLabel}
        </div>
      )}

      {/* MINIMAL SPATIAL TOP BAR */}
      <div className="relative z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/35 flex items-center justify-center text-sky-400">
            <Glasses className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm md:text-base font-semibold tracking-tight text-white">
                Santuario Espacial 3D · Monstereth
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
                Meta Quest 3 · PSVR2 · 3D Free-Roam
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 truncate max-w-[260px] sm:max-w-md">
              {xrStatusMsg}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Atmosphere Selector */}
          <div className="hidden sm:flex items-center bg-zinc-900/80 border border-white/10 rounded-xl p-1">
            {(['noir', 'astral', 'crimson'] as const).map((preset) => (
              <button
                key={preset}
                onClick={() => setAtmospherePreset(preset)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium capitalize transition-all ${
                  atmospherePreset === preset
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Native WebXR Launch Button for Quest 3 / PSVR2 */}
          <button
            onClick={handleToggleWebXr}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
              isInXrSession
                ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                : webXrSupported
                ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-300 shadow-lg shadow-sky-500/20'
                : 'bg-zinc-900/85 hover:bg-zinc-800 text-zinc-200 border-white/15'
            }`}
            title="Iniciar modo inmersivo estereoscópico WebXR en Meta Quest 3 o PSVR2"
          >
            <Glasses className="w-4 h-4" />
            <span>{isInXrSession ? 'Salir de VR' : 'Entrar en VR (Quest 3 / PSVR2)'}</span>
          </button>

          <button
            onClick={() => setTtsEnabled((v) => !v)}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 flex items-center justify-center text-zinc-300"
            title={ttsEnabled ? 'Voz neural activada' : 'Voz neural silenciada'}
          >
            {ttsEnabled ? <Volume2 className="w-4 h-4 text-sky-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-zinc-900/80 hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 flex items-center justify-center text-zinc-300 hover:text-rose-300 transition-colors"
            title="Cerrar Santuario 3D"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* FLOATING 3D LORE TOME READER PANEL (Opens when clicking a 3D Book Pedestal) */}
      {selectedTome && (
        <div className="relative z-20 mx-4 mt-2 max-w-md bg-zinc-950/88 border border-emerald-500/35 rounded-2xl p-4 backdrop-blur-xl shadow-2xl pointer-events-auto">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400">
                Tomo 3D de la Bóveda · {selectedTome.type}
              </span>
              <h3 className="text-sm font-bold text-white mt-0.5">{selectedTome.name}</h3>
            </div>
            <button
              onClick={() => setSelectedTome(null)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {selectedTome.summary && (
            <p className="text-xs text-emerald-200/90 bg-emerald-950/40 border border-emerald-500/20 rounded-xl p-2.5 mb-2.5">
              {selectedTome.summary}
            </p>
          )}
          <div className="max-h-40 overflow-y-auto text-xs text-zinc-300 leading-relaxed pr-1 whitespace-pre-wrap">
            {selectedTome.content.slice(0, 900)}
            {selectedTome.content.length > 900 ? '...' : ''}
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-zinc-400">
              {selectedTome.tokenCount.toLocaleString()} tokens indexados
            </span>
            <button
              onClick={() => {
                onSendSpatialPrompt(
                  `[SANTUARIO VR 3D · CONSULTA DE TOMO "${selectedTome.name}"]\nAnaliza la continuidad narrativa y los detalles clave de este tomo de mi bóveda.`
                );
                setSelectedTome(null);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-medium"
            >
              Inspeccionar con Kizuna-Zek
            </button>
          </div>
        </div>
      )}

      {/* SPATIAL BOTTOM DOCK: 3D STATION TELEPORTERS + TACTICAL DIORAMA & VOICE */}
      <div className="mt-auto relative z-20 p-3 md:p-4 pointer-events-none">
        <div className="max-w-4xl mx-auto bg-zinc-950/82 border border-white/12 rounded-2xl backdrop-blur-xl shadow-2xl p-3 pointer-events-auto">
          {/* Station Teleporter Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setStation('overview')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                  station === 'overview'
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                    : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Vista General 3D</span>
              </button>

              <button
                onClick={() => setStation('diorama')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                  station === 'diorama'
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                    : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Mesa Táctica (Tótems 3D)</span>
              </button>

              <button
                onClick={() => setStation('tomes')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                  station === 'tomes'
                    ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                    : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Círculo de Tomos ({loreFiles.length || 3})</span>
              </button>

              <button
                onClick={() => setStation('core')}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                  station === 'core'
                    ? 'bg-purple-500/25 text-purple-300 border border-purple-500/40'
                    : 'bg-zinc-900/70 text-zinc-400 hover:text-zinc-200 border border-white/5'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Núcleo Kizuna-Zek</span>
              </button>
            </div>

            <button
              onClick={() => setIsHudCollapsed((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-zinc-900/80 border border-white/10 text-xs text-zinc-400 hover:text-white flex items-center gap-1"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isHudCollapsed ? 'Mostrar Panel' : 'Solo 3D'}</span>
              {isHudCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {!isHudCollapsed && (
            <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              {/* Left: Active 3D Totem Inspector & Tactical Table Controls */}
              <div className="md:col-span-7 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-900/65 border border-white/8 rounded-xl p-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedTotem.hex }}
                    />
                    <span className="text-xs font-semibold text-white truncate">
                      {selectedTotem.name}
                    </span>
                    <span className="text-[11px] text-zinc-400 truncate">
                      · Pos [
                      {(totemPositions[selectedTotem.id] || selectedTotem.position)[0]},{' '}
                      {(totemPositions[selectedTotem.id] || selectedTotem.position)[2]}]
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    Arrastra los tótems 3D sobre la mesa para simular posiciones de combate o diálogo.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleResetTotems}
                    className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs flex items-center gap-1"
                    title="Restaurar posiciones en la mesa"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSendTacticalAnalysis}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analizar Escena 3D</span>
                  </button>
                </div>
              </div>

              {/* Right: Direct Spatial Voice / Command Input to 3D Core */}
              <div className="md:col-span-5 flex items-center gap-2">
                <button
                  onClick={toggleSpatialVoice}
                  className={`min-h-[42px] min-w-[42px] rounded-xl border flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-500/25 border-rose-500 text-rose-300 animate-pulse'
                      : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
                  }`}
                  title="Hablar por micrófono al Núcleo 3D"
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={voiceDraft}
                  onChange={(e) => setVoiceDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && voiceDraft.trim()) {
                      onSendSpatialPrompt(`[SANTUARIO 3D VR] ${voiceDraft.trim()}`);
                      setVoiceDraft('');
                    }
                  }}
                  placeholder={
                    activeFolder
                      ? `Hablar al núcleo en ${activeFolder.name}...`
                      : 'Hablar al Núcleo 3D o pedir escena...'
                  }
                  className="flex-1 min-h-[42px] px-3 rounded-xl bg-zinc-900/90 border border-white/10 text-[16px] md:text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500/50"
                />

                <button
                  onClick={() => {
                    if (!voiceDraft.trim()) return;
                    onSendSpatialPrompt(`[SANTUARIO 3D VR] ${voiceDraft.trim()}`);
                    setVoiceDraft('');
                  }}
                  disabled={!voiceDraft.trim()}
                  className="min-h-[42px] min-w-[42px] rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 flex items-center justify-center transition-all"
                  title="Enviar al Núcleo 3D"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
