'use client'

import type { WebCategory } from './types'

type WebSidebarProps = {
  categories: WebCategory[]
  selectedCategory: string
  onSelectCategory: (category: string) => void
}

const templateCategories = [
  'Celulares',
  'Tablet',
  'Laptop',
  'Adaptadores',
  'Audifonos',
  'CPU',
  'Bocinas',
  'Cables',
  'Cargadores',
  'Video Juegos',
  'Gaming',
  'Herramientas',
  'Seguridad',
  'Redes',
  'Memorias y Discos',
  'Liquidacion',
  'Otros',
]

function normalizeCategory(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function orderCategories(categories: string[]) {
  const order = new Map(
    templateCategories.map((category, index) => [normalizeCategory(category), index])
  )

  return [...categories].sort((a, b) => {
    const aOrder = order.get(normalizeCategory(a))
    const bOrder = order.get(normalizeCategory(b))

    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
    if (aOrder !== undefined) return -1
    if (bOrder !== undefined) return 1

    return a.localeCompare(b, 'es')
  })
}

export default function WebSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
}: WebSidebarProps) {
  const categoryNames = categories.length
    ? orderCategories(categories.map((category) => category.name))
    : templateCategories

  return (
    <aside className="lg:sticky lg:top-28 lg:self-start">
      <div className="rounded-[26px] border-2 border-emerald-700 bg-white p-4">
        <h2 className="mb-3 text-center text-3xl font-black tracking-wide text-emerald-700">
          CATALOGO
        </h2>

        <nav className="flex gap-2 overflow-x-auto pb-1 lg:block lg:overflow-visible lg:pb-0">
          <button
            type="button"
            onClick={() => onSelectCategory('')}
            className={`whitespace-nowrap rounded-lg px-3 py-1 text-left text-lg font-black transition lg:block lg:w-full lg:whitespace-normal lg:text-xl ${
              selectedCategory === ''
                ? 'text-emerald-700'
                : 'text-zinc-950 hover:bg-emerald-50'
            }`}
          >
            Todos los Productos
          </button>

          {categoryNames.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => onSelectCategory(category)}
              className={`whitespace-nowrap rounded-lg px-3 py-1 text-left text-lg font-black transition lg:block lg:w-full lg:whitespace-normal lg:text-xl ${
                selectedCategory === category
                  ? 'text-emerald-700'
                  : 'text-zinc-950 hover:bg-emerald-50'
              }`}
            >
              {category}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}
