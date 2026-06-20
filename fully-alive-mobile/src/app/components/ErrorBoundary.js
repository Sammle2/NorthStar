import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { C, F } from '../tokens'

// Catches render-time crashes in the tree below it and shows a friendly dark-sky
// fallback instead of a white screen. "Try again" remounts the children via a key
// bump in the parent. componentDidCatch also forwards to a reporter when wired
// (Sentry, in Phase 4) — onError is called if provided.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error?.message, info?.componentStack)
    if (typeof this.props.onError === 'function') {
      try {
        this.props.onError(error, info)
      } catch {}
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
    if (typeof this.props.onReset === 'function') this.props.onReset()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
        <Text style={{ fontFamily: F.display, fontSize: 22, color: C.ink, letterSpacing: 1.2, marginBottom: 12, textAlign: 'center' }}>
          SOMETHING WENT WRONG
        </Text>
        <Text style={{ fontFamily: F.body, fontSize: 14, color: C.dim, marginBottom: 28, textAlign: 'center', lineHeight: 21 }}>
          A part of the app hit a snag. Your progress is saved — try again.
        </Text>
        <Pressable onPress={this.handleReset} style={{ width: '100%', maxWidth: 320 }}>
          <LinearGradient colors={[C.amber, C.amberDeep]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.amberInk }}>Try again</Text>
          </LinearGradient>
        </Pressable>
      </View>
    )
  }
}
