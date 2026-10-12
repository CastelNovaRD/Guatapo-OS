-- Normalización no destructiva de categorías para Guatapo OS.
-- No elimina productos, categorías ni columnas. No modifica OTROS.
-- Revisar y ejecutar manualmente en Supabase sólo cuando sea autorizado.

begin;

with category_map(source_name, canonical_name) as (
  values
    ('ADAPTADOR', 'Adaptadores'),
    ('Perifericos', 'Periféricos'),
    ('Audifonos', 'Audífonos'),
    ('Laptop', 'Laptops'),
    ('Tablet', 'Tablets'),
    ('Reloj', 'Relojes'),
    ('microfono', 'Micrófonos'),
    ('Liquidacion', 'Liquidación'),
    ('RJ45', 'Cables')
)
update public.products as product
set category = category_map.canonical_name
from category_map
where product.category = category_map.source_name
  and product.category is distinct from category_map.canonical_name;

-- Actualiza el catálogo de categorías solamente cuando no existe ya la categoría
-- canónica para esa misma tienda, evitando conflictos con una restricción única.
with category_map(source_name, canonical_name) as (
  values
    ('ADAPTADOR', 'Adaptadores'),
    ('Perifericos', 'Periféricos'),
    ('Audifonos', 'Audífonos'),
    ('Laptop', 'Laptops'),
    ('Tablet', 'Tablets'),
    ('Reloj', 'Relojes'),
    ('microfono', 'Micrófonos'),
    ('Liquidacion', 'Liquidación'),
    ('RJ45', 'Cables')
)
update public.categories as category
set name = category_map.canonical_name
from category_map
where category.name = category_map.source_name
  and not exists (
    select 1
    from public.categories as canonical_category
    where canonical_category.store_id = category.store_id
      and canonical_category.name = category_map.canonical_name
      and canonical_category.id <> category.id
  );

commit;
