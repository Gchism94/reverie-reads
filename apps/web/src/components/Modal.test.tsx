import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  it('uses the native top layer so a nested editor can appear above a drawer dialog', () => {
    const close = vi.fn()
    render(
      <Modal title="Nested editor" onClose={close}>
        Editor content
      </Modal>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Nested editor' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('open')
    expect(screen.getByText('Editor content')).toBeVisible()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(close).toHaveBeenCalledOnce()
  })
})
