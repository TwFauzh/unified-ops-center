const COLLECTION = "opscenter_maintenance_state";
const DOC_ID = "global";

function docRef(admin) {
  return admin.firestore().collection(COLLECTION).doc(DOC_ID);
}

async function getState(admin) {
  const snap = await docRef(admin).get();
  if (!snap.exists) {
    return {
      mode: "NORMAL",
      updatedAt: null,
      updatedBy: null,
      whitelistEnabled: null,
      whitelistUpdatedAt: null,
      whitelistUpdatedBy: null,
    };
  }
  const d = snap.data() || {};
  return {
    mode: d.mode || "NORMAL",
    updatedAt: d.updatedAt ? d.updatedAt.toDate?.() || null : null,
    updatedBy: d.updatedBy || null,
    whitelistEnabled: typeof d.whitelistEnabled === "boolean" ? d.whitelistEnabled : null,
    whitelistUpdatedAt: d.whitelistUpdatedAt ? d.whitelistUpdatedAt.toDate?.() || null : null,
    whitelistUpdatedBy: d.whitelistUpdatedBy || null,
  };
}

async function trySetMaintenance(admin, { toMode, operator }) {
  const ref = docRef(admin);
  return await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data()?.mode || "NORMAL") : "NORMAL";

    if (toMode === "MAINTENANCE" && cur === "MAINTENANCE") {
      return { ok: false, reason: "ALREADY_MAINTENANCE", cur };
    }
    if (toMode === "NORMAL" && cur === "NORMAL") {
      return { ok: false, reason: "ALREADY_NORMAL", cur };
    }

    tx.set(
      ref,
      {
        mode: toMode,
        updatedBy: operator || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { ok: true, from: cur, to: toMode };
  });
}

async function setWhitelistState(admin, { enabled, operator }) {
  const ref = docRef(admin);
  await ref.set(
    {
      whitelistEnabled: Boolean(enabled),
      whitelistUpdatedBy: operator || null,
      whitelistUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function getWhitelistState(admin) {
  const snap = await docRef(admin).get();
  if (!snap.exists) {
    return { enabled: null, updatedAt: null, updatedBy: null };
  }
  const d = snap.data() || {};
  return {
    enabled: typeof d.whitelistEnabled === "boolean" ? d.whitelistEnabled : null,
    updatedAt: d.whitelistUpdatedAt ? d.whitelistUpdatedAt.toDate?.() || null : null,
    updatedBy: d.whitelistUpdatedBy || null,
  };
}

module.exports = { getState, trySetMaintenance, setWhitelistState, getWhitelistState };
