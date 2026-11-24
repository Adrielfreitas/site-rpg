import type { Campaign, Token, UserIdentity } from './models'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'site-rpg-ce9f4',
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || 'https://site-rpg-ce9f4-default-rtdb.firebaseio.com',
}

export const firebaseReady = Boolean(config.apiKey && config.projectId && config.appId && config.databaseURL)
type Client = { auth: import('firebase/auth').Auth; db: import('firebase/database').Database }
let clientPromise: Promise<Client> | null = null
function getClient() {
  if (!clientPromise) clientPromise = Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]).then(([appSdk, authSdk, databaseSdk]) => {
    const app = appSdk.getApps()[0] ?? appSdk.initializeApp(config)
    return { auth: authSdk.getAuth(app), db: databaseSdk.getDatabase(app, config.databaseURL) }
  })
  return clientPromise
}

export function watchAuth(onUser: (user: UserIdentity | null) => void) {
  let unsubscribe = () => {}
  let cancelled = false
  if (firebaseReady) void getClient().then(({ auth }) => import('firebase/auth').then(({ onAuthStateChanged }) => {
    if (!cancelled) unsubscribe = onAuthStateChanged(auth, (user) => onUser(user ? { uid: user.uid, email: user.email ?? 'Aventureiro' } : null))
  }))
  return () => { cancelled = true; unsubscribe() }
}

export function watchCampaigns(uid: string, onCampaigns: (campaigns: Campaign[]) => void, onError: () => void) {
  let unsubscribeIndex = () => {}
  let cancelled = false
  const subscriptions = new Map<string, { stop: () => void; meta?: Record<string, unknown>; members?: Record<string, unknown> }>()
  const publish = () => {
    const campaigns = [...subscriptions.entries()].flatMap(([id, current]) => {
      if (!current.meta || !current.members) return []
      const members = current.members
      return [{ ...current.meta, id, players: Object.keys(members).length, role: members[uid] ? (members[uid] as { role?: string }).role : 'Jogador' } as Campaign]
    }).sort((a, b) => b.updatedAt - a.updatedAt)
    onCampaigns(campaigns)
  }
  void getClient().then(async ({ db }) => {
    if (cancelled) return
    const { onValue, ref } = await import('firebase/database')
    if (cancelled) return
    unsubscribeIndex = onValue(ref(db, `userCampaigns/${uid}`), (snapshot) => {
      const ids = Object.keys(snapshot.val() ?? {})
      for (const [id, current] of subscriptions) if (!ids.includes(id)) { current.stop(); subscriptions.delete(id) }
      for (const id of ids) {
        if (subscriptions.has(id)) continue
        const state: { stop: () => void; meta?: Record<string, unknown>; members?: Record<string, unknown> } = { stop: () => {} }
        const metaStop = onValue(ref(db, `campaigns/${id}/meta`), (meta) => { state.meta = meta.val() ?? undefined; publish() })
        const membersStop = onValue(ref(db, `campaigns/${id}/members`), (members) => { state.members = members.val() ?? undefined; publish() })
        state.stop = () => { metaStop(); membersStop() }
        subscriptions.set(id, state)
      }
      publish()
    }, onError)
  }).catch(onError)
  return () => { cancelled = true; unsubscribeIndex(); subscriptions.forEach((entry) => entry.stop()); subscriptions.clear() }
}

export async function createRemoteCampaign(campaign: Campaign, tokens: Token[], user: UserIdentity) {
  const { db } = await getClient()
  const { push, ref, set } = await import('firebase/database')
  const campaignRef = push(ref(db, 'campaigns'))
  const id = campaignRef.key
  if (!id) throw new Error('Não foi possível gerar o identificador da campanha.')
  const meta = { name: campaign.name, setting: campaign.setting, description: campaign.description, system: campaign.system, status: campaign.status, players: 1, inviteCode: campaign.inviteCode, map: campaign.map, ownerUid: user.uid, ownerName: user.email.split('@')[0], updatedAt: Date.now() }
  const initialTokenData = Object.fromEntries(tokens.map((token) => [token.id, token]))
  await set(ref(db, `campaigns/${id}`), { meta, members: { [user.uid]: { uid: user.uid, role: 'Mestre', joinedAt: Date.now() } }, tokens: initialTokenData, messages: {} })
  await set(ref(db, `invites/${campaign.inviteCode}`), { campaignId: id, inviteCode: campaign.inviteCode, ownerUid: user.uid, name: campaign.name, setting: campaign.setting })
  await set(ref(db, `userCampaigns/${user.uid}/${id}`), true)
  return id
}

export async function joinRemoteCampaign(invite: string, user: UserIdentity) {
  const { db } = await getClient()
  const { get, ref, set } = await import('firebase/database')
  const inviteSnapshot = await get(ref(db, `invites/${invite}`))
  if (!inviteSnapshot.exists()) throw new Error('Não encontramos uma campanha com esse código.')
  const inviteData = inviteSnapshot.val() as { campaignId: string; ownerUid: string; name: string }
  if (inviteData.ownerUid === user.uid) throw new Error('Esta campanha é sua. Compartilhe o código com outro jogador.')
  const memberRef = ref(db, `campaigns/${inviteData.campaignId}/members/${user.uid}`)
  const existing = await get(memberRef)
  if (!existing.exists()) await set(memberRef, { uid: user.uid, role: 'Jogador', inviteCode: invite, joinedAt: Date.now() })
  await set(ref(db, `userCampaigns/${user.uid}/${inviteData.campaignId}`), true)
  return inviteData.name
}

export async function authenticate(email: string, password: string, create: boolean) {
  const { auth } = await getClient()
  const sdk = await import('firebase/auth')
  return create ? sdk.createUserWithEmailAndPassword(auth, email, password) : sdk.signInWithEmailAndPassword(auth, email, password)
}

export async function logout() {
  const { auth } = await getClient()
  const { signOut } = await import('firebase/auth')
  await signOut(auth)
}

export function watchSession(campaignId: string, onTokens: (tokens: Token[]) => void, onMessages: (messages: string[]) => void) {
  let unsubscribeTokens = () => {}
  let unsubscribeMessages = () => {}
  let cancelled = false
  void getClient().then(async ({ db }) => {
    if (cancelled) return
    const { limitToLast, onValue, query, ref } = await import('firebase/database')
    if (cancelled) return
    unsubscribeTokens = onValue(ref(db, `campaigns/${campaignId}/tokens`), (snapshot) => {
      const data = snapshot.val() as Record<string, Token> | null
      if (data) onTokens(Object.values(data))
    })
    unsubscribeMessages = onValue(query(ref(db, `campaigns/${campaignId}/messages`), limitToLast(30)), (snapshot) => {
      const data = snapshot.val() as Record<string, { text: string; author: string; createdAt: number }> | null
      if (data) onMessages(Object.values(data).sort((a, b) => a.createdAt - b.createdAt).slice(-30).map((item) => `${item.author}: ${item.text}`))
    })
  }).catch(() => undefined)
  return () => { cancelled = true; unsubscribeTokens(); unsubscribeMessages() }
}

export async function saveRemoteToken(campaignId: string, token: Token) {
  const { db } = await getClient()
  const { ref, set } = await import('firebase/database')
  await set(ref(db, `campaigns/${campaignId}/tokens/${token.id}`), token)
}

export async function saveRemoteCampaignStatus(campaignId: string, status: Campaign['status']) {
  const { db } = await getClient()
  const { ref, update } = await import('firebase/database')
  await update(ref(db, `campaigns/${campaignId}/meta`), { status, updatedAt: Date.now() })
}

export async function sendRemoteMessage(campaignId: string, text: string, user: UserIdentity) {
  const { db } = await getClient()
  const { push, ref, set } = await import('firebase/database')
  const messageRef = push(ref(db, `campaigns/${campaignId}/messages`))
  await set(messageRef, { text, author: user.email.split('@')[0], authorUid: user.uid, createdAt: Date.now() })
}
