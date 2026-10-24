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
  // Default to Voz Eco (0 tokens / $0.00 quota) so calls never drain TTS quota unless user toggles HD
  const [useAlibabaHdVoice, setUseAlibabaHdVoice] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const isMutedRef = useRef(isMuted);
  const isSpeakerMutedRef = useRef(isSpeakerMuted);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted;
  }, [isSpeakerMuted]);

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
        const currentDisplay = (finalCaptured + ' ' + interim).trim();
        if (currentDisplay) {
          setUserTranscript(currentDisplay);
        }
      };

      rec.onerror = (e: any) => {
        if (!isMountedRef.current || !isOpenRef.current) return;
        if (e.error === 'no-speech') {
          // Quietly restart listening if still in call and not muted
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
        const cleanSpoken = finalCaptured.trim();
        if (cleanSpoken.length > 1) {
          handleProcessSpokenTurn(cleanSpoken);
        } else if (!isMutedRef.current && isOpenRef.current) {
          // Continue listening seamlessly
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

  const speakReply = useCallback(
    async (rawReply: string) => {
      if (!isMountedRef.current || !isOpenRef.current) return;

      // Strip markdown, follow-up tags, and thoughts for natural spoken cadence
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

      setAssistantSubtitle(cleanText);

      if (isSpeakerMutedRef.current) {
        setCallStatus('idle');
        if (!isMutedRef.current) {
          setTimeout(() => startListening(), 600);
        }
        return;
      }

      setCallStatus('speaking');

      // 1. Try Alibaba Cloud Qwen-Audio-3.1-TTS-Plus / CosyVoice HD synthesis if key is available
      const effectiveAliKey = (
        alibabaApiKey ||
        localStorage.getItem('kizuna_alibaba_api_key') ||
        ''
      ).trim();

      if (useAlibabaHdVoice && effectiveAliKey && cleanText.length <= 600) {
        try {
          const ttsRes = await fetch('/api/alibaba/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: cleanText,
              alibabaApiKey: effectiveAliKey,
            }),
          });
          if (ttsRes.ok) {
            const ttsData = await ttsRes.json();
            if (ttsData.audioUrl || ttsData.audioDataUrl) {
              const src = ttsData.audioDataUrl || ttsData.audioUrl;
              const audio = new Audio(src);
              audioPlayerRef.current = audio;
              audio.onended = () => {
                if (isMountedRef.current && isOpenRef.current && !isMutedRef.current) {
                  startListening();
                } else {
                  setCallStatus('idle');
                }
              };
              audio.onerror = () => {
                speakWithBrowserTTS(cleanText);
              };
              await audio.play();
              return;
            }
          }
        } catch {
          // Fallback to Web Speech API
        }
      }

      // 2. Instant Low-Battery Native Web Speech API
      speakWithBrowserTTS(cleanText);
    },
    [alibabaApiKey, useAlibabaHdVoice, startListening]
  );

  const speakWithBrowserTTS = useCallback(
    (cleanText: string) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        setCallStatus('idle');
        return;
      }
      window.speechSynthesis.cancel();
      const voices = window.speechSynthesis.getVoices();
      const spanishVoice =
        voices.find(
          (v) =>
            v.lang.startsWith('es') &&
            (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Premium'))
        ) ||
        voices.find((v) => v.lang.startsWith('es')) ||
        null;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (spanishVoice) utterance.voice = spanishVoice;
      utterance.lang = 'es-ES';
      utterance.rate = 1.03;
      utterance.pitch = 0.98;

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

  const handleProcessSpokenTurn = useCallback(
    (spokenText: string) => {
      stopRecognition();
      setCallStatus('thinking');
      setAssistantSubtitle('Pensando respuesta...');

      const voicePrompt = `[MODO LLAMADA DE VOZ EN VIVO CON EL AUTOR: Responde como en una charla hablada natural, cálida y directa (máximo 2 o 3 oraciones fluidas), sin listas ni formato markdown pesado, para que suene orgánico al ser narrado en voz alta]: ${spokenText}`;

      onSendVoiceTurn(
        voicePrompt,
        (replyText) => {
          if (!isMountedRef.current || !isOpenRef.current) return;
          speakReply(replyText);
        },
        (errText) => {
          if (!isMountedRef.current || !isOpenRef.current) return;
          setCallStatus('error');
          setAssistantSubtitle(errText || 'Error al obtener respuesta en llamada.');
        }
      );
    },
    [onSendVoiceTurn, speakReply, stopRecognition]
  );

  // Start/stop call lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setCallSeconds(0);
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

  const handleOrbTap = () => {
    if (callStatus === 'speaking' || callStatus === 'thinking') {
      // Full-duplex interrupt! Stop speaking/generating and listen immediately
      stopAllAudioAndSpeech();
      onStopGeneration?.();
      setIsMuted(false);
      startListening();
    } else if (callStatus === 'listening') {
      // Force end current utterance or pause
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-between p-6 bg-[#09090b]/95 backdrop-blur-md text-white select-none modal-sheet-fluid">
      {/* Top Bar: Call Info & Battery-Safe Badge */}
      <div className="w-full max-w-md flex items-center justify-between pt-2">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <div>
            <div className="text-xs font-semibold tracking-wide flex items-center gap-1.5">
              <span>Llamada Omni Live</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-zinc-300">
                {formatDuration(callSeconds)}
              </span>
            </div>
            <div className="relative text-[11px] font-mono text-zinc-400 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setIsModelSelectorOpen((v) => !v)}
                className="flex items-center gap-1 text-emerald-300 font-semibold hover:underline cursor-pointer active:scale-95 transition-transform"
                title="Toca para cambiar de modelo (Qwen Omni, Qwen Max, Gemini, Kimi)"
              >
                <span>{activeModelName}</span>
                <ChevronDown size={12} className="text-emerald-400" />
              </button>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                🛡️ Ahorro Cuota
              </span>

              {/* Quick Model Dropdown Card */}
              {isModelSelectorOpen && (
                <div className="absolute left-0 top-full mt-2 w-64 bg-[#121218] border border-[#2a2a35] rounded-xl shadow-2xl p-2 z-[160] text-white space-y-1">
                  <div className="px-2 py-1 text-[10px] font-mono text-zinc-400 uppercase tracking-wider border-b border-[#22222d] mb-1">
                    Cambiar Modelo en Vivo
                  </div>
                  {[
                    { id: 'qwen-3.8-omni-flash', name: 'Qwen 3.8 Omni Flash', provider: 'alibaba' },
                    { id: 'qwen-3.8-omni-flash-realtime', name: 'Qwen 3.8 Realtime Voice', provider: 'alibaba' },
                    { id: 'qwen3.8-max', name: 'Qwen 3.8 Max (Prose)', provider: 'alibaba' },
                    { id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', provider: 'gemini' },
                    { id: 'gemini-4-argon', name: 'Gemini 4 Argon', provider: 'gemini' },
                    { id: 'moonshotai/kimi-k3', name: 'Kimi K3 (NVIDIA NIM)', provider: 'custom' },
                  ].map((m) => {
                    const isSelected = activeModelName.toLowerCase().includes(m.id.toLowerCase()) || activeModelName === m.name;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectQuickModel?.(m.provider as any, m.id);
                          setIsModelSelectorOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30'
                            : 'text-zinc-300 hover:bg-[#1f1f2a] hover:text-white'
                        }`}
                      >
                        <span className="truncate">{m.name}</span>
                        {isSelected && <Check size={12} className="text-emerald-400 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setUseAlibabaHdVoice((v) => !v)}
          className={`px-2.5 py-1.5 min-h-[44px] rounded-xl text-[11px] font-mono border transition-colors cursor-pointer flex items-center gap-1.5 ${
            useAlibabaHdVoice
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
          }`}
          title="Voz Eco usa el motor nativo del celular (0 tokens de gasto). Voz Qwen HD usa síntesis neuronal de Alibaba Cloud."
        >
          <Sparkles size={12} />
          <span>{useAlibabaHdVoice ? 'Voz HD Neural (Qwen Audio)' : 'Voz Eco ($0.00 extra)'}</span>
        </button>
      </div>

      {/* Center Interactive Orb (Battery-Optimized: No 120Hz Canvas, Pure Smooth Transitions) */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-md my-4 text-center">
        <button
          type="button"
          onClick={handleOrbTap}
          className="relative group flex items-center justify-center w-44 h-44 rounded-full cursor-pointer focus:outline-none active:scale-95 transition-transform duration-300"
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
            className={`relative z-10 w-32 h-32 rounded-full flex flex-col items-center justify-center border shadow-2xl transition-all duration-300 ${
              callStatus === 'listening'
                ? 'bg-[#12241d] border-emerald-400/40 text-emerald-300'
                : callStatus === 'speaking'
                  ? 'bg-[#261c10] border-amber-400/50 text-amber-300'
                  : callStatus === 'thinking'
                    ? 'bg-[#1d1528] border-purple-400/40 text-purple-300'
                    : 'bg-[#14141a] border-white/15 text-zinc-300'
            }`}
          >
            <Radio size={32} className="mb-1.5 opacity-90" />
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
        <div className="mt-8 w-full space-y-3 px-2 min-h-[110px] flex flex-col justify-center">
          {userTranscript && (
            <p className="text-xs font-mono text-emerald-400/90 italic line-clamp-2">
              “{userTranscript}”
            </p>
          )}
          <p className="text-sm sm:text-base font-medium leading-relaxed text-zinc-100 line-clamp-4">
            {assistantSubtitle}
          </p>
        </div>
      </div>

      {/* Bottom Call Controls (44x44px minimum touch targets) */}
      <div className="w-full max-w-xs flex items-center justify-around pb-4">
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
