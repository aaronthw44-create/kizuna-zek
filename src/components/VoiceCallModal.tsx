import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, VolumeX, Sparkles, Radio, ChevronDown, Check } from 'lucide-react';

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
    onError: (errText: string) => void
  ) => void;
  onStopGeneration?: () => void;
}

type CallStatus = 'idle' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error';

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
  const [assistantSubtitle, setAssistantSubtitle] = useState(
    'Tocá el micrófono o empezá a hablar para pelotear ideas en vivo...'
  );
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [voicePreset, setVoicePreset] = useState<'Cherry' | 'Serena' | 'Luca' | 'Ethan'>('Cherry');
  // Default to Voz Eco (0 tokens / $0.00 quota) so calls never drain TTS quota unless user toggles HD
  const [useAlibabaHdVoice, setUseAlibabaHdVoice] = useState(false);

  // Live Call Telemetry State (Tokens, Response Time, Estimated Cost)
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null);
  const [lastTurnTokens, setLastTurnTokens] = useState<number>(0);
  const [totalCallTokens, setTotalCallTokens] = useState<number>(0);
  const [totalCallCostUsd, setTotalCallCostUsd] = useState<number>(0);
  const [turnsCount, setTurnsCount] = useState<number>(0);

  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
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

  const stopAllAudioAndSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.currentTime = 0;
      } catch {}
    }
  }, []);

  const stopRecognition = useCallback(() => {
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
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'es-ES';

      let finalCaptured = '';
      let lastInterim = '';

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
          finalCaptured += ' ' + finalStr;
        }
        if (interim.trim()) {
          lastInterim = interim.trim();
        }
        const currentDisplay = (finalCaptured + ' ' + interim).trim();
        if (currentDisplay) {
          setUserTranscript(currentDisplay);
        }
      };

      rec.onerror = (e: any) => {
        if (!isMountedRef.current || !isOpenRef.current) return;
        if (e.error === 'no-speech') {
          if (!isMutedRef.current && isOpenRef.current) {
            setTimeout(() => {
              if (isOpenRef.current && !isMutedRef.current) startListening();
            }, 350);
          }
          return;
        }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          setCallStatus('error');
          setAssistantSubtitle('Permiso de micrófono denegado. Revisá los permisos del navegador.');
        }
      };

      rec.onend = () => {
        if (!isMountedRef.current || !isOpenRef.current) return;
        const cleanSpoken = (finalCaptured.trim() || lastInterim.trim());
        if (cleanSpoken.length > 1) {
          // Always invoke via ref so latest voicePreset, HD/Eco mode, and model are used
          handleProcessSpokenTurnRef.current(cleanSpoken);
        } else if (!isMutedRef.current && isOpenRef.current) {
          setTimeout(() => {
            if (isOpenRef.current && !isMutedRef.current) startListening();
          }, 300);
        }
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setCallStatus('idle');
    }
  }, [stopAllAudioAndSpeech, stopRecognition]);

  const speakWithBrowserTTS = useCallback(
    (cleanText: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        setCallStatus('idle');
        return;
      }
      window.speechSynthesis.cancel();
      const voices = window.speechSynthesis.getVoices();
      const activePreset = voicePresetRef.current;

      const isMasculine = activePreset === 'Luca' || activePreset === 'Ethan';
      const spanishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('es'));

      let targetVoice =
        spanishVoices.find((v) =>
          isMasculine
            ? /male|hombre|jorge|pablo|diego|raul|carlos|enrique|alvaro|alonso|nestor/i.test(v.name)
            : /female|mujer|sabina|monica|helena|laura|paulina|elvira|paloma/i.test(v.name)
        ) || null;

      // If browser doesn't label gender by name, pick distinct voice indices when multiple Spanish voices exist
      if (!targetVoice && spanishVoices.length > 1) {
        if (activePreset === 'Cherry') targetVoice = spanishVoices[0];
        else if (activePreset === 'Serena') targetVoice = spanishVoices[Math.min(1, spanishVoices.length - 1)];
        else if (activePreset === 'Luca') targetVoice = spanishVoices[spanishVoices.length - 1];
        else if (activePreset === 'Ethan') targetVoice = spanishVoices[Math.max(0, spanishVoices.length - 2)];
      } else if (!targetVoice && spanishVoices.length === 1) {
        targetVoice = spanishVoices[0];
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (targetVoice) utterance.voice = targetVoice;
      utterance.lang = targetVoice?.lang || 'es-ES';

      // Distinct rate & pitch profiles so each personality is clearly distinguishable even in Eco Mode
      if (activePreset === 'Cherry') {
        utterance.rate = 1.12;
        utterance.pitch = 1.22; // Energetic warm female
      } else if (activePreset === 'Serena') {
        utterance.rate = 0.94;
        utterance.pitch = 0.92; // Calm serene female
      } else if (activePreset === 'Luca') {
        utterance.rate = 0.91;
        utterance.pitch = 0.68; // Deep serious male narrator
      } else if (activePreset === 'Ethan') {
        utterance.rate = 1.06;
        utterance.pitch = 0.82; // Young dynamic male
      }

      utterance.onend = () => {
        if (isMountedRef.current && isOpenRef.current && !isMutedRef.current) {
          startListening();
        } else {
          setCallStatus('idle');
        }
      };

      utterance.onerror = () => {
        if (isMountedRef.current && isOpenRef.current && !isMutedRef.current) {
          startListening();
        } else {
          setCallStatus('idle');
        }
      };

      window.speechSynthesis.speak(utterance);
    },
    [startListening]
  );

  const speakReply = useCallback(
    async (rawReply: string) => {
      if (!isMountedRef.current || !isOpenRef.current) return;

      const cleanText = rawReply
        .replace(/<<<FOLLOW_UP>>>[\s\S]*$/i, '')
        .replace(/<<<SAVE_MEMORY:[\s\S]*?>>>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/[*#_~`>]/g, '')
        .trim();

      if (!cleanText) {
        if (!isMutedRef.current) startListening();
        return;
      }

      lastSpokenReplyRef.current = cleanText;
      setAssistantSubtitle(cleanText);

      if (isSpeakerMutedRef.current) {
        setCallStatus('idle');
        if (!isMutedRef.current) {
          setTimeout(() => startListening(), 600);
        }
        return;
      }

      stopAllAudioAndSpeech();
      setCallStatus('speaking');

      const isHdActive = useAlibabaHdVoiceRef.current;
      const currentVoice = voicePresetRef.current;
      const effectiveAliKey = (
        alibabaApiKeyRef.current ||
        localStorage.getItem('kizuna_alibaba_api_key') ||
        ''
      ).trim();

      // 1. Neural HD Synthesis (Alibaba Qwen-Audio TTS + Neural HD Backup)
      if (isHdActive && cleanText.length <= 900) {
        try {
          const ttsRes = await fetch('/api/alibaba/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: cleanText,
              alibabaApiKey: effectiveAliKey,
              voice: currentVoice,
            }),
          });
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            if (ttsData.audioUrl || ttsData.audioDataUrl) {
              const src = ttsData.audioDataUrl || ttsData.audioUrl;
              const audio = new Audio(src);
              audioPlayerRef.current = audio;
              let fallbackTriggered = false;
              audio.onended = () => {
                if (isMountedRef.current && isOpenRef.current && !isMutedRef.current) {
                  startListening();
                } else {
                  setCallStatus('idle');
                }
              };
              audio.onerror = () => {
                if (!fallbackTriggered) {
                  fallbackTriggered = true;
                  speakWithBrowserTTS(cleanText);
                }
              };
              try {
                await audio.play();
                return;
              } catch {
                if (!fallbackTriggered) {
                  fallbackTriggered = true;
                  speakWithBrowserTTS(cleanText);
                }
                return;
              }
            }
          }
        } catch {
          // Fallback to Web Speech API
        }
      }

      // 2. Instant Low-Battery Native Web Speech API (Voz Eco $0.00)
      speakWithBrowserTTS(cleanText);
    },
    [speakWithBrowserTTS, startListening, stopAllAudioAndSpeech]
  );

  const handleProcessSpokenTurn = useCallback(
    (spokenText: string) => {
      stopRecognition();
      setCallStatus('thinking');
      setAssistantSubtitle('Pensando respuesta...');

      const currentVoice = voicePresetRef.current;
      const personaHint =
        currentVoice === 'Luca'
          ? 'con tono masculino serio, reflexivo y estilo narrador'
          : currentVoice === 'Ethan'
            ? 'con tono masculino joven, ágil y dinámico'
            : currentVoice === 'Serena'
              ? 'con tono femenino sereno, pausado y cálido'
              : 'con tono femenino enérgico, entusiasta y cercano';

      const voicePrompt = `[MODO LLAMADA DE VOZ EN VIVO CON EL AUTOR: Responde ${personaHint} como en una charla hablada natural y directa (máximo 2 o 3 oraciones fluidas), sin listas ni formato markdown ni emojis, para que suene orgánico al ser narrado en voz alta]: ${spokenText}`;

      const turnStartPerf = typeof performance !== 'undefined' ? performance.now() : Date.now();

      onSendVoiceTurnRef.current(
        voicePrompt,
        (replyText) => {
          if (!isMountedRef.current || !isOpenRef.current) return;
          const elapsedMs = Math.max(
            120,
            Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - turnStartPerf)
          );
          const inputTokensEst = Math.max(8, Math.ceil(spokenText.length / 3.8));
          const outputTokensEst = Math.max(12, Math.ceil(replyText.length / 3.8));
          const turnTokens = inputTokensEst + outputTokensEst;

          // Calculate real-time turn cost:
          // Text turn on Omni Flash / Gemini Flash: ~$0.07 per 1M input + $0.28 per 1M output
          const textCost = (inputTokensEst * 0.07 + outputTokensEst * 0.28) / 1_000_000;
          // Voice synthesis cost: $0.00 in Eco mode; ~$1.87 per 1M audio tokens in HD mode
          const hdAudioTokensEst = useAlibabaHdVoiceRef.current ? outputTokensEst * 2.2 : 0;
          const audioCost = (hdAudioTokensEst * 1.87) / 1_000_000;
          const totalTurnCost = textCost + audioCost;

          setLastLatencyMs(elapsedMs);
          setLastTurnTokens(turnTokens);
          setTotalCallTokens((prev) => prev + turnTokens);
          setTotalCallCostUsd((prev) => prev + totalTurnCost);
          setTurnsCount((prev) => prev + 1);

          speakReply(replyText);
        },
        (errText) => {
          if (!isMountedRef.current || !isOpenRef.current) return;
          setCallStatus('error');
          setAssistantSubtitle(errText || 'Error al obtener respuesta en llamada.');
        }
      );
    },
    [speakReply, stopRecognition]
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
      setUserTranscript('');
      setAssistantSubtitle('Escuchando... Hablá cuando quieras (o tocá el círculo para interrumpir).');
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
    setIsVoicePickerOpen(false);

    if (callStatus === 'speaking' && lastSpokenReplyRef.current) {
      speakReply(lastSpokenReplyRef.current);
    } else {
      setAssistantSubtitle(`Voz activa cambiada a ${label}. Hablá cuando quieras para escucharla.`);
    }
  };

  const handleToggleHdVoiceMode = () => {
    const next = !useAlibabaHdVoiceRef.current;
    useAlibabaHdVoiceRef.current = next;
    setUseAlibabaHdVoice(next);

    if (callStatus === 'speaking' && lastSpokenReplyRef.current) {
      speakReply(lastSpokenReplyRef.current);
    } else {
      setAssistantSubtitle(
        next
          ? `Modo Voz HD Neural activado (${voicePresetRef.current}). Síntesis neuronal activa.`
          : `Modo Voz Eco ($0.00) activado (${voicePresetRef.current}). Cero consumo de cuota de audio.`
      );
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
      setAssistantSubtitle('Micrófono silenciado. Tocá el micrófono para reanudar.');
    } else {
      startListening();
    }
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatOmniDisplayName = (rawName: string) => {
    const lower = rawName.toLowerCase();
    if (lower.includes('realtime')) return 'Qwen 3.8 Omni Realtime';
    if (lower.includes('omni-turbo') || lower.includes('omni-mini')) return 'Qwen 3.8 Omni Mini';
    if (lower.includes('omni')) return 'Qwen 3.8 Omni Flash';
    if (lower.includes('2.5-flash')) return 'Gemini 2.5 Flash Live';
    if (lower.includes('gemini')) return 'Gemini 3.6 Flash Live';
    return 'Qwen 3.8 Omni Flash';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-between p-5 sm:p-6 bg-[#09090b]/95 backdrop-blur-md text-white select-none modal-sheet-fluid">
      {/* Top Bar: Call Info & Voice Controls */}
      <div className="w-full max-w-md flex items-center justify-between pt-1 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5">
              <span>Llamada Omni Live</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                {formatDuration(callSeconds)}
              </span>
            </div>
            <div className="relative text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 flex-wrap mt-0.5">
              <button
                type="button"
                onClick={() => {
                  setIsVoicePickerOpen(false);
                  setIsModelSelectorOpen((v) => !v);
                }}
                className="flex items-center gap-1 text-emerald-300 font-semibold hover:underline cursor-pointer active:scale-95 transition-transform"
                title="Cambiar modelo multimodal Omni en vivo"
              >
                <span className="truncate max-w-[140px] sm:max-w-[180px]">
                  {formatOmniDisplayName(activeModelName)}
                </span>
                <ChevronDown size={12} className="text-emerald-400 shrink-0" />
              </button>

              {/* Omni-Only Model Dropdown Card */}
              {isModelSelectorOpen && (
                <div className="absolute left-0 top-full mt-2 w-72 bg-[#121218] border border-[#2a2a35] rounded-xl shadow-2xl p-2 z-[160] text-white space-y-1">
                  <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-[#22222d] mb-1">
                    Modelos Omni / Voz en Vivo
                  </div>
                  {[
                    {
                      id: 'qwen-3.8-omni-flash',
                      name: 'Qwen 3.8 Omni Flash',
                      desc: 'Multimodal voz + texto ($0.07/1M txt)',
                      provider: 'alibaba',
                    },
                    {
                      id: 'qwen-3.8-omni-flash-realtime',
                      name: 'Qwen 3.8 Omni Realtime',
                      desc: 'Respuesta hablada de ultrabaja latencia',
                      provider: 'alibaba',
                    },
                    {
                      id: 'qwen-omni-turbo',
                      name: 'Qwen 3.8 Omni Mini',
                      desc: 'Ultra ligero y económico para charlas largas',
                      provider: 'alibaba',
                    },
                    {
                      id: 'gemini-3.6-flash',
                      name: 'Gemini 3.6 Flash Live',
                      desc: 'Motor multimodal en vivo de Google',
                      provider: 'gemini',
                    },
                    {
                      id: 'gemini-2.5-flash',
                      name: 'Gemini 2.5 Flash Live',
                      desc: 'Baja latencia y alta disponibilidad',
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
                          setIsModelSelectorOpen(false);
                          setAssistantSubtitle(`Motor cambiado a ${m.name}. Listo para escucharte.`);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-mono text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                            : 'text-zinc-300 hover:bg-[#1f1f2a] hover:text-white'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="truncate font-semibold">{m.name}</div>
                          <div className="text-[10px] text-zinc-400 truncate">{m.desc}</div>
                        </div>
                        {isSelected && <Check size={13} className="text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Voice Personality Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsModelSelectorOpen(false);
                setIsVoicePickerOpen((v) => !v);
              }}
              className="px-2.5 py-1.5 min-h-[44px] rounded-xl text-[11px] font-mono border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200 transition-colors cursor-pointer flex items-center gap-1"
              title="Cambiar personalidad de voz (Cherry, Serena, Luca, Ethan)"
            >
              <Volume2 size={12} className="text-amber-400" />
              <span>{voicePreset}</span>
              <ChevronDown size={11} className="text-zinc-400" />
            </button>

            {isVoicePickerOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 bg-[#121218] border border-[#2a2a35] rounded-xl shadow-2xl p-2 z-[160] text-white space-y-1">
                <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-[#22222d] mb-1">
                  Personalidad de Voz
                </div>
                {[
                  { id: 'Cherry', label: 'Cherry (Mujer Enérgica)', desc: 'Cálida, dinámica y entusiasta' },
                  { id: 'Serena', label: 'Serena (Mujer Calma)', desc: 'Pausada, reflexiva y suave' },
                  { id: 'Luca', label: 'Luca (Hombre Serio)', desc: 'Voz masculina grave estilo narrador' },
                  { id: 'Ethan', label: 'Ethan (Hombre Joven)', desc: 'Voz masculina fluida y moderna' },
                ].map((vp) => {
                  const isSelected = voicePreset === vp.id;
                  return (
                    <button
                      key={vp.id}
                      type="button"
                      onClick={() => handleSelectVoicePersonality(vp.id as any, vp.label)}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                          : 'text-zinc-300 hover:bg-[#1f1f2a] hover:text-white'
                      }`}
                    >
                      <div className="font-semibold flex items-center justify-between">
                        <span>{vp.label}</span>
                        {isSelected && <Check size={12} className="text-amber-400 shrink-0 ml-1" />}
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono mt-0.5">{vp.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleToggleHdVoiceMode}
            className={`px-2.5 py-1.5 min-h-[44px] rounded-xl text-[11px] font-mono border transition-colors cursor-pointer flex items-center gap-1.5 ${
              useAlibabaHdVoice
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
            title="Voz Eco usa el motor nativo del dispositivo ($0.00 gasto de voz). Voz HD usa síntesis neuronal profunda."
          >
            <Sparkles size={12} />
            <span>{useAlibabaHdVoice ? 'Voz HD Neural' : 'Voz Eco ($0)'}</span>
          </button>
        </div>
      </div>

      {/* Center Interactive Orb */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-2 text-center">
        <button
          type="button"
          onClick={handleOrbTap}
          className="relative group flex items-center justify-center w-40 h-40 sm:w-44 sm:h-44 rounded-full cursor-pointer focus:outline-none active:scale-95 transition-transform duration-300"
          aria-label="Interactuar con voz o interrumpir"
        >
          {/* Outer subtle ring */}
          <div
            className={`absolute inset-0 rounded-full border-2 transition-all duration-500 ${
              callStatus === 'listening'
                ? 'border-emerald-400/50 scale-105 bg-emerald-500/10'
                : callStatus === 'speaking'
                  ? 'border-amber-400/60 scale-110 bg-amber-500/15'
                  : callStatus === 'thinking'
                    ? 'border-purple-400/50 scale-100 bg-purple-500/10'
                    : 'border-white/15 scale-95 bg-white/5'
            }`}
          />

          {/* Inner Core Orb */}
          <div
            className={`relative z-10 w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center border shadow-2xl transition-all duration-300 ${
              callStatus === 'listening'
                ? 'bg-[#12241d] border-emerald-400/40 text-emerald-300'
                : callStatus === 'speaking'
                  ? 'bg-[#261c10] border-amber-400/50 text-amber-300'
                  : callStatus === 'thinking'
                    ? 'bg-[#1d1528] border-purple-400/40 text-purple-300'
                    : 'bg-[#14141a] border-white/15 text-zinc-300'
            }`}
          >
            <Radio size={30} className="mb-1.5 opacity-90" />
            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold">
              {callStatus === 'listening'
                ? 'Escuchando'
                : callStatus === 'thinking'
                  ? 'Pensando...'
                  : callStatus === 'speaking'
                    ? 'Hablando'
                    : callStatus === 'muted'
                      ? 'Silenciado'
                      : 'En espera'}
            </span>
          </div>
        </button>

        {/* Live Transcripts & Subtitles */}
        <div className="mt-6 w-full space-y-2.5 px-2 min-h-[96px] flex flex-col justify-center">
          {userTranscript && (
            <p className="text-xs font-mono text-emerald-400/90 italic line-clamp-2">
              “{userTranscript}”
            </p>
          )}
          <p className="text-sm sm:text-base font-medium leading-relaxed text-zinc-100 line-clamp-4">
            {assistantSubtitle}
          </p>
        </div>

        {/* Real-Time Telemetry Bar: Tokens, Response Latency & Cost */}
        <div className="mt-4 w-full max-w-md rounded-xl bg-[#121218]/90 border border-white/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-zinc-300 shadow-inner">
          <div className="flex items-center gap-1.5" title="Tiempo de respuesta del último turno">
            <span className="text-zinc-500">Respuesta:</span>
            <span className="text-emerald-300 font-semibold">
              {lastLatencyMs !== null ? `${(lastLatencyMs / 1000).toFixed(2)}s` : '—'}
            </span>
          </div>

          <div className="h-3 w-[1px] bg-white/10 hidden sm:block" />

          <div className="flex items-center gap-1.5" title="Tokens consumidos en el último turno y acumulados en la llamada">
            <span className="text-zinc-500">Tokens:</span>
            <span className="text-zinc-100 font-semibold">
              {lastTurnTokens > 0 ? `${lastTurnTokens} tok` : '0 tok'}
            </span>
            <span className="text-zinc-500 text-[10px]">
              (Total: {totalCallTokens})
            </span>
          </div>

          <div className="h-3 w-[1px] bg-white/10 hidden sm:block" />

          <div className="flex items-center gap-1.5" title="Costo estimado acumulado en esta llamada">
            <span className="text-zinc-500">Gasto:</span>
            <span className={useAlibabaHdVoice ? 'text-amber-300 font-semibold' : 'text-emerald-300 font-semibold'}>
              {turnsCount === 0
                ? '$0.0000'
                : totalCallCostUsd < 0.0001
                  ? '<$0.0001'
                  : `$${totalCallCostUsd.toFixed(4)}`}
            </span>
            <span className="text-[10px] text-zinc-500">
              ({useAlibabaHdVoice ? 'HD' : 'Voz $0'})
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Call Controls (44x44px minimum touch targets) */}
      <div className="w-full max-w-xs flex items-center justify-around pb-2">
        <button
          type="button"
          onClick={handleToggleMute}
          className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center border transition-all cursor-pointer active:scale-95 ${
            isMuted
              ? 'bg-red-500/20 border-red-500/40 text-red-400'
              : 'bg-[#181820] border-white/15 text-zinc-200 hover:bg-[#22222c]'
          }`}
          title={isMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        <button
          type="button"
          onClick={() => {
            stopRecognition();
            stopAllAudioAndSpeech();
            onStopGeneration?.();
            onClose();
          }}
          className="w-16 h-16 min-w-[64px] min-h-[64px] rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg transition-all cursor-pointer active:scale-95"
          title="Finalizar llamada"
        >
          <PhoneOff size={24} />
        </button>

        <button
          type="button"
          onClick={() => {
            const next = !isSpeakerMuted;
            setIsSpeakerMuted(next);
            if (next) stopAllAudioAndSpeech();
          }}
          className={`w-14 h-14 min-w-[56px] min-h-[56px] rounded-full flex items-center justify-center border transition-all cursor-pointer active:scale-95 ${
            isSpeakerMuted
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-[#181820] border-white/15 text-zinc-200 hover:bg-[#22222c]'
          }`}
          title={isSpeakerMuted ? 'Activar altavoz' : 'Silenciar voz de Kizuna'}
        >
          {isSpeakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
      </div>
    </div>
  );
};
