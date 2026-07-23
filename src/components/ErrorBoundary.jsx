import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '1.5rem', background: '#050505', color: '#f6edd3', border: '2px solid #f4bf1a', borderRadius: 10, margin: '1rem' }}>
          <h2 style={{ color: '#f4bf1a', marginTop: 0 }}>Something went wrong</h2>
          <p style={{ color: '#c6b88f', fontSize: '0.9rem' }}>Please refresh the page. If the problem persists, check the browser console for errors.</p>
          {this.state.error && (
            <pre style={{ background: '#111111', padding: '0.75rem', borderRadius: 6, overflow: 'auto', fontSize: '0.8rem', color: '#f6edd3' }}>
              {this.state.error.toString()}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
