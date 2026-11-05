import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, ChevronDown, Check, MessageSquare, X, Plus, Activity, SlidersHorizontal, Subtitles, Send } from 'lucide-react';

interface VoiceCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeModelName: string;
  activeProvider: 'gemini' | 'custom' | 'alibaba';
  alibabaApiKey?: string;
  onSelectQuickModel?: (provider: 'gemini' | 'custom' | 'alibaba', model: string) => void;
  onSendVoiceTurn: (
    spokenText: string,
    onResponseReady: (replyText: string) => void,
    onError: (errText: string) => void,
    onStreamUpdate?: (liveText: string) => void
  ) => void;
  onStopGeneration?: () => void;
}

type CallStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error';

function cleanTextForSpeech(rawReply: string): string {
  if (!rawReply) return '';
  return rawReply
    .replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '')
    .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_~`>]/g, '')
    .trim();
}

function splitIntoSpeakableSentences(cleanText: string): string[] {
  if (!cleanText) return [];
  const rawParts = cleanText
    .split(/(?<=[.!?;\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (const part of rawParts) {
    if (merged.length > 0 && merged[merged.length - 1].length < 16) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`;
    } else if (part.length > 220) {
      // Split overly long clauses on commas/colons so TTS stays under 200 chars per request
      const subClauses = part.split(/(?<=[,:—])\s+/).filter(Boolean);
      let buf = '';
      for (const sc of subClauses) {
        if ((buf + ' ' + sc).trim().length <= 190) {
          buf = buf ? `${buf} ${sc}` : sc;
        } else {
          if (buf) merged.push(buf);
          buf = sc;
        }
      }
      if (buf) merged.push(buf);
    } else {
      merged.push(part);
    }
  }
  return merged;
}

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
  isOpen,
  onClose,
  activeModelName,
  activeProvider,
  alibabaApiKey,
  onSelectQuickModel,
  onSendVoiceTurn,
  onStopGeneration,
}) => {
  // All hooks strictly at the top level (React 19 compliance)
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [userTranscript, setUserTranscript] = useState('');
  const [assistantSubtitle, setAssistantSubtitle] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [voicePreset, setVoicePreset] = useState<'Cherry' | 'Serena' | 'Luca' | 'Ethan'>('Cherry');
  // Default to Voz HD Neural so voices sound warm, human, and natural like ChatGPT/Gemini
  const [useAlibabaHdVoice, setUseAlibabaHdVoice] = useState(true);

  // Live Call Telemetry State (Tokens, Response Time, Estimated Cost)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastTurnTokens, setLastTurnTokens] = useState<number>(0);
  const [totalCallTokens, setTotalCallTokens] = useState<number>(0);
  const [totalCallCostUsd, setTotalCallCostUsd] = useState<number>(0);
  const [turnsCount, setTurnsCount] = useState<number>(0);
  const [isTranscriptLogOpen, setIsTranscriptLogOpen] = useState<boolean>(false);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState<boolean>(false);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(false);
  const [inlinePrompt, setInlinePrompt] = useState<string>('');
  const [callHistoryLog, setCallHistoryLog] = useState<
    Array<{ id: string; role: 'user' | 'assistant'; text: string; time: string }>
  >([]);

  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const callStatusRef = useRef<CallStatus>(callStatus);
  const angryFlashUntilRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const isMutedRef = useRef(isMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);
  const useAlibabaHdVoiceRef = useRef(useAlibabaHdVoice);
  const voicePresetRef = useRef<'Cherry' | 'Serena' | 'Luca' | 'Ethan'>(voicePreset);
  const alibabaApiKeyRef = useRef(alibabaApiKey);
  const onSendVoiceTurnRef = useRef(onSendVoiceTurn);
  const handleProcessSpokenTurnRef = useRef<(spokenText: string) => void>(() => {});
  const lastSpokenReplyRef = useRef<string>('');
  const speechSessionIdRef = useRef<number>(0);
  const speechQueueRef = useRef<Array<{ text: string; audioPromise: Promise<string | null> }>>([]);
  const isPlayingQueueRef = useRef<boolean>(false);
  const streamCompletedRef = useRef<boolean>(true);
  const enqueuedSentencesCountRef = useRef<number>(0);
  const firstAudioLatencyRecordedRef = useRef<boolean>(false);
  const turnStartPerfRef = useRef<number>(0);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);

  useEffect(() => {
    useAlibabaHdVoiceRef.current = useAlibabaHdVoice;
  }, [useAlibabaHdVoice]);

  useEffect(() => {
    voicePresetRef.current = voicePreset;
  }, [voicePreset]);

  useEffect(() => {
    alibabaApiKeyRef.current = alibabaApiKey;
  }, [alibabaApiKey]);

  useEffect(() => {
    onSendVoiceTurnRef.current = onSendVoiceTurn;
  }, [onSendVoiceTurn]);

  // Procedural 60fps Sky-Cloud Fluid Orb Canvas with Dynamic Emotion & State Colors:
  // - Blue: Idle / Muted ("en reposo")
  // - Green: Listening ("cuando escucha")
  // - Amber: Speaking / Thinking ("cuando empieza a hablar")
  // - Red: Momentary flash when angry/intense ("cuando se enoje por un momento")
  useEffect(() => {
    if (!isOpen) return;
    const canvas = orbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animFrameId: number;
    let phase = Math.random() * 100;
    let currentEnergy = 1;

    // Palettes defined as RGB tuples: [stop1, stop2, stop3, stop4, shadow1, shadow2, cloudTint]
    type Rgb = [number, number, number];
    interface OrbPalette {
      s1: Rgb;
      s2: Rgb;
      s3: Rgb;
      s4: Rgb;
      sh1: Rgb;
      sh2: Rgb;
      cMid: Rgb;
      cEdge: Rgb;
    }

    const PALETTES: Record<'noir_idle' | 'noir_listen' | 'orange' | 'red', OrbPalette> = {
      // Noir Reposo / Silenciado (Obsidiana, grafito y humo de plata)
      noir_idle: {
        s1: [228, 228, 231],
        s2: [113, 113, 122],
        s3: [39, 39, 42],
        s4: [9, 9, 11],
        sh1: [24, 24, 27],
        sh2: [63, 63, 70],
        cMid: [244, 244, 245],
        cEdge: [161, 161, 170],
      },
      // Noir Escuchando (Blanco puro, alabastro luminoso y sombras negro carbón)
      noir_listen: {
        s1: [255, 255, 255],
        s2: [212, 212, 216],
        s3: [63, 63, 70],
        s4: [14, 14, 18],
        sh1: [24, 24, 29],
        sh2: [82, 82, 91],
        cMid: [255, 255, 255],
        cEdge: [228, 228, 231],
      },
      // Naranja Kizuna: Hablando / Pensando (Blanco incandescente + Naranja + Obsidiana)
      orange: {
        s1: [255, 237, 213],
        s2: [251, 146, 60],
        s3: [234, 88, 12],
        s4: [67, 20, 7],
        sh1: [124, 45, 18],
        sh2: [194, 65, 12],
        cMid: [255, 247, 237],
        cEdge: [253, 186, 116],
      },
      // Rojo / Carmesí: Intensidad dramática
      red: {
        s1: [254, 202, 202],
        s2: [248, 113, 113],
        s3: [220, 38, 38],
        s4: [69, 10, 10],
        sh1: [127, 29, 29],
        sh2: [185, 28, 28],
        cMid: [254, 226, 226],
        cEdge: [252, 165, 165],
      },
    };

    // Current interpolated palette starts in Monochrome Noir
    const cur: OrbPalette = JSON.parse(JSON.stringify(PALETTES.noir_listen));

    const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];

    const rgbStr = (c: Rgb, alpha = 1) =>
      `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`;

    const renderOrb = () => {
      const status = callStatusRef.current;
      const now = Date.now();
      const isAngryFlash = now < angryFlashUntilRef.current || status === 'error';

      const targetKey: 'noir_idle' | 'noir_listen' | 'orange' | 'red' = isAngryFlash
        ? 'red'
        : status === 'speaking' || status === 'thinking'
          ? 'orange'
          : status === 'listening'
            ? 'noir_listen'
            : 'noir_idle';

      const targetPal = PALETTES[targetKey];
      const colorSpeed = isAngryFlash ? 0.12 : 0.055;

      cur.s1 = lerpRgb(cur.s1, targetPal.s1, colorSpeed);
      cur.s2 = lerpRgb(cur.s2, targetPal.s2, colorSpeed);
      cur.s3 = lerpRgb(cur.s3, targetPal.s3, colorSpeed);
      cur.s4 = lerpRgb(cur.s4, targetPal.s4, colorSpeed);
      cur.sh1 = lerpRgb(cur.sh1, targetPal.sh1, colorSpeed);
      cur.sh2 = lerpRgb(cur.sh2, targetPal.sh2, colorSpeed);
      cur.cMid = lerpRgb(cur.cMid, targetPal.cMid, colorSpeed);
      cur.cEdge = lerpRgb(cur.cEdge, targetPal.cEdge, colorSpeed);

      const targetEnergy = isAngryFlash
        ? 3.6
        : status === 'speaking'
          ? 2.7
          : status === 'thinking'
            ? 2.1
            : status === 'listening'
              ? 1.15
              : 0.6; // Calm slow drift when in Blue idle/muted

      currentEnergy += (targetEnergy - currentEnergy) * 0.06;
      phase += 0.012 * currentEnergy;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // 1. Base Diagonal Sky Gradient
      const angle = -Math.PI / 4 + Math.sin(phase * 0.4) * 0.22;
      const gx1 = w * 0.5 + Math.cos(angle) * w * 0.48;
      const gy1 = h * 0.5 + Math.sin(angle) * h * 0.48;
      const gx2 = w * 0.5 - Math.cos(angle) * w * 0.48;
      const gy2 = h * 0.5 - Math.sin(angle) * h * 0.48;

      const baseGrad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
      baseGrad.addColorStop(0, '#ffffff');
      baseGrad.addColorStop(0.28, rgbStr(cur.s1));
      baseGrad.addColorStop(0.58, rgbStr(cur.s2));
      baseGrad.addColorStop(0.85, rgbStr(cur.s3));
      baseGrad.addColorStop(1, rgbStr(cur.s4));

      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Volumetric Cloud Shadows (Lower-Left & Mid Swirls)
      const shadowPuffs = [
        { ox: 0.32, oy: 0.72, r: 0.55, sx: 0.7, sy: 0.5, sp: 0.9 },
        { ox: 0.58, oy: 0.78, r: 0.48, sx: -0.6, sy: 0.8, sp: 1.15 },
        { ox: 0.22, oy: 0.48, r: 0.44, sx: 0.8, sy: -0.5, sp: 0.75 },
      ];

      for (let i = 0; i < shadowPuffs.length; i++) {
        const p = shadowPuffs[i];
        const cx = w * (p.ox + Math.sin(phase * p.sp + i * 1.7) * 0.14 * p.sx);
        const cy = h * (p.oy + Math.cos(phase * p.sp * 0.85 + i * 2.1) * 0.14 * p.sy);
        const rad = w * p.r * (1 + Math.sin(phase * 2.2 + i) * 0.06 * (currentEnergy * 0.5));
        const g = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
        g.addColorStop(0, rgbStr(cur.sh1, 0.88));
        g.addColorStop(0.55, rgbStr(cur.sh2, 0.45));
        g.addColorStop(1, rgbStr(cur.s2, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // 3. Billowing Sunlit White & Tinted Cumulus Cloud Layers
      const cloudPuffs = [
        { ox: 0.62, oy: 0.28, r: 0.54, sp: 1.0, alpha: 0.96 },
        { ox: 0.38, oy: 0.34, r: 0.46, sp: 1.25, alpha: 0.88 },
        { ox: 0.74, oy: 0.48, r: 0.44, sp: 0.85, alpha: 0.90 },
        { ox: 0.48, oy: 0.52, r: 0.42, sp: 1.4, alpha: 0.78 },
        { ox: 0.26, oy: 0.26, r: 0.38, sp: 1.1, alpha: 0.82 },
      ];

      for (let i = 0; i < cloudPuffs.length; i++) {
        const c = cloudPuffs[i];
        const wave =
          status === 'speaking' || isAngryFlash ? Math.sin(phase * 3.8 + i * 1.2) * 0.055 : 0;
        const cx = w * (c.ox + Math.cos(phase * c.sp + i * 1.3) * 0.13 + wave);
        const cy = h * (c.oy + Math.sin(phase * c.sp * 0.9 + i * 1.9) * 0.12 - wave);
        const rad = w * c.r * (1 + Math.cos(phase * 2.5 + i) * 0.08 * (currentEnergy * 0.45));

        const g = ctx.createRadialGradient(cx, cy, rad * 0.08, cx, cy, rad);
        g.addColorStop(0, `rgba(255, 255, 255, ${c.alpha})`);
        g.addColorStop(0.48, rgbStr(cur.cMid, c.alpha * 0.68));
        g.addColorStop(0.78, rgbStr(cur.cEdge, c.alpha * 0.25));
        g.addColorStop(1, rgbStr(cur.s2, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // 4. Subtle Spherical Inner Rim Shading
      const rimGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.36, w * 0.5, h * 0.5, w * 0.5);
      rimGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      rimGrad.addColorStop(0.82, rgbStr(cur.s4, 0.08));
      rimGrad.addColorStop(1, rgbStr(cur.s4, 0.26));
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, w, h);

      animFrameId = requestAnimationFrame(renderOrb);
    };

    animFrameId = requestAnimationFrame(renderOrb);
    return () => cancelAnimationFrame(animFrameId);
  }, [isOpen]);

  const stopAllAudioAndSpeech = useCallback(() => {
    speechSessionIdRef.current += 1;
    speechQueueRef.current = [];
    isPlayingQueueRef.current = false;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
        audioPlayerRef.current.src = '';
      } catch {}
      audioPlayerRef.current = null;
    }
  }, []);

  const stopRecognition = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  const startListening = useCallback(() => {
    if (!isOpenRef.current || isMutedRef.current) return;

    stopAllAudioAndSpeech();
    stopRecognition();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setCallStatus('error');
      setAssistantSubtitle('Tu navegador no soporta reconocimiento de voz en vivo (Web Speech API).');
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'es-ES';

      let finalCaptured = '';
      let lastInterim = '';
      let turnDispatched = false;

      const dispatchCapturedTurn = () => {
        if (turnDispatched || !isMountedRef.current || !isOpenRef.current) return;
        const cleanSpoken = (finalCaptured.trim() + ' ' + lastInterim.trim()).trim();
        if (cleanSpoken.length > 1) {
          turnDispatched = true;
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          try {
            rec.onend = null;
            rec.stop();
          } catch {}
          recognitionRef.current = null;
          handleProcessSpokenTurnRef.current(cleanSpoken);
        }
      };

      rec.onstart = () => {
        if (!isMountedRef.current || !isOpenRef.current) return;
        setCallStatus('listening');
        setUserTranscript('');
      };

      rec.onresult = (event: any) => {
        let interim = '';
        let finalStr = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalStr += transcript;
          } else {
            interim += transcript;
          }
        }
        if (finalStr) {
          finalCaptured = (finalCaptured + ' ' + finalStr).trim();
          lastInterim = '';
        } else {
          lastInterim = interim.trim();
        }
        const currentDisplay = (finalCaptured + ' ' + lastInterim).trim();
        if (currentDisplay) {
          setUserTranscript(currentDisplay);
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }
          // Fast silence detection (650ms after final punctuation, 820ms after normal speech pause)
          const endsWithPunctuation = /[.!?]$/.test(currentDisplay);
          const silenceDelayMs = finalStr && endsWithPunctuation ? 620 : finalStr ? 760 : 920;
          silenceTimerRef.current = setTimeout(() => {
            dispatchCapturedTurn();
          }, silenceDelayMs);
        }
      };

      rec.onerror = (e: any) => {
        if (!isMountedRef.current || !isOpenRef.current) return;
        if (e.error === 'no-speech') {
          if (!isMutedRef.current && isOpenRef.current && !turnDispatched) {
            setTimeout(() => {
              if (isOpenRef.current && !isMutedRef.current && !turnDispatched) startListening();
            }, 250);
          }
          return;
        }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setCallStatus('error');
          setAssistantSubtitle('Permiso de micrófono denegado. Revisá los permisos del navegador.');
        }
      };

      rec.onend = () => {
        if (!isMountedRef.current || !isOpenRef.current || turnDispatched) return;
        const cleanSpoken = (finalCaptured.trim() + ' ' + lastInterim.trim()).trim();
        if (cleanSpoken.length > 1) {
          dispatchCapturedTurn();
        } else if (!isMutedRef.current && isOpenRef.current) {
          setTimeout(() => {
            if (isOpenRef.current && !isMutedRef.current && !turnDispatched) startListening();
          }, 250);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setCallStatus('idle');
    }
  }, [stopAllAudioAndSpeech, stopRecognition]);

  const speakSingleSentenceBrowser = useCallback(
    (sentenceText: string, sessionId: number): Promise<void> => {
      return new Promise((resolve) => {
        if (
          typeof window === 'undefined' ||
          !window.speechSynthesis ||
          !isMountedRef.current ||
          !isOpenRef.current ||
          speechSessionIdRef.current !== sessionId
        ) {
          resolve();
          return;
        }

        const voices = window.speechSynthesis.getVoices();
        const activePreset = voicePresetRef.current;
        const isMasculine = activePreset === 'Luca' || activePreset === 'Ethan';
        const spanishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));

        // Prioritize Online / Natural / Neural / Google voices first so it never sounds metallic
        const neuralSpanishVoices = spanishVoices.filter((v) =>
          /natural|online|neural|google|premium|enhanced/i.test(v.name)
        );
        const pool = neuralSpanishVoices.length > 0 ? neuralSpanishVoices : spanishVoices;

        let targetVoice =
          pool.find((v) =>
            isMasculine
              ? /male|hombre|alvaro|tomas|jorge|pablo|diego|raul|carlos|enrique|alonso|nestor|sergio/i.test(v.name)
              : /female|mujer|elena|elvira|dalia|sabina|monica|helena|laura|paulina|paloma|lucia/i.test(v.name)
          ) ||
          spanishVoices.find((v) =>
            isMasculine
              ? /male|hombre|alvaro|tomas|jorge|pablo|diego|raul|carlos|enrique|alonso|nestor|sergio/i.test(v.name)
              : /female|mujer|elena|elvira|dalia|sabina|monica|helena|laura|paulina|paloma|lucia/i.test(v.name)
          ) ||
          pool[0] ||
          null;

        const utterance = new SpeechSynthesisUtterance(sentenceText);
        if (targetVoice) utterance.voice = targetVoice;
        utterance.lang = targetVoice?.lang || 'es-ES';

        // Keep pitch strictly within natural human formant range (0.95 - 1.03) so voices never sound robotic or distorted
        if (activePreset === 'Cherry') {
          utterance.rate = 1.03;
          utterance.pitch = 1.02;
        } else if (activePreset === 'Serena') {
          utterance.rate = 0.97;
          utterance.pitch = 0.99;
        } else if (activePreset === 'Luca') {
          utterance.rate = 0.96;
          utterance.pitch = 0.95;
        } else {
          utterance.rate = 1.02;
          utterance.pitch = 0.98;
        }

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    },
    []
  );

  const fetchNeuralSentenceAudio = useCallback(async (sentenceText: string): Promise<string | null> => {
    if (!useAlibabaHdVoiceRef.current || !sentenceText.trim()) return null;
    const currentVoice = voicePresetRef.current;
    const effectiveAliKey = (
      alibabaApiKeyRef.current ||
      localStorage.getItem('kizuna_alibaba_api_key') ||
      ''
    ).trim();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2400);
      const ttsRes = await fetch('/api/alibaba/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sentenceText.trim(),
          alibabaApiKey: effectiveAliKey,
          voice: currentVoice,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        const src = ttsData.audioDataUrl || ttsData.audioUrl;
        if (src && !ttsData.fallback) {
          return src;
        }
      }
    } catch {
      // Fall back cleanly to natural browser voice for this sentence
    }
    return null;
  }, []);

  const processSpeechQueue = useCallback(
    async (sessionId: number) => {
      if (isPlayingQueueRef.current) return;
      isPlayingQueueRef.current = true;

      while (
        speechQueueRef.current.length > 0 &&
        isMountedRef.current &&
        isOpenRef.current &&
        speechSessionIdRef.current === sessionId &&
        !isSpeakerMutedRef.current
      ) {
        const nextItem = speechQueueRef.current.shift();
        if (!nextItem) break;

        setCallStatus('speaking');

        const hasAngryCue =
          /\b(enoj\w*|furi\w*|molest\w*|basta|maldici\w*|jamás|odio|ira|ridícul\w*|mentir\w*|cállate|estúpid\w*|carajo|demonios|inaceptable|hart[oa]|grit\w*|ataque|peligro|fuego|sangre)\b/i.test(
            nextItem.text
          );
        if (hasAngryCue) {
          angryFlashUntilRef.current = Date.now() + 2200;
        }

        const audioSrc = await nextItem.audioPromise;
        if (
          !isMountedRef.current ||
          !isOpenRef.current ||
          speechSessionIdRef.current !== sessionId ||
          isSpeakerMutedRef.current
        ) {
          break;
        }

        if (!firstAudioLatencyRecordedRef.current && turnStartPerfRef.current > 0) {
          firstAudioLatencyRecordedRef.current = true;
          const nowPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();
          setLastLatencyMs(Math.max(150, Math.round(nowPerf - turnStartPerfRef.current)));
        }

        if (audioSrc) {
          await new Promise<void>((resolve) => {
            const audio = new Audio(audioSrc);
            audioPlayerRef.current = audio;
            let settled = false;
            const finish = () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            };
            audio.onended = finish;
            audio.onerror = () => {
              speakSingleSentenceBrowser(nextItem.text, sessionId).then(finish);
            };
            audio.play().catch(() => {
              speakSingleSentenceBrowser(nextItem.text, sessionId).then(finish);
            });
          });
        } else {
          await speakSingleSentenceBrowser(nextItem.text, sessionId);
        }
      }

      isPlayingQueueRef.current = false;

      if (
        isMountedRef.current &&
        isOpenRef.current &&
        speechSessionIdRef.current === sessionId &&
        streamCompletedRef.current &&
        speechQueueRef.current.length === 0
      ) {
        angryFlashUntilRef.current = 0;
        if (!isMutedRef.current) {
          startListening();
        } else {
          setCallStatus('idle');
        }
      }
    },
    [speakSingleSentenceBrowser, startListening]
  );

  const enqueueSentenceForSpeech = useCallback(
    (sentenceText: string, sessionId: number) => {
      const cleanSentence = sentenceText.trim();
      if (!cleanSentence || isSpeakerMutedRef.current) return;
      const audioPromise = fetchNeuralSentenceAudio(cleanSentence);
      speechQueueRef.current.push({ text: cleanSentence, audioPromise });
      void processSpeechQueue(sessionId);
    },
    [fetchNeuralSentenceAudio, processSpeechQueue]
  );

  const speakReply = useCallback(
    async (rawReply: string) => {
      if (!isMountedRef.current || !isOpenRef.current) return;

      const cleanText = cleanTextForSpeech(rawReply);
      if (!cleanText) {
        if (!isMutedRef.current) startListening();
        return;
      }

      lastSpokenReplyRef.current = cleanText;
      setAssistantSubtitle(cleanText);

      if (isSpeakerMutedRef.current) {
        setCallStatus('idle');
        if (!isMutedRef.current) {
          setTimeout(() => startListening(), 500);
        }
        return;
      }

      stopAllAudioAndSpeech();
      const sessionId = speechSessionIdRef.current;
      streamCompletedRef.current = true;
      enqueuedSentencesCountRef.current = 0;

      const sentences = splitIntoSpeakableSentences(cleanText);
      for (const s of sentences) {
        enqueueSentenceForSpeech(s, sessionId);
      }
    },
    [enqueueSentenceForSpeech, startListening, stopAllAudioAndSpeech]
  );

  const handleProcessSpokenTurn = useCallback(
    (spokenText: string) => {
      stopRecognition();
      stopAllAudioAndSpeech();
      const activeSessionId = speechSessionIdRef.current;
      streamCompletedRef.current = false;
      enqueuedSentencesCountRef.current = 0;
      firstAudioLatencyRecordedRef.current = false;
      turnStartPerfRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now();

      setCallStatus('thinking');
      setAssistantSubtitle('...');

      const currentVoice = voicePresetRef.current;
      const personaHint =
        currentVoice === 'Luca'
          ? 'con tono masculino serio, reflexivo y estilo narrador'
          : currentVoice === 'Ethan'
            ? 'con tono masculino joven, ágil y dinámico'
            : currentVoice === 'Serena'
              ? 'con tono femenino sereno, pausado y cálido'
              : 'con tono femenino enérgico, entusiasta y cercano';

      const voicePrompt = `[MODO LLAMADA DE VOZ EN VIVO CON EL AUTOR: Responde ${personaHint} como en una charla hablada natural y directa (máximo 1 a 3 oraciones cortas y fluidas), sin listas ni formato markdown ni emojis, para que suene orgánico al ser hablado en tiempo real]: ${spokenText}`;

      const nowTimeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      setCallHistoryLog((prev) => [
        ...prev,
        {
          id: `usr-${Date.now()}`,
          role: 'user',
          text: spokenText,
          time: nowTimeLabel,
        },
      ]);

      onSendVoiceTurnRef.current(
        voicePrompt,
        (replyText) => {
          if (!isMountedRef.current || !isOpenRef.current || speechSessionIdRef.current !== activeSessionId) return;
          streamCompletedRef.current = true;

          const cleanFinal = cleanTextForSpeech(replyText);
          lastSpokenReplyRef.current = cleanFinal;
          setAssistantSubtitle(cleanFinal);

          if (!firstAudioLatencyRecordedRef.current && turnStartPerfRef.current > 0) {
            const elapsedMs = Math.max(
              120,
              Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - turnStartPerfRef.current)
            );
            setLastLatencyMs(elapsedMs);
          }

          const inputTokensEst = Math.max(8, Math.ceil(spokenText.length / 3.8));
          const outputTokensEst = Math.max(12, Math.ceil(replyText.length / 3.8));
          const turnTokens = inputTokensEst + outputTokensEst;
          const textCost = (inputTokensEst * 0.07 + outputTokensEst * 0.28) / 1_000_000;

          setLastTurnTokens(turnTokens);
          setTotalCallTokens((prev) => prev + turnTokens);
          setTotalCallCostUsd((prev) => prev + textCost);
          setTurnsCount((prev) => prev + 1);

          if (cleanFinal) {
            setCallHistoryLog((prev) => [
              ...prev,
              {
                id: `ast-${Date.now()}`,
                role: 'assistant',
                text: cleanFinal,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
          }

          if (isSpeakerMutedRef.current) {
            setCallStatus('idle');
            if (!isMutedRef.current) {
              setTimeout(() => startListening(), 500);
            }
            return;
          }

          // Enqueue any remaining sentences that finished at the end of the stream
          const finalSentences = splitIntoSpeakableSentences(cleanFinal);
          const alreadyEnqueued = enqueuedSentencesCountRef.current;
          if (finalSentences.length > alreadyEnqueued) {
            for (let i = alreadyEnqueued; i < finalSentences.length; i++) {
              enqueueSentenceForSpeech(finalSentences[i], activeSessionId);
            }
            enqueuedSentencesCountRef.current = finalSentences.length;
          } else if (speechQueueRef.current.length === 0 && !isPlayingQueueRef.current) {
            if (!isMutedRef.current) {
              startListening();
            } else {
              setCallStatus('idle');
            }
          }
        },
        (errText) => {
          if (!isMountedRef.current || !isOpenRef.current) return;
          streamCompletedRef.current = true;
          setCallStatus('error');
          setAssistantSubtitle(errText || 'Error al obtener respuesta en llamada.');
        },
        (liveStreamText) => {
          if (!isMountedRef.current || !isOpenRef.current || speechSessionIdRef.current !== activeSessionId) return;
          const cleanLive = cleanTextForSpeech(liveStreamText);
          if (!cleanLive) return;

          setAssistantSubtitle(cleanLive);

          if (isSpeakerMutedRef.current) return;

          // Check if at least one full sentence has completed (followed by whitespace + next sentence start)
          const liveSentences = splitIntoSpeakableSentences(cleanLive);
          // All sentences except the last one are guaranteed complete because a boundary + space already followed them
          const completeCount = Math.max(0, liveSentences.length - 1);
          if (completeCount > enqueuedSentencesCountRef.current) {
            for (let i = enqueuedSentencesCountRef.current; i < completeCount; i++) {
              enqueueSentenceForSpeech(liveSentences[i], activeSessionId);
            }
            enqueuedSentencesCountRef.current = completeCount;
          }
        }
      );
    },
    [enqueueSentenceForSpeech, startListening, stopAllAudioAndSpeech, stopRecognition]
  );

  useEffect(() => {
    handleProcessSpokenTurnRef.current = handleProcessSpokenTurn;
  }, [handleProcessSpokenTurn]);

  // Preload browser synthesis voices on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // Start/stop call lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setCallSeconds(0);
      setLastLatencyMs(null);
      setLastTurnTokens(0);
      setTotalCallTokens(0);
      setTotalCallCostUsd(0);
      setTurnsCount(0);
      setCallHistoryLog([]);
      setIsTranscriptLogOpen(false);
      setUserTranscript('');
      setAssistantSubtitle('');
      const timer = setTimeout(() => {
        if (!isMutedRef.current) startListening();
      }, 300);
      const interval = setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);
      return () => {
        clearTimeout(timer);
        clearInterval(interval);
        stopRecognition();
        stopAllAudioAndSpeech();
      };
    } else {
      stopRecognition();
      stopAllAudioAndSpeech();
      setCallStatus('idle');
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen, startListening, stopRecognition, stopAllAudioAndSpeech]);

  const handleSelectVoicePersonality = (newPreset: 'Cherry' | 'Serena' | 'Luca' | 'Ethan', label: string) => {
    voicePresetRef.current = newPreset;
    setVoicePreset(newPreset);

    if (callStatus === 'speaking' && lastSpokenReplyRef.current) {
      speakReply(lastSpokenReplyRef.current);
    } else {
      setAssistantSubtitle(`Voz cambiada a ${label}`);
    }
  };

  const handleToggleHdVoiceMode = () => {
    const next = !useAlibabaHdVoiceRef.current;
    useAlibabaHdVoiceRef.current = next;
    setUseAlibabaHdVoice(next);

    if (callStatus === 'speaking' && lastSpokenReplyRef.current) {
      speakReply(lastSpokenReplyRef.current);
    }
  };

  const handleOrbTap = () => {
    setIsModelSelectorOpen(false);
    setIsVoicePickerOpen(false);
    if (callStatus === 'speaking' || callStatus === 'thinking') {
      stopAllAudioAndSpeech();
      onStopGeneration?.();
      setIsMuted(false);
      startListening();
    } else if (callStatus === 'listening') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    } else {
      setIsMuted(false);
      startListening();
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (next) {
      stopRecognition();
      setCallStatus('muted');
    } else {
      startListening();
    }
  };

  const handleSendInlineText = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inlinePrompt.trim();
    if (!trimmed) return;
    setInlinePrompt('');
    setUserTranscript(trimmed);
    handleProcessSpokenTurn(trimmed);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatOmniDisplayName = (rawName: string) => {
    const lower = rawName.toLowerCase();
    if (lower.includes('audio-3.1-realtime')) return 'Qwen-Audio 3.1 Realtime';
    if (lower.includes('audio-3.0-realtime')) return 'Qwen-Audio 3.0 Realtime';
    if (lower.includes('realtime')) return 'Qwen 3.8 Omni Realtime';
    if (lower.includes('omni-turbo') || lower.includes('omni-mini')) return 'Qwen 3.8 Omni Mini';
    if (lower.includes('omni')) return 'Qwen 3.8 Omni Flash';
    if (lower.includes('extended-thinking') || lower.includes('live-thinking')) return 'Gemini 3.8 Live Thinking';
    if (lower.includes('3.8-live') || lower.includes('gemini')) return 'Gemini 3.8 Live';
    return 'Qwen 3.8 Omni Realtime';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-between px-4 py-4 sm:p-6 bg-black text-white select-none modal-sheet-fluid font-sans">
      {/* Ultra-Clean Top Header (Noir Black, White & Orange Timer Pill + CC / Telemetry / Sliders) */}
      <div className="w-full max-w-md flex items-center justify-between pt-1 px-1">
        {/* Left: Brand Title & Active Call Noir/Orange Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[17px] font-semibold tracking-tight text-white">Kizuna</span>
            <span className="text-[17px] font-normal text-zinc-400">Voz</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-white font-semibold text-[11px] tracking-tight shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
            <span>{formatDuration(callSeconds)}</span>
          </div>
        </div>

        {/* Right: Minimalist Icon Bar (CC Subtitles, Live Telemetry, Voice & Engine Sliders) */}
        <div className="flex items-center gap-1.5">
          {/* CC Subtitles Toggle */}
          <button
            type="button"
            onClick={() => setShowSubtitles((v) => !v)}
            className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              showSubtitles
                ? 'bg-white text-black'
                : 'bg-[#161618] text-zinc-400 hover:text-white hover:bg-[#242428] border border-white/10'
            }`}
            title={showSubtitles ? 'Ocultar subtítulos (CC)' : 'Mostrar subtítulos en vivo (CC)'}
          >
            <Subtitles size={18} />
          </button>

          {/* Live Token Telemetry Toggle */}
          <button
            type="button"
            onClick={() => {
              setIsVoicePickerOpen(false);
              setIsModelSelectorOpen(false);
              setIsTelemetryOpen((v) => !v);
            }}
            className={`min-h-[44px] min-w-[44px] px-3 rounded-full flex items-center justify-center gap-1.5 text-xs font-sans font-medium transition-colors cursor-pointer ${
              isTelemetryOpen || totalCallTokens > 0
                ? 'bg-orange-500/15 text-orange-300 border border-orange-500/35'
                : 'bg-[#161618] text-zinc-400 hover:text-white hover:bg-[#242428] border border-white/10'
            }`}
            title="Telemetría de tokens en vivo"
          >
            <Activity size={16} className={isTelemetryOpen ? 'text-orange-400 animate-pulse' : ''} />
            {totalCallTokens > 0 && <span>{totalCallTokens}</span>}
          </button>

          {/* Speaker Mute Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !isSpeakerMuted;
              setIsSpeakerMuted(next);
              if (next) stopAllAudioAndSpeech();
            }}
            className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
              isSpeakerMuted
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/35'
                : 'bg-[#161618] text-zinc-400 hover:text-white hover:bg-[#242428] border border-white/10'
            }`}
            title={isSpeakerMuted ? 'Activar altavoz' : 'Silenciar altavoz'}
          >
            {isSpeakerMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          {/* Unified Voice & Model Sliders Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsTelemetryOpen(false);
                setIsVoicePickerOpen((v) => !v);
              }}
              className={`min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                isVoicePickerOpen
                  ? 'bg-white text-black'
                  : 'bg-[#161618] text-zinc-300 hover:text-white hover:bg-[#242428] border border-white/10'
              }`}
              title="Ajustes de voz y modelo Omni"
            >
              <SlidersHorizontal size={18} />
            </button>

            {isVoicePickerOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-24px)] bg-[#13131a]/95 backdrop-blur-2xl border border-white/12 rounded-[26px] shadow-[0_20px_50px_rgba(0,0,0,0.85)] p-3 z-[170] text-white space-y-3">
                {/* Voice Personality Section */}
                <div>
                  <div className="px-1 pb-1.5 text-[11px] font-medium text-zinc-400 tracking-tight flex items-center justify-between">
                    <span>Personalidad de voz</span>
                    <button
                      type="button"
                      onClick={handleToggleHdVoiceMode}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold transition-colors cursor-pointer ${
                        useAlibabaHdVoice
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                          : 'bg-white/10 text-zinc-200 border border-white/15'
                      }`}
                    >
                      {useAlibabaHdVoice ? 'Voz HD Neural' : 'Voz Eco $0'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'Cherry', label: 'Cherry', desc: 'Cálida y enérgica' },
                      { id: 'Serena', label: 'Serena', desc: 'Calma y suave' },
                      { id: 'Luca', label: 'Luca', desc: 'Grave narrador' },
                      { id: 'Ethan', label: 'Ethan', desc: 'Joven y ágil' },
                    ].map((vp) => {
                      const isSelected = voicePreset === vp.id;
                      return (
                        <button
                          key={vp.id}
                          type="button"
                          onClick={() => handleSelectVoicePersonality(vp.id as any, vp.label)}
                          className={`text-left px-3 py-2 rounded-2xl text-xs transition-colors cursor-pointer border ${
                            isSelected
                              ? 'bg-orange-500/15 text-white border-orange-500/45 font-semibold'
                              : 'bg-white/[0.04] border-white/8 text-zinc-300 hover:bg-white/[0.08]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span>{vp.label}</span>
                            {isSelected && <Check size={12} className="text-orange-400" />}
                          </div>
                          <div className="text-[10px] text-zinc-500 truncate">{vp.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Omni Model Selector */}
                <div className="pt-2 border-t border-white/10">
                  <div className="px-1 pb-1.5 text-[11px] font-medium text-zinc-400 tracking-tight">
                    Motor multimodal en vivo
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                    {[
                      {
                        id: 'qwen3.8-omni-flash-realtime',
                        name: 'Qwen 3.8 Omni Realtime',
                        desc: 'Voz + Texto nativo • 1M Gratis',
                        provider: 'alibaba',
                      },
                      {
                        id: 'qwen-audio-3.1-realtime-flash',
                        name: 'Qwen-Audio 3.1 Realtime',
                        desc: 'Full-Duplex • Baja latencia',
                        provider: 'alibaba',
                      },
                      {
                        id: 'qwen3.8-omni-flash',
                        name: 'Qwen 3.8 Omni Flash',
                        desc: 'Ultra económico ($0.07/1M)',
                        provider: 'alibaba',
                      },
                      {
                        id: 'gemini-3.8-live',
                        name: 'Gemini 3.8 Live',
                        desc: 'Motor en vivo de Google',
                        provider: 'gemini',
                      },
                    ].map((m) => {
                      const isSelected =
                        activeModelName.toLowerCase() === m.id.toLowerCase() ||
                        formatOmniDisplayName(activeModelName) === m.name;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onSelectQuickModel?.(m.provider as any, m.id);
                            setIsVoicePickerOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-xs text-left transition-colors cursor-pointer ${
                            isSelected
                              ? 'bg-white/12 text-white font-semibold border border-white/15'
                              : 'text-zinc-300 hover:bg-white/[0.06]'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <div className="truncate">{m.name}</div>
                            <div className="text-[10px] text-zinc-500 truncate">{m.desc}</div>
                          </div>
                          {isSelected && <Check size={13} className="text-orange-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center: Pure Monochrome Noir & Orange Fluid Cloud Sphere on Pitch-Black Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-auto px-4 text-center">
        <button
          type="button"
          onClick={handleOrbTap}
          className={`relative rounded-full overflow-hidden cursor-pointer focus:outline-none transition-transform duration-500 active:scale-95 shadow-[0_0_60px_rgba(255,255,255,0.08)] ${
            callStatus === 'speaking'
              ? 'w-52 h-52 sm:w-60 sm:h-60 scale-105 shadow-[0_0_70px_rgba(249,115,22,0.22)]'
              : callStatus === 'thinking'
                ? 'w-44 h-44 sm:w-52 sm:h-52 scale-95 animate-pulse'
                : 'w-48 h-48 sm:w-56 sm:h-56'
          }`}
          aria-label="Tocar esfera de voz para hablar o interrumpir"
        >
          <canvas
            ref={orbCanvasRef}
            width={360}
            height={360}
            className="w-full h-full block rounded-full pointer-events-none"
          />
        </button>

        {/* Subtle Status or Optional Live CC Subtitles */}
        <div className="w-full max-w-sm mt-8 min-h-[48px] flex flex-col items-center justify-center px-2">
          {showSubtitles ? (
            <>
              {userTranscript && (
                <p className="text-xs text-orange-300/90 italic line-clamp-2 mb-1">
                  “{userTranscript}”
                </p>
              )}
              {assistantSubtitle && (
                <p className="text-sm text-zinc-200 leading-relaxed line-clamp-3">
                  {assistantSubtitle}
                </p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-zinc-400 font-normal tracking-tight">
              {callStatus === 'speaking'
                ? 'Tocá el círculo para interrumpir'
                : callStatus === 'thinking'
                  ? 'Pensando...'
                  : callStatus === 'muted'
                    ? 'Micrófono silenciado'
                    : userTranscript
                      ? `“${userTranscript}”`
                      : `${voicePreset} • ${formatOmniDisplayName(activeModelName)}`}
            </p>
          )}
        </div>

        {/* Collapsible Real-Time Telemetry Bar (Tokens, Latency & Turns) */}
        {isTelemetryOpen && (
          <div className="mt-3 w-full max-w-md rounded-[24px] bg-[#13131a]/95 border border-white/12 p-3.5 text-xs text-zinc-300 shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <span className="text-xs font-semibold text-orange-400 flex items-center gap-1.5">
                <Activity size={13} /> Telemetría de llamada en vivo
              </span>
              <button
                type="button"
                onClick={() => setIsTelemetryOpen(false)}
                className="p-1 text-zinc-400 hover:text-white rounded cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-2xl bg-white/[0.04] border border-white/8">
                <div className="text-zinc-500 text-[10px]">Último turno</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {lastTurnTokens > 0 ? `${lastTurnTokens}` : '0'}
                </div>
              </div>
              <div className="p-2 rounded-2xl bg-orange-500/12 border border-orange-500/30">
                <div className="text-orange-400 text-[10px] font-semibold">Tokens voz</div>
                <div className="text-sm font-bold text-orange-200 mt-0.5">
                  {totalCallTokens} tok
                </div>
              </div>
              <div className="p-2 rounded-2xl bg-white/[0.04] border border-white/8">
                <div className="text-zinc-500 text-[10px]">Latencia</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {lastLatencyMs !== null ? `${(lastLatencyMs / 1000).toFixed(2)}s` : '—'}
                </div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400 px-1">
              <span>{turnsCount} turnos en esta llamada</span>
              <span>Costo est: ${totalCallCostUsd.toFixed(5)} USD</span>
            </div>
          </div>
        )}

        {/* Live Call Chat Transcript Drawer */}
        {isTranscriptLogOpen && (
          <div className="mt-3 w-full max-w-md rounded-[24px] bg-[#13131a]/95 border border-white/12 p-3.5 shadow-2xl">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-orange-400" />
                <span className="text-xs font-semibold text-zinc-100">
                  Transcripción ({callHistoryLog.length})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsTranscriptLogOpen(false)}
                className="min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/10 transition-colors cursor-pointer"
                title="Cerrar historial de llamada"
              >
                <X size={15} />
              </button>
            </div>

            <div className="max-h-40 overflow-y-auto space-y-2 pr-1 text-left">
              {callHistoryLog.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-4">
                  Todavía no hay mensajes en esta llamada. Todo lo que hables quedará guardado en tu chat.
                </p>
              ) : (
                callHistoryLog.map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                      entry.role === 'user'
                        ? 'bg-orange-500/15 border border-orange-500/30 text-orange-100 ml-6'
                        : 'bg-white/[0.05] border border-white/10 text-zinc-200 mr-6'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                      <span className="font-semibold">
                        {entry.role === 'user' ? 'Vos' : `Kizuna (${voicePreset})`}
                      </span>
                      <span>{entry.time}</span>
                    </div>
                    <p>{entry.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Balanced Noir Bottom Bar: [ +  Preguntar a Kizuna ]  [ Mic ]  [ X ] */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between gap-2.5 px-1 sm:px-2 pb-3 pt-2">
        {/* Left Pill: Transcript Toggle (+) & Inline Prompt Input (min-w-0 prevents pushing X off-screen) */}
        <form
          onSubmit={handleSendInlineText}
          className="flex-1 min-w-0 flex items-center bg-[#18181c] hover:bg-[#202026] border border-white/12 rounded-full h-12 min-h-[48px] px-1.5 transition-colors"
        >
          <button
            type="button"
            onClick={() => setIsTranscriptLogOpen((prev) => !prev)}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer ${
              isTranscriptLogOpen
                ? 'bg-white text-black rotate-45'
                : 'text-zinc-300 hover:text-white hover:bg-white/10'
            }`}
            title={isTranscriptLogOpen ? 'Cerrar transcripción (×)' : 'Ver transcripción de la llamada (+)'}
          >
            <Plus size={20} />
          </button>
          <input
            type="text"
            value={inlinePrompt}
            onChange={(e) => setInlinePrompt(e.target.value)}
            placeholder="Preguntar a Kizuna"
            className="flex-1 w-full min-w-0 bg-transparent text-[16px] md:text-sm text-white placeholder-zinc-400 px-2 focus:outline-none tracking-tight"
          />
          {inlinePrompt.trim().length > 0 && (
            <button
              type="submit"
              className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 mr-0.5 cursor-pointer active:scale-95"
              title="Enviar a la llamada"
            >
              <Send size={14} />
            </button>
          )}
        </form>

        {/* Right Circle 1: Mic / Mute Toggle */}
        <button
          type="button"
          onClick={handleToggleMute}
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-95 ${
            isMuted
              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
              : 'bg-[#1c1c22] text-white hover:bg-[#272730] border border-white/12'
          }`}
          title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        {/* Right Circle 2: Crisp White Hang Up (X) Button — Centered with breathing room */}
        <button
          type="button"
          onClick={() => {
            stopRecognition();
            stopAllAudioAndSpeech();
            onStopGeneration?.();
            onClose();
          }}
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-white hover:bg-zinc-200 text-black flex items-center justify-center shrink-0 transition-all cursor-pointer active:scale-95 shadow-[0_4px_20px_rgba(255,255,255,0.2)]"
          title="Finalizar llamada"
        >
          <X size={21} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};

