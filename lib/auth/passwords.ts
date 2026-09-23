import 'server-only'

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'
const keyLength = 64
const parameters = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derive(password: string, salt: Buffer, length: number, options: typeof parameters) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived)
    })
  })
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const derived = await derive(password, salt, keyLength, parameters)
  return `scrypt$${parameters.N}$${parameters.r}$${parameters.p}$${salt.toString('base64url')}$${derived.toString('base64url')}`
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, N, r, p, saltValue, expectedValue] = encoded.split('$')
  if (!algorithm || algorithm !== 'scrypt' || !N || !r || !p || !saltValue || !expectedValue) return false

  try {
    const expected = Buffer.from(expectedValue, 'base64url')
    const actual = await derive(password, Buffer.from(saltValue, 'base64url'), expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function validatePassword(password: string) {
  if (password.length < 10) return 'Password must be at least 10 characters long.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include uppercase, lowercase, and a number.'
  }
  return null
}
