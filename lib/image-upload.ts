'use client'

import { supabase } from '@/lib/supabase'

const PRODUCT_IMAGE_BUCKET = 'product-images'

function isMissingBucketError(message: string) {
  return message.toLowerCase().includes('bucket not found')
}

function compressImageToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.onload = () => {
      const image = new Image()

      image.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
      image.onload = () => {
        const maxSize = 1000
        const ratio = Math.min(maxSize / image.width, maxSize / image.height, 1)
        const width = Math.max(1, Math.round(image.width * ratio))
        const height = Math.max(1, Math.round(image.height * ratio))
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          reject(new Error('No se pudo preparar la imagen.'))
          return
        }

        canvas.width = width
        canvas.height = height
        context.drawImage(image, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }

      image.src = String(reader.result || '')
    }

    reader.readAsDataURL(file)
  })
}

export async function uploadProductImageOrFallback(file: File, fileName: string) {
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(fileName, file)

  if (!error) {
    const { data } = supabase.storage
      .from(PRODUCT_IMAGE_BUCKET)
      .getPublicUrl(fileName)

    return data.publicUrl
  }

  if (!isMissingBucketError(error.message)) {
    throw error
  }

  return compressImageToDataUrl(file)
}
