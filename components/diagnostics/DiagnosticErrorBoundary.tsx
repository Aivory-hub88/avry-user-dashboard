import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class DiagnosticErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[DiagnosticErrorBoundary] Caught error:', error, info)
  }

  handleStartOver = () => {
    window.location.href = '/diagnostics/deep'
  }

  // Class components can't use the useLocaleContext hook, and this boundary
  // needs to render before/around whatever hook-based locale state its
  // children hold — reads the same localStorage key that hook is backed
  // by (see STORAGE_KEY in hooks/useLocale.tsx) directly instead.
  getLocale(): 'en' | 'id' {
    try {
      return localStorage.getItem('aivory_locale') === 'id' ? 'id' : 'en'
    } catch {
      return 'en'
    }
  }

  render() {
    if (this.state.hasError) {
      const locale = this.getLocale()
      return (
        <div
          style={{
            height: '100%',
            overflow: 'auto',
            backgroundColor: '#353531',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#2a2926',
              borderRadius: '12px',
              padding: '2.5rem',
              maxWidth: '480px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                color: '#f5f5f4',
                fontSize: '1.125rem',
                marginBottom: '1.5rem',
                lineHeight: '1.6',
              }}
            >
              {locale === 'id'
                ? 'Terjadi kesalahan. Silakan muat ulang halaman atau mulai dari awal.'
                : 'Something went wrong. Please refresh the page or start over.'}
            </p>
            <button
              onClick={this.handleStartOver}
              style={{
                backgroundColor: '#d97706',
                color: '#353531',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {locale === 'id' ? 'Mulai Ulang' : 'Start Over'}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default DiagnosticErrorBoundary
