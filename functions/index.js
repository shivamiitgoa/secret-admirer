const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 })

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
}

exports.claimUsername = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Login required.')
  }

  const uid = request.auth.uid
  const username = normalizeUsername(request.data?.username)

  if (!/^[a-z0-9._]{3,30}$/.test(username)) {
    throw new HttpsError('invalid-argument', 'Username must be 3-30 chars: a-z, 0-9, . or _')
  }

  const userRef = db.collection('users').doc(uid)
  const usernameRef = db.collection('usernameIndex').doc(username)
  const statsRef = db.collection('stats').doc(uid)

  await db.runTransaction(async (tx) => {
    const [userSnap, usernameSnap] = await Promise.all([tx.get(userRef), tx.get(usernameRef)])

    if (usernameSnap.exists && usernameSnap.data().uid !== uid) {
      throw new HttpsError('already-exists', 'Username already taken.')
    }

    const prevUsername = userSnap.exists ? userSnap.data().username : null

    tx.set(
      userRef,
      {
        username,
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

    tx.set(usernameRef, { uid, username, updatedAt: admin.firestore.FieldValue.serverTimestamp() })

    if (prevUsername && prevUsername !== username) {
      tx.delete(db.collection('usernameIndex').doc(prevUsername))
    }
  })

  return { ok: true, username }
})

exports.addAdmirer = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Login required.')
  }

  const fromUid = request.auth.uid
  const toUsername = normalizeUsername(request.data?.toUsername)
  const message = String(request.data?.message || '').trim().slice(0, 300)

  if (!/^[a-z0-9._]{3,30}$/.test(toUsername)) {
    throw new HttpsError('invalid-argument', 'Invalid recipient username.')
  }

  const fromUserRef = db.collection('users').doc(fromUid)

  return db.runTransaction(async (tx) => {
    const fromUserSnap = await tx.get(fromUserRef)
    if (!fromUserSnap.exists || !fromUserSnap.data().username) {
      throw new HttpsError('failed-precondition', 'Claim your username first.')
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

    const [edgeSnap, reverseSnap] = await Promise.all([tx.get(edgeRef), tx.get(reverseRef)])
    if (edgeSnap.exists) {
      throw new HttpsError('already-exists', 'You already added this person.')
    }

    if (outgoingCount >= 5) {
      throw new HttpsError('resource-exhausted', 'You can add max 5 secret admirers.')
    }

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

    const toStatsRef = db.collection('stats').doc(toUid)
    const toStatsSnap = await tx.get(toStatsRef)
    const incomingCount = toStatsSnap.exists ? Number(toStatsSnap.data().incomingCount || 0) : 0
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

      const fromStatsSnap = await tx.get(statsRef)
      const fromMatchCount = fromStatsSnap.exists ? Number(fromStatsSnap.data().matchCount || 0) : 0
      const toMatchCount = toStatsSnap.exists ? Number(toStatsSnap.data().matchCount || 0) : 0
      tx.set(statsRef, { matchCount: fromMatchCount + 1 }, { merge: true })
      tx.set(toStatsRef, { matchCount: toMatchCount + 1 }, { merge: true })
    }

    return { ok: true, match, toUsername }
  })
})

exports.getDashboard = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Login required.')
  }

  const uid = request.auth.uid
  const userRef = db.collection('users').doc(uid)
  const statsRef = db.collection('stats').doc(uid)

  const [userSnap, statsSnap, matchesSnap] = await Promise.all([
    userRef.get(),
    statsRef.get(),
    db.collection('users').doc(uid).collection('matches').orderBy('createdAt', 'desc').limit(20).get(),
  ])

  return {
    username: userSnap.exists ? userSnap.data().username : null,
    incomingCount: statsSnap.exists ? Number(statsSnap.data().incomingCount || 0) : 0,
    outgoingCount: statsSnap.exists ? Number(statsSnap.data().outgoingCount || 0) : 0,
    maxOutgoing: 5,
    matches: matchesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  }
})
