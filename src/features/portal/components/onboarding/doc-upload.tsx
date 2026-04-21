import { useState, useRef, useCallback } from 'react'
import { Upload, X, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  label: string
  subtitle?: string
  accept?: string
  maxSizeMb?: number
  file: File | null
  onFileChange: (file: File | null) => void
}

export function DocUpload({ label, subtitle, accept = '.pdf,.jpg,.jpeg,.png', maxSizeMb = 10, file, onFileChange }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (f.size > maxSizeMb * 1024 * 1024) {
      alert(`Fichier trop lourd (max ${maxSizeMb} Mo)`)
      return
    }
    onFileChange(f)
  }, [maxSizeMb, onFileChange])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [handleFile])

  if (file) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-emerald-900 truncate">{file.name}</p>
            <p className="text-xs text-emerald-600">{(file.size / 1024).toFixed(0)} Ko</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onFileChange(null)} className="shrink-0 text-gray-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {label && <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>}
      {subtitle && <p className="text-xs text-gray-500 mb-2">{subtitle}</p>}
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <Upload className="mx-auto h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-600">
          Glissez un fichier ici ou <span className="font-semibold text-violet-600">parcourir</span>
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG · max {maxSizeMb} Mo</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
      </div>
    </div>
  )
}
