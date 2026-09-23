import 'server-only'
import { query } from '@/lib/db'
import type { TenantContext } from '@/lib/auth/tenant-context'
const s=(t:TenantContext)=>[t.organizationId,t.installationId,t.storeId]
export const listCategories=async(t:TenantContext)=>(await query(`select id,name,active from categories where organization_id=$1 and installation_id=$2 and store_id=$3 order by name`,s(t))).rows
export const createCategory=async(t:TenantContext,name:string)=>(await query(`insert into categories(organization_id,installation_id,store_id,name,active) values($1,$2,$3,$4,true) on conflict(store_id,name) do update set active=true returning id,name,active`,[...s(t),name])).rows[0]
export const updateCategory=async(t:TenantContext,id:string,active:boolean)=>(await query(`update categories set active=$1 where id=$2 and organization_id=$3 and installation_id=$4 and store_id=$5 returning id,name,active`,[active,id,...s(t)])).rows[0]||null
