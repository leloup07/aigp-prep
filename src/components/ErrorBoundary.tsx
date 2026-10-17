import { Component, type ReactNode } from 'react';

/** Shows the error instead of a blank page (useful on devices we can't debug directly). */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card stack" style={{ maxWidth: 640, margin: '30px auto' }}>
        <h2>Algo ha fallado en este dispositivo</h2>
        <p className="small">Copia este mensaje para poder corregirlo:</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8em' }}>{String(this.state.error?.message ?? this.state.error)}</pre>
        <p className="small muted">{navigator.userAgent}</p>
        <div className="row">
          <button className="btn primary" onClick={() => { this.setState({ error: null }); window.location.hash = '/estudio'; }}>Volver al inicio</button>
        </div>
      </div>
    );
  }
}
