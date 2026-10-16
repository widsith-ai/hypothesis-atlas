import { describe, it, expect } from 'vitest'
import { hasWideContent } from './ChatMarkdown'

describe('hasWideContent', () => {
  it('is false for plain prose', () => {
    expect(hasWideContent('Just a normal reply about the methods section.')).toBe(false)
  })

  it('is true for block math ($$...$$)', () => {
    expect(hasWideContent('Expected gain: $$0.843 - 0.812 = 0.031$$')).toBe(true)
  })

  it('is false for inline math alone ($...$)', () => {
    expect(hasWideContent('The accuracy is $0.843$ in this setup.')).toBe(false)
  })

  it('is true for a fenced code block', () => {
    expect(hasWideContent('Here is the Lean proof:\n```lean\ntheorem foo : 1 = 1 := rfl\n```')).toBe(true)
  })

  it('is true for an unlabeled fenced code block', () => {
    expect(hasWideContent('```\nsome output\n```')).toBe(true)
  })

  it('is false for a stray triple-backtick with no closing fence', () => {
    expect(hasWideContent('He said ``` without closing it')).toBe(false)
  })
})
