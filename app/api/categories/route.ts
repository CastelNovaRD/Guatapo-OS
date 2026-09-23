import {requireTenantContext} from '@/lib/auth/tenant-context';import * as r from '@/lib/repositories/categories-repository'
const fail=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Unavailable'},{status:503})
export async function GET(q:Request){try{return Response.json(await r.listCategories(await requireTenantContext(q)))}catch(e){return fail(e)}}
export async function POST(q:Request){try{const b=await q.json(),name=String(b.name||'').trim();if(!name)return Response.json({error:'name is required'},{status:400});return Response.json(await r.createCategory(await requireTenantContext(q),name),{status:201})}catch(e){return fail(e)}}
