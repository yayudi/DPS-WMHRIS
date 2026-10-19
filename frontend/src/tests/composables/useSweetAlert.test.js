import { describe, it, expect, vi, beforeEach } from 'vitest'
import Swal from 'sweetalert2'
import { swalConfirm, swalAlert, swalDraftConfirm, useSweetAlert } from '@/composables/useSweetAlert'

vi.mock('sweetalert2', () => ({
  default: {
    fire: vi.fn()
  }
}))

describe('useSweetAlert composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('swalConfirm', () => {
    it('returns true when user confirms', async () => {
      Swal.fire.mockResolvedValueOnce({ isConfirmed: true })

      const result = await swalConfirm('Hapus data?', 'Aksi ini permanen')
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Hapus data?',
          text: 'Aksi ini permanen',
          icon: 'warning',
          showCancelButton: true
        })
      )
      expect(result).toBe(true)
    })

    it('returns false when user cancels', async () => {
      Swal.fire.mockResolvedValueOnce({ isConfirmed: false })

      const result = await swalConfirm('Batal?', '', 'Ya', 'Tidak')
      expect(result).toBe(false)
    })
  })

  describe('swalAlert', () => {
    it('renders text alert by default', async () => {
      Swal.fire.mockResolvedValueOnce({})

      await swalAlert('Info', 'Pesan informasi', 'info')
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Info',
          text: 'Pesan informasi',
          icon: 'info'
        })
      )
    })

    it('renders html alert when isHtml is true', async () => {
      Swal.fire.mockResolvedValueOnce({})

      await swalAlert('Berhasil', '<b>Sukses!</b>', 'success', true)
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Berhasil',
          html: '<b>Sukses!</b>',
          icon: 'success'
        })
      )
    })
  })

  describe('swalDraftConfirm', () => {
    it('returns "save" when confirmed', async () => {
      Swal.fire.mockResolvedValueOnce({ isConfirmed: true, isDenied: false })

      const action = await swalDraftConfirm('Kembali?')
      expect(Swal.fire).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Kembali?',
          showDenyButton: true,
          showCancelButton: true,
          confirmButtonText: 'Simpan Draf',
          denyButtonText: 'Hapus Isian',
          cancelButtonText: 'Batal'
        })
      )
      expect(action).toBe('save')
    })

    it('returns "clear" when denied', async () => {
      Swal.fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: true })

      const action = await swalDraftConfirm()
      expect(action).toBe('clear')
    })

    it('returns "cancel" when cancelled or dismissed', async () => {
      Swal.fire.mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true })

      const action = await swalDraftConfirm()
      expect(action).toBe('cancel')
    })
  })

  describe('useSweetAlert factory', () => {
    it('exposes swalConfirm, swalAlert, and swalDraftConfirm', () => {
      const api = useSweetAlert()
      expect(api.swalConfirm).toBe(swalConfirm)
      expect(api.swalAlert).toBe(swalAlert)
      expect(api.swalDraftConfirm).toBe(swalDraftConfirm)
    })
  })
})
