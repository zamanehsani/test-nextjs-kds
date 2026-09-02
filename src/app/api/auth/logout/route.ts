import { NextResponse } from 'next/server'
import { authenticatedHeaders, FRAPPE_URL } from '@/lib/frappe'

export async function POST() {
  await fetch(`${FRAPPE_URL}/api/method/logout`, {
    method: 'POST', headers: await authenticatedHeaders(), cache: 'no-store',
  })
  const result = NextResponse.json({ message: 'Logged out' })
  result.cookies.delete('sid')
  return result
}