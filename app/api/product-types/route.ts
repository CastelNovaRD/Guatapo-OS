import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createProductType, listProductTypes, type ProductTypeInput } from '@/lib/repositories/product-types-repository'
const failure=(error:unknown)=>Response.json({error:error instanceof Error?error.message:'Unavailable'},{status:503})
export async function GET(request:Request){try{return Response.json(await listProductTypes(await requireTenantContext(request)))}catch(error){return failure(error)}}
export async function POST(request:Request){try{const body=await request.json() as ProductTypeInput;const value=body.value?.trim(),label=body.label?.trim();if(!value||!label)return Response.json({error:'value and label are required'},{status:400});return Response.json(await createProductType(await requireTenantContext(request),{...body,value,label}),{status:201})}catch(error){return failure(error)}}
