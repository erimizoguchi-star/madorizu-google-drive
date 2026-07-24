import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('アプリの描画エラー:', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error-fallback">
          <h2>表示中にエラーが発生しました</h2>
          <p>{this.state.error.message || '不明なエラーです。'}</p>
          <button type="button" className="btn btn-primary" onClick={this.handleReload}>
            ページを再読み込み
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
