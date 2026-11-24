export type Campaign = {
  id: string
  name: string
  setting: string
  description: string
  system: string
  status: 'Em andamento' | 'Preparação'
  role: 'Mestre' | 'Jogador'
  players: number
  inviteCode: string
  map: string
  memberUids: string[]
  ownerUid?: string
  ownerName: string
  updatedAt: number
}
export type Token = { id: string; name: string; initials: string; color: string; x: number; y: number }
export type UserIdentity = { uid: string; email: string }
