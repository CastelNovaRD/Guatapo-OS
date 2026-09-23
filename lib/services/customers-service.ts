import type { TenantContext } from '@/lib/auth/tenant-context'
import * as repository from '@/lib/repositories/customers-repository'
export const listCustomers=(tenant:TenantContext)=>repository.listCustomers(tenant)
export const getCustomer=(tenant:TenantContext,id:string)=>repository.getCustomer(tenant,id)
export const createCustomer=(tenant:TenantContext,input:repository.CustomerInput)=>repository.createCustomer(tenant,input)
export const updateCustomer=(tenant:TenantContext,id:string,input:repository.CustomerInput)=>repository.updateCustomer(tenant,id,input)
export const deleteCustomer=(tenant:TenantContext,id:string)=>repository.deleteCustomer(tenant,id)
