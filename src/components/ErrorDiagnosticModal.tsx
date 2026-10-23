import React, { useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Copy, Check, X, RefreshCw, Terminal, Zap, ShieldAlert, Cpu, Eye, Paperclip } from 'lucide-react';
import { ApiErrorInfo } from '../types';
import { generateDiagnosticPrompt, getTroubleshootingAdvice, isVisionModel } from '../utils/modelHelper';

interface ErrorDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorInfo: ApiErrorInfo | null;
  onRetry?: () => void;
  onSwitchToGeminiFlash?: () => void;
  onShowToast?: (text: string) => void;
}

export const ErrorDiagnosticModal: React.FC<ErrorDiagnosticModalProps> = ({
  isOpen,
  onClose,
  errorInfo,
  onRetry,
  onSwitchToGeminiFlash,
  onShowToast,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !errorInfo) return null;

  const handleCopyReport = () => {
    const formatted = generateDiagnosticPrompt(errorInfo);
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    if (onShowToast) {
      onShowToast('📋 Diagnóstico copiado al portapapeles');
    }
    setTimeout(() => setCopied(false), 2500);
  };

  const modelId = errorInfo.modelId || errorInfo.model || 'Default';
  const engine = (errorInfo.engine || (errorInfo.provider === 'alibaba' ? 'alibaba' : errorInfo.provider === 'custom' ? 'nvidia' : 'gemini')).toUpperCase();
  const isVision = errorInfo.isVisionModel ?? isVisionModel(modelId);
  const hadAttachments = errorInfo.hadAttachments ?? Boolean(errorInfo.hasImages || (errorInfo.attachmentsCount && errorInfo.attachmentsCount > 0));
  const attachmentTypes = errorInfo.attachmentTypes || (errorInfo.hasImages ? ['imagen'] : []);
  const status = errorInfo.status || '500';
  const message = errorInfo.message || errorInfo.error || 'Error de conexión con la API';
  const rawError = errorInfo.rawError || errorInfo.error || message;
  const advice = getTroubleshootingAdvice(errorInfo);

  const errorText = rawError.toLowerCase();
  const isHighDemand =
    status === 503 ||
    status === '503' ||
    errorText.includes('503') ||
    errorText.includes('high demand') ||
    errorText.includes('unavailable');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs select-none modal-backdrop-fluid">
      <div
        className="w-full max-w-lg bg-[#0c0d12] border border-red-900/50 rounded-xl shadow-2xl p-5 text-white overflow-hidden modal-sheet-fluid"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-950/60 border border-red-800/50 text-red-400 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white tracking-tight">
                Diagnóstico de Error de API
              </h3>
              <p className="text-xs text-[#a1a1aa] mt-0.5">
                Se ha detectado un fallo al procesar la solicitud con <span className="text-amber-400 font-medium">{engine}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#71717a] hover:text-white rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Metrics & Badges Grid */}
        <div className="space-y-3 mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
            {/* Engine Badge */}
            <div className="p-2 rounded-lg bg-[#14151c] border border-[#222430] flex flex-col justify-center">
              <span className="text-[10px] text-[#818391] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Cpu size={10} /> Motor
              </span>
              <span className="text-[#e4e4e7] font-semibold truncate">{engine === 'NVIDIA' ? 'NVIDIA NIM' : 'Gemini'}</span>
            </div>

            {/* Model Badge */}
            <div className="p-2 rounded-lg bg-[#14151c] border border-[#222430] flex flex-col justify-center">
              <span className="text-[10px] text-[#818391] uppercase tracking-wider mb-0.5 truncate">
                Modelo
              </span>
              <span className="text-cyan-400 font-semibold truncate" title={modelId}>{modelId}</span>
            </div>

            {/* Status Code Badge */}
            <div className="p-2 rounded-lg bg-[#14151c] border border-[#222430] flex flex-col justify-center">
              <span className="text-[10px] text-[#818391] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <ShieldAlert size={10} /> Estado
              </span>
              <span className={`font-semibold ${String(status).startsWith('2') ? 'text-emerald-400' : 'text-rose-400'}`}>
                {status}
              </span>
            </div>

            {/* Vision Support Badge */}
            <div className="p-2 rounded-lg bg-[#14151c] border border-[#222430] flex flex-col justify-center">
              <span className="text-[10px] text-[#818391] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Eye size={10} /> Visión
              </span>
              <span className={`font-semibold ${isVision ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isVision ? 'Sí (👁️ Activo)' : 'No (Solo Texto)'}
              </span>
            </div>

            {/* Attachments Badge */}
            <div className="p-2 rounded-lg bg-[#14151c] border border-[#222430] col-span-2 sm:col-span-2 flex flex-col justify-center">
              <span className="text-[10px] text-[#818391] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                <Paperclip size={10} /> Archivos Adjuntos
              </span>
              <span className="text-[#d4d4d8] font-semibold truncate">
                {hadAttachments ? `Sí (${attachmentTypes.length > 0 ? attachmentTypes.join(', ') : 'Archivos'})` : 'Ninguno'}
              </span>
            </div>
          </div>

          {/* Raw Error Details Box */}
          <div className="p-3 bg-[#08090d] border border-[#1f212d] rounded-lg max-h-36 overflow-y-auto smooth-scroll">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-red-400 uppercase tracking-wider mb-1">
              <Terminal size={11} />
              <span>Mensaje del servidor / Error Raw</span>
            </div>
            <p className="text-xs font-mono text-[#fca5a5] leading-relaxed break-words whitespace-pre-wrap">
              {rawError}
            </p>
          </div>

          {/* Smart Troubleshooting Advice Box */}
          <div className="p-3 bg-[#13110a] border border-amber-600/30 rounded-lg">
            <div className="text-[11px] font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <span>💡 Diagnóstico Automático & Causa Raíz</span>
            </div>
            <p className="text-xs text-[#d4d4d8] leading-relaxed">
              {advice}
            </p>
          </div>

          {/* High Demand Rescue Button */}
          {isHighDemand && onSwitchToGeminiFlash && (
            <div className="p-3 bg-[#0d1624] border border-cyan-800/40 rounded-lg flex items-center justify-between gap-2">
              <div className="text-xs text-cyan-200">
                <span className="font-semibold block mb-0.5">⚡ Cambiar a gemini-3.5-flash</span>
                <span>Modelo de alta disponibilidad verificado de respuesta rápida.</span>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                type="button"
                onClick={() => {
                  onSwitchToGeminiFlash();
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-colors shadow-sm"
              >
                Cambiar y Reintentar
              </motion.button>
            </div>
          )}
        </div>

        {/* Primary Action: Copiar Reporte para AI Studio */}
        <div className="space-y-2 mb-4">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleCopyReport}
            className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-xs transition-all shadow-md ${
              copied
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-white text-black hover:bg-[#e4e4e7]'
            }`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? '¡Copiado al portapapeles! ✓' : '📋 Copiar Reporte para AI Studio'}</span>
          </motion.button>
          <p className="text-[11px] text-[#71717a] text-center">
            Pega este informe en el chat de AI Studio para corregir el endpoint o ajustar el modelo inmediatamente.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1a1b24]">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs text-[#a1a1aa] hover:text-white rounded transition-colors"
          >
            Cerrar
          </button>
          {onRetry && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                onClose();
                onRetry();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-[#1a1c27] hover:bg-[#252838] text-white border border-[#2e3245] rounded-lg transition-colors"
            >
              <RefreshCw size={12} />
              <span>Reintentar Solicitud</span>
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ApiErrorModal = ErrorDiagnosticModal;
