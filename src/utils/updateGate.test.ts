import { describe, expect, it, vi } from 'vitest'
import { createUpdateGate } from './updateGate'

describe('createUpdateGate', () => {
  it('applies an update right away on the title screen', () => {
    const gate = createUpdateGate('title')
    const apply = vi.fn()
    gate.updateReady(apply)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('holds an update during a run, even when backgrounded', () => {
    const gate = createUpdateGate('game')
    const apply = vi.fn()
    gate.updateReady(apply)
    gate.visibilityChanged(true)
    expect(apply).not.toHaveBeenCalled()
  })

  it('holds an update on the result screen until the player leaves it', () => {
    const gate = createUpdateGate('result')
    const apply = vi.fn()
    gate.updateReady(apply)
    gate.visibilityChanged(true)
    gate.visibilityChanged(false)
    expect(apply).not.toHaveBeenCalled()
    gate.screenChanged('levelSelect')
    expect(apply).not.toHaveBeenCalled()
    gate.screenChanged('title')
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('applies on a menu screen only once the app is backgrounded', () => {
    const gate = createUpdateGate('levelSelect')
    const apply = vi.fn()
    gate.updateReady(apply)
    expect(apply).not.toHaveBeenCalled()
    gate.visibilityChanged(true)
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('applies when a run ends while the app is already hidden on a safe screen', () => {
    const gate = createUpdateGate('game')
    const apply = vi.fn()
    gate.updateReady(apply)
    gate.visibilityChanged(true)
    gate.screenChanged('progress')
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('applies a pending update only once', () => {
    const gate = createUpdateGate('game')
    const apply = vi.fn()
    gate.updateReady(apply)
    gate.screenChanged('title')
    gate.screenChanged('levelSelect')
    gate.screenChanged('title')
    expect(apply).toHaveBeenCalledTimes(1)
  })
})
