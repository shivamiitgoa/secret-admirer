const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 })

const MAX_OUTGOING = 5
const X_USERNAME_REGEX = /^[a-z0-9_]{1,15}$/
const CALLABLE_OPTIONS = { invoker: 'public', enforceAppCheck: true }
const PRIVACY_VERSION = '2026-02-12'
const TERMS_VERSION = '2026-02-12'
const CONSENT_TEXT_VERSION = '2026-02-12'
const MINIMUM_AGE = 18
const REPORT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000
const REPORT_DETAIL_MAX_CHARS = 500
const REPORT_REASON_SET = new Set(['harassment', 'impersonation', 'spam', 'other'])

const RATE_LIMITS = {
  syncXProfile: { limit: 20, windowMs: 60_000 },
  claimUsername: { limit: 20, windowMs: 60_000 },
  addAdmirer: { limit: 20, windowMs: 60_000 },
  getDashboard: { limit: 120, windowMs: 60_000 },
  acceptPolicies: { limit: 20, windowMs: 60_000 },
  reportUser: { limit: 20, windowMs: 60_000 },
  blockUser: { limit: 20, windowMs: 60_000 },
  unblockUser: { limit: 20, windowMs: 60_000 },
  deleteMyAccount: { limit: 5, windowMs: 60_000 },
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
}

function normalizeReportReason(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
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

function assertAcceptedConsent(userData) {
  if (!hasAcceptedCurrentPolicies(userData)) {
    throw new HttpsError('failed-precondition', 'Accept Privacy Policy and Terms before continuing.')
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

function extractXUsernameFromToken(authToken) {
  return normalizeUsername(authToken?.screen_name || authToken?.screenName)
}

function hasAcceptedCurrentPolicies(userData) {
  const legalConsent = userData?.legalConsent
  if (!legalConsent || typeof legalConsent !== 'object') {
    return false
  }

  return Boolean(
    legalConsent.privacyVersion === PRIVACY_VERSION &&
      legalConsent.termsVersion === TERMS_VERSION &&
      legalConsent.consentTextVersion === CONSENT_TEXT_VERSION &&
      legalConsent.ageConfirmed === true &&
      legalConsent.acceptedAt
  )
}

function buildBlockDocId(blockerUid, blockedUid) {
  return `${blockerUid}_${blockedUid}`
}

async function enforceUserRateLimit({ uid, action }) {
  const config = RATE_LIMITS[action]
  if (!config) {
    return
  }

  const now = Date.now()
  const limitRef = db.collection('rateLimits').doc(`${action}_${uid}`)

  await db.runTransaction(async (tx) => {
    const limitSnap = await tx.get(limitRef)
    let windowStartMs = now
    let count = 0

    if (limitSnap.exists) {
      const data = limitSnap.data()
      const prevWindowStartMs = Number(data.windowStartMs || 0)
      const prevCount = Number(data.count || 0)
      const withinWindow =
        Number.isFinite(prevWindowStartMs) &&
        Number.isFinite(prevCount) &&
        now - prevWindowStartMs < config.windowMs

      if (withinWindow) {
        windowStartMs = prevWindowStartMs
        count = prevCount
      }
    }

    if (count >= config.limit) {
      throw new HttpsError('resource-exhausted', 'Too many requests. Please wait a minute and try again.')
    }

    tx.set(
      limitRef,
      {
        uid,
        action,
        windowStartMs,
        count: count + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  })
}

async function resolveVerifiedUsername({ uid, request }) {
  const payloadUsername = normalizeUsername(request.data?.username)
  const tokenUsername = extractXUsernameFromToken(request.auth?.token)

  if (payloadUsername) {
    assertValidXUsername(payloadUsername)
  }

  if (tokenUsername) {
    assertValidXUsername(tokenUsername)

    if (payloadUsername && payloadUsername !== tokenUsername) {
      throw new HttpsError('permission-denied', 'Username does not match your verified X session.')
    }

    return tokenUsername
  }

  const xUserId = extractXUserId(request.auth?.token)
  if (!xUserId) {
    throw new HttpsError(
      'failed-precondition',
      'Could not verify your X username from this session. Please sign out and sign in again.'
    )
  }

  const xIndexSnap = await db.collection('xUserIndex').doc(xUserId).get()
  if (xIndexSnap.exists && xIndexSnap.data().uid === uid) {
    const knownUsername = normalizeUsername(xIndexSnap.data().username)
    if (knownUsername) {
      assertValidXUsername(knownUsername)
      return knownUsername
    }
  }

  const userSnap = await db.collection('users').doc(uid).get()
  if (userSnap.exists && userSnap.data().xUserId === xUserId) {
    const knownUsername = normalizeUsername(userSnap.data().username)
    if (knownUsername) {
      assertValidXUsername(knownUsername)
      return knownUsername
    }
  }

  throw new HttpsError(
    'failed-precondition',
    'Could not verify your X username from this session. Please sign out and sign in again.'
  )
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

async function deleteDocumentRefsInChunks(refs) {
  const dedupedRefs = []
  const seenPaths = new Set()

  for (const ref of refs) {
    if (!ref || seenPaths.has(ref.path)) {
      continue
    }
    seenPaths.add(ref.path)
    dedupedRefs.push(ref)
  }

  for (let index = 0; index < dedupedRefs.length; index += 400) {
    const chunk = dedupedRefs.slice(index, index + 400)
    const batch = db.batch()
    for (const ref of chunk) {
      batch.delete(ref)
    }
    await batch.commit()
  }
}

async function updateDocumentRefsInChunks(updates) {
  for (let index = 0; index < updates.length; index += 400) {
    const chunk = updates.slice(index, index + 400)
    const batch = db.batch()
    for (const update of chunk) {
      batch.set(update.ref, update.data, { merge: true })
    }
    await batch.commit()
  }
}

async function recalculateStatsForUsers(uids) {
  const uniqueUids = Array.from(new Set(uids.filter(Boolean)))

  for (const uid of uniqueUids) {
    const [incomingSnap, outgoingSnap, matchSnap] = await Promise.all([
      db.collection('admirations').where('toUid', '==', uid).get(),
      db.collection('admirations').where('fromUid', '==', uid).get(),
      db.collection('users').doc(uid).collection('matches').get(),
    ])

    await db
      .collection('stats')
      .doc(uid)
      .set(
        {
          incomingCount: incomingSnap.size,
          outgoingCount: outgoingSnap.size,
          matchCount: matchSnap.size,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
  }
}

exports.syncXProfile = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'syncXProfile' })
  const username = await resolveVerifiedUsername({ uid, request })

  assertValidXUsername(username)
  await upsertXIdentity({ uid, username, authToken: request.auth.token })

  return { ok: true, username }
})

exports.claimUsername = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'claimUsername' })
  const username = await resolveVerifiedUsername({ uid, request })

  assertValidXUsername(username)
  await upsertXIdentity({ uid, username, authToken: request.auth.token })

  return { ok: true, username }
})

exports.acceptPolicies = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'acceptPolicies' })

  const userRef = db.collection('users').doc(uid)
  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    tx.set(
      userRef,
      {
        authProvider: 'twitter.com',
        createdAt: userSnap.exists
          ? userSnap.data().createdAt || admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        legalConsent: {
          privacyVersion: PRIVACY_VERSION,
          termsVersion: TERMS_VERSION,
          consentTextVersion: CONSENT_TEXT_VERSION,
          ageConfirmed: true,
          minimumAge: MINIMUM_AGE,
          acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    )
  })

  return {
    ok: true,
    privacyVersion: PRIVACY_VERSION,
    termsVersion: TERMS_VERSION,
    acceptedAt: admin.firestore.Timestamp.now(),
  }
})

exports.addAdmirer = onCall(CALLABLE_OPTIONS, async (request) => {
  const fromUid = assertXAuth(request)
  await enforceUserRateLimit({ uid: fromUid, action: 'addAdmirer' })
  const toUsername = normalizeUsername(request.data?.toUsername)

  if (!X_USERNAME_REGEX.test(toUsername)) {
    throw new HttpsError('invalid-argument', 'Invalid recipient username.')
  }

  const fromUserRef = db.collection('users').doc(fromUid)

  return db.runTransaction(async (tx) => {
    const fromUserSnap = await tx.get(fromUserRef)
    if (!fromUserSnap.exists || !fromUserSnap.data().username) {
      throw new HttpsError('failed-precondition', 'Your X profile is not synced. Sign out and sign in again.')
    }

    assertAcceptedConsent(fromUserSnap.data())

    const fromUsername = fromUserSnap.data().username
    if (fromUsername === toUsername) {
      throw new HttpsError('invalid-argument', 'You cannot add yourself.')
    }

    const toIndexRef = db.collection('usernameIndex').doc(toUsername)
    const toIndexSnap = await tx.get(toIndexRef)
    if (!toIndexSnap.exists) {
      throw new HttpsError('failed-precondition', 'Could not add admirer with that username.')
    }

    const toUid = toIndexSnap.data().uid
    const blockRef = db.collection('blocks').doc(buildBlockDocId(fromUid, toUid))
    const reverseBlockRef = db.collection('blocks').doc(buildBlockDocId(toUid, fromUid))

    const statsRef = db.collection('stats').doc(fromUid)
    const statsSnap = await tx.get(statsRef)
    const outgoingCount = statsSnap.exists ? Number(statsSnap.data().outgoingCount || 0) : 0

    const edgeId = `${fromUid}_${toUid}`
    const reverseEdgeId = `${toUid}_${fromUid}`
    const edgeRef = db.collection('admirations').doc(edgeId)
    const reverseRef = db.collection('admirations').doc(reverseEdgeId)
    const toStatsRef = db.collection('stats').doc(toUid)

    const [edgeSnap, reverseSnap, toStatsSnap, blockSnap, reverseBlockSnap] = await Promise.all([
      tx.get(edgeRef),
      tx.get(reverseRef),
      tx.get(toStatsRef),
      tx.get(blockRef),
      tx.get(reverseBlockRef),
    ])

    if (blockSnap.exists || reverseBlockSnap.exists) {
      throw new HttpsError('permission-denied', 'Interaction unavailable for this account.')
    }

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

exports.reportUser = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'reportUser' })

  const targetUsername = normalizeUsername(request.data?.targetUsername)
  const reason = normalizeReportReason(request.data?.reason)
  const details = String(request.data?.details || '').trim().slice(0, REPORT_DETAIL_MAX_CHARS)

  assertValidXUsername(targetUsername)
  if (!REPORT_REASON_SET.has(reason)) {
    throw new HttpsError('invalid-argument', 'Invalid report reason.')
  }

  const userSnap = await db.collection('users').doc(uid).get()
  if (!userSnap.exists || !userSnap.data().username) {
    throw new HttpsError('failed-precondition', 'Your X profile is not synced. Sign out and sign in again.')
  }

  assertAcceptedConsent(userSnap.data())

  const reporterUsername = normalizeUsername(userSnap.data().username)
  if (reporterUsername === targetUsername) {
    throw new HttpsError('invalid-argument', 'You cannot report yourself.')
  }

  const targetIndexSnap = await db.collection('usernameIndex').doc(targetUsername).get()
  if (!targetIndexSnap.exists || !targetIndexSnap.data().uid) {
    throw new HttpsError('failed-precondition', 'Could not find that user.')
  }

  const reportRef = db.collection('reports').doc()
  await reportRef.set({
    reporterUid: uid,
    reporterUsername,
    reportedUid: String(targetIndexSnap.data().uid),
    reportedUsername: targetUsername,
    reason,
    details,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    purgeAt: admin.firestore.Timestamp.fromMillis(Date.now() + REPORT_RETENTION_MS),
  })

  return { ok: true, reportId: reportRef.id }
})

exports.blockUser = onCall(CALLABLE_OPTIONS, async (request) => {
  const blockerUid = assertXAuth(request)
  await enforceUserRateLimit({ uid: blockerUid, action: 'blockUser' })

  const targetUsername = normalizeUsername(request.data?.targetUsername)
  assertValidXUsername(targetUsername)

  const blockerSnap = await db.collection('users').doc(blockerUid).get()
  if (!blockerSnap.exists || !blockerSnap.data().username) {
    throw new HttpsError('failed-precondition', 'Your X profile is not synced. Sign out and sign in again.')
  }

  assertAcceptedConsent(blockerSnap.data())

  const blockerUsername = normalizeUsername(blockerSnap.data().username)
  if (blockerUsername === targetUsername) {
    throw new HttpsError('invalid-argument', 'You cannot block yourself.')
  }

  const targetIndexSnap = await db.collection('usernameIndex').doc(targetUsername).get()
  if (!targetIndexSnap.exists || !targetIndexSnap.data().uid) {
    throw new HttpsError('failed-precondition', 'Could not find that user.')
  }

  const blockedUid = String(targetIndexSnap.data().uid)
  const blockRef = db.collection('blocks').doc(buildBlockDocId(blockerUid, blockedUid))
  const existingBlockSnap = await blockRef.get()

  await blockRef.set(
    {
      blockerUid,
      blockedUid,
      blockerUsername,
      blockedUsername: targetUsername,
      createdAt: existingBlockSnap.exists
        ? existingBlockSnap.data().createdAt || admin.firestore.FieldValue.serverTimestamp()
        : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return { ok: true, blockedUid, blockedUsername: targetUsername }
})

exports.unblockUser = onCall(CALLABLE_OPTIONS, async (request) => {
  const blockerUid = assertXAuth(request)
  await enforceUserRateLimit({ uid: blockerUid, action: 'unblockUser' })

  const targetUsername = normalizeUsername(request.data?.targetUsername)
  assertValidXUsername(targetUsername)

  const blockerSnap = await db.collection('users').doc(blockerUid).get()
  if (!blockerSnap.exists || !blockerSnap.data().username) {
    throw new HttpsError('failed-precondition', 'Your X profile is not synced. Sign out and sign in again.')
  }

  assertAcceptedConsent(blockerSnap.data())

  const targetIndexSnap = await db.collection('usernameIndex').doc(targetUsername).get()
  if (targetIndexSnap.exists && targetIndexSnap.data().uid) {
    const blockedUid = String(targetIndexSnap.data().uid)
    const blockRef = db.collection('blocks').doc(buildBlockDocId(blockerUid, blockedUid))
    await blockRef.delete()
    return { ok: true }
  }

  const existingBlocksSnap = await db.collection('blocks').where('blockerUid', '==', blockerUid).get()
  const staleRefs = existingBlocksSnap.docs
    .filter((doc) => normalizeUsername(doc.data().blockedUsername) === targetUsername)
    .map((doc) => doc.ref)

  await deleteDocumentRefsInChunks(staleRefs)

  return { ok: true }
})

exports.deleteMyAccount = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'deleteMyAccount' })

  const confirmation = String(request.data?.confirmation || '').trim()
  if (confirmation !== 'DELETE') {
    throw new HttpsError('invalid-argument', 'Type DELETE to confirm account deletion.')
  }

  const userRef = db.collection('users').doc(uid)
  const statsRef = db.collection('stats').doc(uid)

  const [
    userSnap,
    matchesSnap,
    outgoingAdmirationsSnap,
    incomingAdmirationsSnap,
    blocksByUserSnap,
    blocksAgainstUserSnap,
    rateLimitsSnap,
    reportsByUserSnap,
    reportsAgainstUserSnap,
  ] = await Promise.all([
    userRef.get(),
    userRef.collection('matches').get(),
    db.collection('admirations').where('fromUid', '==', uid).get(),
    db.collection('admirations').where('toUid', '==', uid).get(),
    db.collection('blocks').where('blockerUid', '==', uid).get(),
    db.collection('blocks').where('blockedUid', '==', uid).get(),
    db.collection('rateLimits').where('uid', '==', uid).get(),
    db.collection('reports').where('reporterUid', '==', uid).get(),
    db.collection('reports').where('reportedUid', '==', uid).get(),
  ])

  const userData = userSnap.exists ? userSnap.data() : null
  const username = normalizeUsername(userData?.username)
  const xUserId = userData?.xUserId ? String(userData.xUserId) : ''

  const impactedUids = new Set()
  const refsToDelete = [userRef, statsRef]

  for (const matchDoc of matchesSnap.docs) {
    refsToDelete.push(matchDoc.ref)

    const otherUid = String(matchDoc.id || matchDoc.data().otherUid || '')
    if (otherUid) {
      impactedUids.add(otherUid)
      refsToDelete.push(db.collection('users').doc(otherUid).collection('matches').doc(uid))
    }
  }

  for (const admirerDoc of outgoingAdmirationsSnap.docs) {
    refsToDelete.push(admirerDoc.ref)
    const toUid = String(admirerDoc.data().toUid || '')
    if (toUid) {
      impactedUids.add(toUid)
    }
  }

  for (const admirerDoc of incomingAdmirationsSnap.docs) {
    refsToDelete.push(admirerDoc.ref)
    const fromUid = String(admirerDoc.data().fromUid || '')
    if (fromUid) {
      impactedUids.add(fromUid)
    }
  }

  for (const blockDoc of blocksByUserSnap.docs) {
    refsToDelete.push(blockDoc.ref)
  }

  for (const blockDoc of blocksAgainstUserSnap.docs) {
    refsToDelete.push(blockDoc.ref)
  }

  for (const limitDoc of rateLimitsSnap.docs) {
    refsToDelete.push(limitDoc.ref)
  }

  for (const reportDoc of reportsByUserSnap.docs) {
    refsToDelete.push(reportDoc.ref)
  }

  for (const impactedUid of impactedUids) {
    refsToDelete.push(db.collection('users').doc(impactedUid).collection('matches').doc(uid))
  }

  if (username) {
    refsToDelete.push(db.collection('usernameIndex').doc(username))
  }

  if (xUserId) {
    refsToDelete.push(db.collection('xUserIndex').doc(xUserId))
  }

  await deleteDocumentRefsInChunks(refsToDelete)

  const anonymizedReportUpdates = reportsAgainstUserSnap.docs.map((doc) => ({
    ref: doc.ref,
    data: {
      reportedUid: null,
      reportedUsername: '[deleted]',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      anonymizedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }))

  await updateDocumentRefsInChunks(anonymizedReportUpdates)

  await recalculateStatsForUsers(Array.from(impactedUids))

  try {
    await admin.auth().deleteUser(uid)
  } catch (error) {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error ? error.code : ''
    if (errorCode !== 'auth/user-not-found') {
      throw error
    }
  }

  return { ok: true }
})

exports.getDashboard = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = assertXAuth(request)
  await enforceUserRateLimit({ uid, action: 'getDashboard' })
  const userRef = db.collection('users').doc(uid)
  const statsRef = db.collection('stats').doc(uid)

  const [userSnap, statsSnap, matchesSnap, sentAdmirersSnap, blockedByUserSnap, blockedIncomingSnap] = await Promise.all([
    userRef.get(),
    statsRef.get(),
    db.collection('users').doc(uid).collection('matches').orderBy('createdAt', 'desc').limit(20).get(),
    db.collection('admirations').where('fromUid', '==', uid).get(),
    db.collection('blocks').where('blockerUid', '==', uid).get(),
    db.collection('blocks').where('blockedUid', '==', uid).get(),
  ])

  const blockedInEitherDirection = new Set()

  const blockedUsers = blockedByUserSnap.docs
    .map((doc) => {
      const data = doc.data()
      const blockedUid = String(data.blockedUid || '')
      if (blockedUid) {
        blockedInEitherDirection.add(blockedUid)
      }
      return {
        uid: blockedUid,
        username: String(data.blockedUsername || ''),
        createdAt: data.createdAt || null,
      }
    })
    .filter((entry) => entry.uid && entry.username)

  for (const doc of blockedIncomingSnap.docs) {
    const blockerUid = String(doc.data().blockerUid || '')
    if (blockerUid) {
      blockedInEitherDirection.add(blockerUid)
    }
  }

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
    .filter((item) => item.toUid && item.toUsername && !blockedInEitherDirection.has(item.toUid))
    .sort((a, b) => {
      const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0
      const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0
      return bTime - aTime
    })
    .slice(0, MAX_OUTGOING)

  const matches = matchesSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((match) => !blockedInEitherDirection.has(String(match.otherUid || '')))

  return {
    username: userSnap.exists ? userSnap.data().username : null,
    incomingCount: statsSnap.exists ? Number(statsSnap.data().incomingCount || 0) : 0,
    outgoingCount: statsSnap.exists ? Number(statsSnap.data().outgoingCount || 0) : 0,
    maxOutgoing: MAX_OUTGOING,
    matches,
    sentAdmirers,
    consentRequired: !hasAcceptedCurrentPolicies(userSnap.exists ? userSnap.data() : null),
    blockedUsers,
  }
})
