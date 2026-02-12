const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 })

const MAX_OUTGOING = 5
const X_USERNAME_REGEX = /^[a-z0-9_]{1,15}$/

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
}

function assertXAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Login required.')
  }

  const signInProvider = request.auth.token?.firebase?.sign_in_provider
  if (signInProvider !== 'twitter.com') {
    throw new HttpsError('permission-denied', 'Login with X is required.')
  }

  return request.auth.uid
}

function assertValidXUsername(username) {
  if (!X_USERNAME_REGEX.test(username)) {
    throw new HttpsError('invalid-argument', 'X username must be 1-15 chars: a-z, 0-9, or _')
  }
}

function extractXUserId(authToken) {
  const identities = authToken?.firebase?.identities
  const twitterIdentities = identities?.['twitter.com']
  if (Array.isArray(twitterIdentities) && twitterIdentities.length > 0) {
    return String(twitterIdentities[0])
  }
  return null
}

function extractUsernameFromRequest(request) {
  const fromPayload = normalizeUsername(request.data?.username)
  if (fromPayload) {
    return fromPayload
  }

  // Only trust explicit X handle fields from token.
  // Generic fields like `username` may contain placeholders such as "internal".
  return normalizeUsername(request.auth?.token?.screen_name || request.auth?.token?.screenName)
}

async function upsertXIdentity({ uid, username, authToken }) {
  const userRef = db.collection('users').doc(uid)
  const usernameRef = db.collection('usernameIndex').doc(username)
  const statsRef = db.collection('stats').doc(uid)
  const xUserId = extractXUserId(authToken)
  const xIndexRef = xUserId ? db.collection('xUserIndex').doc(xUserId) : null

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    const usernameSnap = await tx.get(usernameRef)
    const xIndexSnap = xIndexRef ? await tx.get(xIndexRef) : null

    const prevUsername = userSnap.exists ? normalizeUsername(userSnap.data().username) : ''
    const prevUsernameRef =
      prevUsername && prevUsername !== username ? db.collection('usernameIndex').doc(prevUsername) : null
    const prevUsernameSnap = prevUsernameRef ? await tx.get(prevUsernameRef) : null

    if (usernameSnap.exists && usernameSnap.data().uid !== uid) {
      throw new HttpsError('already-exists', 'Username already taken.')
    }

    if (xIndexSnap?.exists && xIndexSnap.data().uid !== uid) {
      throw new HttpsError('permission-denied', 'This X account is already linked to another user.')
    }

    tx.set(
      userRef,
      {
        username,
        authProvider: 'twitter.com',
        ...(xUserId ? { xUserId } : {}),
        createdAt: userSnap.exists ? userSnap.data().createdAt : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    tx.set(
      statsRef,
      {
        incomingCount: 0,
        outgoingCount: 0,
        matchCount: 0,
      },
      { merge: true }
    )

    tx.set(usernameRef, {
      uid,
      username,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    if (xIndexRef) {
      tx.set(xIndexRef, {
        uid,
        xUserId,
        username,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    }

    if (prevUsernameRef && prevUsernameSnap?.exists && prevUsernameSnap.data().uid === uid) {
      tx.delete(prevUsernameRef)
    }
  })
}

exports.syncXProfile = onCall({ invoker: 'public' }, async (request) => {
  const uid = assertXAuth(request)
  const username = extractUsernameFromRequest(request)

  if (!username) {
    throw new HttpsError(
      'failed-precondition',
      'Could not read your X username from this session. Please sign out and sign in again.'
    )
  }

  assertValidXUsername(username)
  await upsertXIdentity({ uid, username, authToken: request.auth.token })

  return { ok: true, username }
})

exports.claimUsername = onCall({ invoker: 'public' }, async (request) => {
  const uid = assertXAuth(request)
  const username = normalizeUsername(request.data?.username)

  assertValidXUsername(username)
  await upsertXIdentity({ uid, username, authToken: request.auth.token })

  return { ok: true, username }
})

exports.addAdmirer = onCall({ invoker: 'public' }, async (request) => {
  const fromUid = assertXAuth(request)
  const toUsername = normalizeUsername(request.data?.toUsername)
  const message = String(request.data?.message || '').trim().slice(0, 300)

  if (!X_USERNAME_REGEX.test(toUsername)) {
    throw new HttpsError('invalid-argument', 'Invalid recipient username.')
  }

  const fromUserRef = db.collection('users').doc(fromUid)

  return db.runTransaction(async (tx) => {
    const fromUserSnap = await tx.get(fromUserRef)
    if (!fromUserSnap.exists || !fromUserSnap.data().username) {
      throw new HttpsError('failed-precondition', 'Your X profile is not synced. Sign out and sign in again.')
    }

    const fromUsername = fromUserSnap.data().username
    if (fromUsername === toUsername) {
      throw new HttpsError('invalid-argument', 'You cannot add yourself.')
    }

    const toIndexRef = db.collection('usernameIndex').doc(toUsername)
    const toIndexSnap = await tx.get(toIndexRef)
    if (!toIndexSnap.exists) {
      throw new HttpsError('not-found', 'That username has not joined yet.')
    }

    const toUid = toIndexSnap.data().uid
    const statsRef = db.collection('stats').doc(fromUid)
    const statsSnap = await tx.get(statsRef)
    const outgoingCount = statsSnap.exists ? Number(statsSnap.data().outgoingCount || 0) : 0

    const edgeId = `${fromUid}_${toUid}`
    const reverseEdgeId = `${toUid}_${fromUid}`
    const edgeRef = db.collection('admirations').doc(edgeId)
    const reverseRef = db.collection('admirations').doc(reverseEdgeId)
    const toStatsRef = db.collection('stats').doc(toUid)

    const [edgeSnap, reverseSnap, toStatsSnap] = await Promise.all([
      tx.get(edgeRef),
      tx.get(reverseRef),
      tx.get(toStatsRef),
    ])
    if (edgeSnap.exists) {
      throw new HttpsError('already-exists', 'You already added this person.')
    }

    if (outgoingCount >= MAX_OUTGOING) {
      throw new HttpsError('resource-exhausted', `You can add max ${MAX_OUTGOING} secret admirers.`)
    }

    const incomingCount = toStatsSnap.exists ? Number(toStatsSnap.data().incomingCount || 0) : 0
    const fromMatchCount = statsSnap.exists ? Number(statsSnap.data().matchCount || 0) : 0
    const toMatchCount = toStatsSnap.exists ? Number(toStatsSnap.data().matchCount || 0) : 0

    tx.set(edgeRef, {
      fromUid,
      toUid,
      fromUsername,
      toUsername,
      message,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      revealed: false,
    })

    tx.set(statsRef, { outgoingCount: outgoingCount + 1 }, { merge: true })

    tx.set(toStatsRef, { incomingCount: incomingCount + 1 }, { merge: true })

    let match = false
    if (reverseSnap.exists) {
      match = true
      tx.set(edgeRef, { revealed: true, matchedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
      tx.set(reverseRef, { revealed: true, matchedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })

      const fromMatchRef = db.collection('users').doc(fromUid).collection('matches').doc(toUid)
      const toMatchRef = db.collection('users').doc(toUid).collection('matches').doc(fromUid)
      tx.set(fromMatchRef, {
        otherUid: toUid,
        otherUsername: toUsername,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      tx.set(toMatchRef, {
        otherUid: fromUid,
        otherUsername: fromUsername,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      tx.set(statsRef, { matchCount: fromMatchCount + 1 }, { merge: true })
      tx.set(toStatsRef, { matchCount: toMatchCount + 1 }, { merge: true })
    }

    return { ok: true, match, toUsername }
  })
})

exports.getDashboard = onCall({ invoker: 'public' }, async (request) => {
  const uid = assertXAuth(request)
  const userRef = db.collection('users').doc(uid)
  const statsRef = db.collection('stats').doc(uid)

  const [userSnap, statsSnap, matchesSnap, sentAdmirersSnap] = await Promise.all([
    userRef.get(),
    statsRef.get(),
    db.collection('users').doc(uid).collection('matches').orderBy('createdAt', 'desc').limit(20).get(),
    db.collection('admirations').where('fromUid', '==', uid).get(),
  ])

  const sentAdmirers = sentAdmirersSnap.docs
    .map((doc) => {
      const data = doc.data()
      return {
        toUid: String(data.toUid || ''),
        toUsername: String(data.toUsername || ''),
        revealed: Boolean(data.revealed),
        createdAt: data.createdAt || null,
        matchedAt: data.matchedAt || null,
      }
    })
    .filter((item) => item.toUid && item.toUsername)
    .sort((a, b) => {
      const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
      const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0
      return bTime - aTime
    })
    .slice(0, MAX_OUTGOING)

  return {
    username: userSnap.exists ? userSnap.data().username : null,
    incomingCount: statsSnap.exists ? Number(statsSnap.data().incomingCount || 0) : 0,
    outgoingCount: statsSnap.exists ? Number(statsSnap.data().outgoingCount || 0) : 0,
    maxOutgoing: MAX_OUTGOING,
    matches: matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    sentAdmirers,
  }
})
