'use client'

import { useEffect, useState } from 'react'
import { ImageIcon, Star, Trash2, Upload } from 'lucide-react'
import { resolveProductImageUrl } from '@/lib/product-images'

type ProductImage = {
  id: string
  product_id: string
  image_url: string
  is_primary: boolean
  sort_order: number
}

export default function ProductGallery({ productId }: { productId: string }) {
  const [images, setImages] = useState<ProductImage[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadImages()
  }, [productId])

  async function loadImages() {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/images`)
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'No se pudieron cargar las imágenes.'
      alert('Error cargando imágenes: ' + message)
      return
    }

    setImages(Array.isArray(payload) ? payload as ProductImage[] : [])
  }

  async function uploadImages(files: FileList | File[]) {
    if (!productId) return

    setUploading(true)

    const currentCount = images.length
    const fileArray = Array.from(files)

    for (let index = 0; index < fileArray.length; index++) {
      const file = fileArray[index]

      if (!file.type.startsWith('image/')) continue

      try {
        const isFirstImage = currentCount === 0 && index === 0
        const formData = new FormData()
        formData.append('file', file)
        formData.append('isPrimary', String(isFirstImage))
        formData.append('sortOrder', String(currentCount + index + 1))

        const response = await fetch(`/api/products/${encodeURIComponent(productId)}/images/upload`, {
          method: 'POST',
          body: formData,
        })
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error)
            : 'No se pudo subir la imagen.'
          throw new Error(message)
        }
      } catch (error) {
        alert('Error subiendo imagen: ' + (error instanceof Error ? error.message : 'Error desconocido'))
      }
    }

    setUploading(false)
    loadImages()
  }

  async function setPrimary(imageId: string) {
    const response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPrimary: true }),
      }
    )
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'No se pudo marcar la imagen principal.'
      alert('Error marcando imagen principal: ' + message)
      return
    }

    loadImages()
  }

  async function deleteImage(image: ProductImage) {
    if (!confirm('¿Eliminar esta imagen?')) return

    const response = await fetch(
      `/api/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(image.id)}`,
      { method: 'DELETE' }
    )
    const payload: unknown = await response.json().catch(() => null)

    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'No se pudo eliminar la imagen.'
      alert('Error eliminando imagen: ' + message)
      return
    }

    loadImages()
  }

  const primaryImage = images.find((img) => img.is_primary) || images[0]

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h3 className="text-xl font-bold">Galería de imágenes</h3>
      <p className="text-sm text-zinc-500">
        Sube varias imágenes y marca cuál será la principal.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
        <div className="md:col-span-1">
          <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50">
            {primaryImage ? (
              <img
                src={resolveProductImageUrl(primaryImage) || ''}
                alt="Imagen principal"
                className="h-full w-full object-contain p-4"
              />
            ) : (
              <ImageIcon className="text-zinc-300" size={55} />
            )}
          </div>

          <p className="mt-2 text-center text-sm font-semibold text-zinc-500">
            Imagen principal
          </p>
        </div>

        <div className="md:col-span-2">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              if (e.dataTransfer.files.length > 0) {
                uploadImages(e.dataTransfer.files)
              }
            }}
            className="rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-6 text-center hover:border-emerald-500"
          >
            <Upload className="mx-auto text-emerald-500" size={32} />

            <p className="mt-3 font-semibold">
              Arrastra una o varias imágenes aquí
            </p>

            <p className="text-sm text-zinc-500">
              También puedes seleccionarlas desde tu PC.
            </p>

            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={(e) => {
                const files = e.target.files
                if (files) uploadImages(files)
              }}
              className="mt-4"
            />

            {uploading && (
              <p className="mt-3 text-sm font-semibold text-emerald-600">
                Subiendo imágenes...
              </p>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {images.map((image) => (
              <div
                key={image.id}
                className={`relative overflow-hidden rounded-xl border bg-white ${
                  image.is_primary ? 'border-emerald-500' : 'border-zinc-200'
                }`}
              >
                <div className="flex h-28 items-center justify-center bg-zinc-50">
                  <img
                    src={resolveProductImageUrl(image) || ''}
                    alt="Producto"
                    className="h-full w-full object-contain p-2"
                  />
                </div>

                <div className="flex items-center justify-between p-2">
                  <button
                    onClick={() => setPrimary(image.id)}
                    className={`rounded-lg p-2 ${
                      image.is_primary
                        ? 'bg-emerald-500 text-white'
                        : 'bg-zinc-100 text-zinc-600'
                    }`}
                    title="Marcar como principal"
                  >
                    <Star size={15} />
                  </button>

                  <button
                    onClick={() => deleteImage(image)}
                    className="rounded-lg bg-red-50 p-2 text-red-500"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {images.length === 0 && (
            <p className="mt-5 text-center text-sm text-zinc-500">
              Este producto todavía no tiene imágenes.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
