import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 my-4 mx-auto max-w-lg bg-[#0e0e12] border border-[#26262a] rounded-xl text-white shadow-2xl flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-red-950/40 border border-red-900/60 flex items-center justify-center text-red-400 mb-3">
            <AlertCircle size={20} />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">
            {this.props.fallbackTitle || 'Se produjo un problema al renderizar este componente'}
          </h3>
          <p className="text-xs text-[#a1a1aa] mb-4 font-mono break-all max-w-sm">
            {this.state.error?.message || 'Error de ejecución en la vista'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-black bg-white hover:bg-[#e4e4e7] rounded-md transition-colors"
          >
            <RefreshCw size={13} />
            <span>Reintentar / Restaurar Vista</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
